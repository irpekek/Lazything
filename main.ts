#!/usr/bin/env -S deno run -A --ext=ts
import { Octokit } from 'octokit';
import { Buffer } from 'node:buffer';
import YAML, { YAMLError } from 'yaml';
import { dateCache, proxyCache, cacheDir } from './configs/cacheConfig.ts';
// @deno-types="@types/luxon"
import { DateTime } from 'luxon';

interface IGhMeta {
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
interface IProxy {
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
function isYAMLError(obj: unknown): obj is YAMLError {
  return obj !== null && typeof obj === 'object' && 'code' in obj;
}
function hasProxies(obj: unknown): boolean {
  return obj !== null && typeof obj === 'object' && 'proxies' in obj;
}

async function getLatestCommitDate(
  owner: string,
  repo: string,
  path: string
): Promise<string | undefined> {
  try {
    const response = await octo.request('GET /repos/{owner}/{repo}/commits', {
      owner,
      repo,
      path,
      per_page: 1,
    });
    return response.data[0].commit.committer?.date;
  } catch (error) {
    throw new Error(`Failed to retrieve commit date: ${error}`);
  }
}

async function getProxies(
  owner: string,
  repo: string,
  file_sha: string
): Promise<IProxy[] | null> {
  try {
    const response = await octo.request(
      'GET /repos/{owner}/{repo}/git/blobs/{file_sha}',
      { owner, repo, file_sha }
    );
    if (response.status !== 200)
      throw new Error(
        `Error while fetching proxies with status ${response.status}`
      );

    const contentBuffer = Buffer.from(response.data.content, 'base64');
    const yamlContent = contentBuffer.toString('utf-8');
    const parsedYaml = YAML.parse(yamlContent, { maxAliasCount: -1 });
    return hasProxies(parsedYaml) ? parsedYaml.proxies : null;
  } catch (error) {
    if (isYAMLError(error)) {
      if (
        error.code === 'BLOCK_AS_IMPLICIT_KEY' ||
        error.code === 'DUPLICATE_KEY'
      )
        return null;
      throw new Error(`YAML parsing error: ${error.message}`);
    } else {
      throw new Error(`Error fetching proxies: ${error}`);
    }
  }
}

async function findProxyRepo(domain: string): Promise<IGhMeta[]> {
  const query = `${domain} language:yaml`;
  try {
    const response = await octo.paginate('GET /search/code', {
      q: query,
      per_page: 100,
    });
    return response;
  } catch (error) {
    throw new Error(`Failed to find the repository: ${error}`);
  }
}

async function filterByMonths(
  items: IGhMeta[],
  months = 3
): Promise<IGhMeta[]> {
  const filteredItems: IGhMeta[] = [];
  for (const item of items) {
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

function getAuthKey(): string {
  return Deno.readTextFileSync('auth.txt');
}

function setAuthKey(key: string): void {
  Deno.writeTextFileSync('auth.txt', key);
}

const octo = new Octokit({ auth: getAuthKey() });

dateCache.load('dateCache', cacheDir);
proxyCache.load('proxyCache', cacheDir);
const proxies: object[] = [];
const listPass = new Set<string>();

async function fetchAndSaveProxies(domain: string, month = 3): Promise<void> {
  const items = await findProxyRepo(domain);
  const filteredItems = await filterByMonths(items, month);
  const totalCount = filteredItems.length;
  console.log(`Found: ${totalCount} repository`);
  for (const [index, item] of filteredItems.entries()) {
    const {
      repository: {
        owner: { login: owner },
        name: repo,
      },
      sha,
    } = item;

    console.log(`Fetching ${index + 1} of ${totalCount}: ${repo} - ${owner}`);
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
  }
  dateCache.save();
  proxyCache.save();
  const fileName = `proxies ${getFullDate()}.yaml`;
  Deno.writeTextFileSync(`${fileName}`, YAML.stringify({ proxies }));
  console.log(`Result saved at ${fileName}`);
  setTimeout(() => Deno.exit(), 3000);
}

// * Command Prog func

function filterCommand(val: string) {
  const month = Number(val);
  if (Deno.args[2] && !isNaN(month)) fetchAndSaveProxies(Deno.args[2], month);
}

function printHelp(): void {
  console.log('Usage: Lazything [options] <domain>\n');
  console.log('Argument:\n<domain> \t Domain to search proxy\n');
  console.log('Options:');
  console.log('  -k, --key <str> \t Set GitHub authentication key');
  console.log(
    '  -f, --filter <num> \t Filter result by months (default = 3)\n'
  );
  console.log('Examples:');
  console.log(
    '  lazything -k foobar \t\t\t Set GitHub authentication key to "foobar"'
  );
  console.log(
    '  lazything -f 3 foo.bar.baz \t\t Filter proxies for "foo.bar.baz" within the last 3 months'
  );
  console.log(
    '  lazything --filter 3 foo.bar.baz \t Same as above using long option'
  );
  console.log(
    '  lazything foo.bar.baz \t\t Search for proxies in "foo.bar.baz" without filtering'
  );
  console.log('  lazything -h, --help \t\t\t Display this help message');
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
  if (args.length < 2) {
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
