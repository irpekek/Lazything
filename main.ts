import { Octokit } from 'octokit';
import { Buffer } from 'node:buffer';
import YAML from 'yaml';

interface IGhMeta {
  name: string;
  path: string;
  sha: string;
  url: string;
  git_url: string;
  repository: object;
  score: number;
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

async function getProxies(
  owner: string,
  repo: string,
  file_sha: string
): Promise<object[] | null> {
  try {
    const response = await octo.request(
      'GET /repos/{owner}/{repo}/git/blobs/{file_sha}',
      { owner, repo, file_sha }
    );
    if (response.status !== 200)
      throw new Error(`Error while fetching with status ${response.status}`);

    const buffer = Buffer.from(response.data.content, 'base64');
    const dataYaml = buffer.toString('utf-8');
    const result = YAML.parse(dataYaml, { maxAliasCount: -1 });
    return typeof result === 'object' && 'proxies' in result
      ? result.proxies
      : null;
  } catch (_error) {
    console.log(_error);
    throw new Error('Error while fetching yaml data');
  }
}

async function findProxyRepo(domain: string) {
  const query = `${domain} language:yaml`;
  try {
    const response = await octo.paginate('GET /search/code', {
      q: query,
      per_page: 100,
    });
    return response
  } catch (_error) {
    throw new Error('Error while finding repo');
  }
}

const hostname = 'quiz.int.vidio.com';

const octo = new Octokit({
  auth: getAuthKey(),
});
const proxies: object[] = [];
const listedPass: string[] = [];

async function main() {
  const items = await findProxyRepo(hostname);
  const total_count = items.length
  console.log(`Found: ${total_count} repository`);
  for (const [index, item] of items.entries()) {
    const owner = item.repository.owner.login;
    const repo = item.repository.name;
    const sha = item.sha;
    console.log(`Fetching ${index + 1} of ${total_count}: ${repo} - ${owner}`);
    const proxiesResult = await getProxies(owner, repo, sha);
    if (proxiesResult) {
      for (const proxy of proxiesResult) {
        if (isTrojan(proxy)) addProxy(proxy, proxy.password);
        if (isVmess(proxy)) addProxy(proxy, proxy.uuid);
      }
    }
  }

  const resultFile = `proxies ${getFullDate()}.json`;
  Deno.writeTextFileSync(`${resultFile}`, JSON.stringify(proxies));
  console.log(`Result saved at ${resultFile}`);
}

function addProxy(proxy: ProxyType, password: string) {
  // * Prevent duplicate proxy
  const findPass = listedPass.find((e) => e === password);
  if (!findPass) {
    proxies.push(proxy);
    listedPass.push(password);
  }
}

function getFullDate(): string {
  const dt = Date.now();
  const year = new Date(dt).getFullYear();
  const date = new Date(dt).getDate();
  const month = new Date(dt).getMonth();
  const hour = new Date(dt).getHours();
  const minutes = new Date(dt).getMinutes();
  const second = new Date(dt).getSeconds();
  return `${date}-${month}-${year} ${hour}:${minutes}:${second}`;
}

function getAuthKey(): string {
  return Deno.readTextFileSync('auth.txt');
}

function _setAuthKey(key: string): void {
  Deno.writeTextFileSync('auth.txt', key);
}

main();
// findProxyRepo(hostname)