#!/usr/bin/env -S deno run -A --ext=ts
import { loading } from 'cli-loading-animation';
import logUpdate from 'log-update';
import { DateTime } from 'luxon';
import { Buffer } from 'node:buffer';
import pLimit from 'p-limit';
import YAML, { YAMLError } from 'yaml';
import { getBlob, getLatestCommitDate, searchRepo } from './api/octo.ts';
import { cacheDir, dateCache, proxyCache } from './configs/cacheConfig.ts';
import { getAuthKey, setAuthKey } from './utils/authUtil.ts';

export interface IGhMeta {
  name: string;
  path: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  repository: IGhRepo;
  score: number;
}
interface IGhRepo {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  owner: IGhRepoOwner;
}
interface IGhRepoOwner {
  login: string;
  id: number;
  node_id: string;
}
interface IGhUrl {
  sha: string;
  node_id: string;
  size: number;
  url: string;
  content: string;
  encoding: string;
}
interface IWsOpts {
  path: string;
  headers: string;
}
export interface IProxy {
  name: string;
  type: string;
  server: string;
  port: number;
  udp?: boolean;
  sni?: string;
  network: string;
  'ws-opts': IWsOpts;
}
interface ITrojanProxy extends IProxy {
  password: string;
}
interface IVmessProxy extends IProxy {
  uuid: string;
}

type ProxyType = ITrojanProxy | IVmessProxy;

function isVmess(obj: unknown): obj is IVmessProxy {
  return obj !== null && typeof obj === 'object' && 'uuid' in obj;
}
function isTrojan(obj: unknown): obj is ITrojanProxy {
  return obj !== null && typeof obj === 'object' && 'password' in obj;
}
export function isYAMLError(obj: unknown): obj is YAMLError {
  return obj !== null && typeof obj === 'object' && 'code' in obj;
}
export function hasProxies(obj: unknown): boolean {
  return obj !== null && typeof obj === 'object' && 'proxies' in obj;
}

function styleBlockToFlow(content: string): string {
  return content
    .replace(/-\s*{/g, '- ')
    .replace(/, /g, '\n    ')
    .replace(/:\s*{path:/g, ':\n      path:')
    .replace(/headers:\s*{/g, '  headers: {')
    .replace(/:\s*{Host:/g, ':\n        Host:')
    .replace(/}/g, '');
}

async function getProxies(
  owner: string,
  repo: string,
  file_sha: string
): Promise<IProxy[] | null> {
  try {
    const response = await getBlob(owner, repo, file_sha);
    const contentBuffer = Buffer.from(response.data.content, 'base64');
    const yamlContent = contentBuffer.toString('utf-8');
    const flowStyle = styleBlockToFlow(yamlContent);
    const parsedYaml = YAML.parse(flowStyle, { maxAliasCount: -1 });
    return hasProxies(parsedYaml) ? parsedYaml.proxies : null;
  } catch (error) {
    if (isYAMLError(error)) {
      //@ Too many shitty configuration from cloud, so replace it with null
      // if (
      //   error.code === 'BLOCK_AS_IMPLICIT_KEY' ||
      //   error.code === 'DUPLICATE_KEY' ||
      //   error.code === 'MULTILINE_IMPLICIT_KEY'
      // )
      //   return null;

      return null;
    } else {
      throw new Error(`Error fetching proxies: ${error}`);
    }
  }
}

async function filterByMonths(
  items: IGhMeta[],
  months = 3
): Promise<IGhMeta[]> {
  const filteredItems: IGhMeta[] = [];
  const limit = pLimit(50);

  const datePromises = items.map((item) => {
    return limit(async () => {
      const {
        repository: {
          owner: { login: owner },
          name: repo,
        },
        path,
        sha,
      } = item;

      let itemDate = dateCache.get<string | undefined>(sha);

      if (!itemDate) {
        itemDate = await getLatestCommitDate(owner, repo, path);
        dateCache.set(sha, itemDate);
      }

      if (itemDate) {
        const commitDate = DateTime.fromISO(itemDate).toMillis();
        const choosenDate = DateTime.now().minus({ months }).toMillis();
        if (commitDate >= choosenDate) filteredItems.push(item);
      }
    });
  });

  for (let i = 0; i < datePromises.length; i += 50) {
    await Promise.all(datePromises.slice(i, i + 50));
    if (i + 50 < datePromises.length) {
      await sleep(70000); // Wait for 70second
    }
  }

  return filteredItems;
}

function saveProxy(proxy: ProxyType, password: string): void {
  // * Prevent duplicate proxy
  if (!listPass.has(password)) {
    proxies.push(proxy);
    listPass.add(password);
  }
}

function getFullDate(): string {
  return `${DateTime.now().toFormat('dd-MM-yyyy HH:mm:ss')}`; // ex: 10-12-2024 13:35:47
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
dateCache.load('dateCache', cacheDir);
proxyCache.load('proxyCache', cacheDir);
const proxies: IProxy[] = [];
const listPass = new Set<string>();
const { start: startSearchAnim, stop: stopSearchAnim } = loading(
  'Searching repository...'
);
const { start: startFilterAnim, stop: stopFilterAnim } = loading(
  'Filtering repository...'
);

async function fetchAndSaveProxies(domain: string, month = 3): Promise<void> {
  startSearchAnim();
  const items = await searchRepo(domain);
  stopSearchAnim();
  logUpdate(`Filtering ${items.length} proxy`);
  sleep(1000);
  if (items.length >= 300)
    logUpdate('Too many repositories found, filtering may take a while');
  sleep(2000);
  logUpdate.clear();
  startFilterAnim();
  const filteredItems = await filterByMonths(items, month);
  stopFilterAnim();
  const totalCount = filteredItems.length;
  logUpdate(`Found: ${totalCount} repository`);
  if (totalCount === 0) Deno.exit();
  await sleep(3000);
  logUpdate.clear();

  const limit = pLimit(50); // Throttle every 50 concurrent request

  const promiseProxy = filteredItems.map((item, index) => {
    return limit(async () => {
      const {
        repository: {
          owner: { login: owner },
          name: repo,
        },
        sha,
      } = item;

      logUpdate(`Fetching ${index + 1} of ${totalCount}: ${repo} - ${owner}`);
      let proxies = proxyCache.get<IProxy[] | undefined | null>(sha);
      if (!proxies) {
        proxies = await getProxies(owner, repo, sha);
        proxyCache.set(sha, proxies);
      }

      if (proxies) {
        for (const proxy of proxies) {
          if (isTrojan(proxy)) saveProxy(proxy, proxy.password);
          if (isVmess(proxy)) saveProxy(proxy, proxy.uuid);
        }
      }
    });
  });

  for (let i = 0; i < promiseProxy.length; i += 50) {
    await Promise.all(promiseProxy.slice(i, i + 50));
    if (i + 50 < promiseProxy.length) {
      await sleep(1000 * 90); // Wait for 90 Second
    }
  }
  await sleep(2000);
  logUpdate.clear();
  logUpdate(`Found: ${proxies.length} proxies`);
  dateCache.save();
  proxyCache.save();
  const fileName = `proxies ${getFullDate()}.yaml`;
  Deno.writeTextFileSync(`${fileName}`, YAML.stringify({ proxies }));
  await sleep(2000);
  logUpdate(`Result saved at ${fileName}`);
  setTimeout(() => Deno.exit(), 3000);
}

function filterCommand(val: string) {
  const month = Number(val);
  if (Deno.args[2] && !isNaN(month)) fetchAndSaveProxies(Deno.args[2], month);
}

function printHelp(): void {
  console.log(`
    Usage: Lazything [options] <domain>\n
    Argument:
    <domain> \t Domain to search proxy\n
    Options:
      -k, --key <str> \t\t Set GitHub authentication key
      -f, --filter <num> \t Filter result by months (default = 3)\n
    Examples:
      lazything -k foobar \t\t Set GitHub authentication key to "foobar"
      lazything -f 3 foo.bar.baz \t Filter proxies for "foo.bar.baz" within the last 3 months
      lazything --filter 3 foo.bar.baz \t Same as above using long option
      lazything foo.bar.baz \t\t Search for proxies in "foo.bar.baz" without filtering
      lazything -h, --help \t\t Display this help message
    `);
}

function main(): void {
  const OPTIONS = {
    FILTER: ['-f', '--filter'],
    KEY: ['-k', '--key'],
    HELP: ['-h', '--help'],
  };
  const args = Deno.args;
  const opts = args[0];
  const val = args[1];
  const key = getAuthKey();
  if (args.length === 0) {
    printHelp();
    return;
  }
  switch (true) {
    case OPTIONS.KEY.includes(opts):
      setAuthKey(val);
      break;
    case OPTIONS.FILTER.includes(opts):
      if (key) filterCommand(val);
      else console.error('Authentication key is required for filtering.');
      break;
    case OPTIONS.HELP.includes(opts):
      printHelp();
      break;
    default:
      if (key) fetchAndSaveProxies(args[0]);
      else console.error('Authentication key is required for filtering.');
      break;
  }
}

main();
