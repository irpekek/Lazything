import { Octokit } from 'octokit';
import { Buffer } from 'node:buffer';
import YAML, { YAMLError } from 'yaml';
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
    console.log(error);
    throw new Error('Error getting commit date');
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

    const buffer = Buffer.from(response.data.content, 'base64');
    const dataYaml = buffer.toString('utf-8');
    const result = YAML.parse(dataYaml, { maxAliasCount: -1 });
    return hasProxies(result) ? result.proxies : null;
  } catch (_error) {
    if (isYAMLError(_error)) {
      if (_error.code === 'BLOCK_AS_IMPLICIT_KEY') return null;
      if (_error.code === 'DUPLICATE_KEY') return null;
    }
    console.log(_error);
    throw new Error('Error while fetching proxies');
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
  } catch (_error) {
    console.log(_error);
    throw new Error('Error while finding repo');
  }
}

async function filterByMonths(
  items: IGhMeta[],
  months = 3
): Promise<IGhMeta[]> {
  const filteredItems = [];
  for (const item of items) {
    const owner = item.repository.owner.login;
    const repo = item.repository.name;
    const path = item.path;
    const itemDate = await getLatestCommitDate(owner, repo, path);
    if (itemDate) {
      const commitDate = DateTime.fromISO(itemDate).toMillis();
      const choosenDate = DateTime.now().minus({ months }).toMillis(); // * 3 months ago
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
const proxies: object[] = [];
const listPass = new Set<string>();

async function fetchAndSaveProxies(domain: string, month = 3): Promise<void> {
  const items = await findProxyRepo(domain);
  // * filter items by months
  const filteredItems = await filterByMonths(items, month);
  const total_count = filteredItems.length;
  console.log(`Found: ${total_count} repository`);
  for (const [index, item] of filteredItems.entries()) {
    const owner = item.repository.owner.login;
    const repo = item.repository.name;
    const sha = item.sha;
    console.log(`Fetching ${index + 1} of ${total_count}: ${repo} - ${owner}`);
    const proxies = await getProxies(owner, repo, sha);
    if (proxies) {
      for (const proxy of proxies) {
        if (isTrojan(proxy)) saveProxy(proxy, proxy.password);
        if (isVmess(proxy)) saveProxy(proxy, proxy.uuid);
      }
    }
  }

  const resultFile = `proxies ${getFullDate()}.yaml`;
  Deno.writeTextFileSync(`${resultFile}`, YAML.stringify({ proxies }));
  console.log(`Result saved at ${resultFile}`);
}

fetchAndSaveProxies("vplay.iflix.com");
