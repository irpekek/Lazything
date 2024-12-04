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

type ProxyType = ITrojanProxy | IVmessProxy

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
): Promise<object[]> {
  try {
    const response = await octo.request(
      'GET /repos/{owner}/{repo}/git/blobs/{file_sha}',
      { owner, repo, file_sha }
    );
    if (response.status !== 200)
      throw new Error('Error while fetching yaml data');

    const buffer = Buffer.from(response.data.content, 'base64');
    const dataYaml = buffer.toString('utf-8');
    const result = YAML.parse(dataYaml);
    return result.proxies;
  } catch (_error) {
    throw new Error('Error while fetching yaml data');
  }
}
const hostname = 'vplay.iflix.com';
const query = `${hostname} language:yaml`;

const octo = new Octokit({
  auth: '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',
});


const response = await octo.request('GET /search/code', {
  q: query,
});


const items = response.data.items;
const proxies: object[] = [];
const listedPass: string[] = [];

for (const item of items) {
  const owner = item.repository.owner.login;
  const repo = item.repository.name;
  const sha = item.sha;
  const proxiesResult = await getProxies(owner, repo, sha);
  if (proxiesResult) {
    for (const proxy of proxiesResult) {
      if (isTrojan(proxy)) addProxy(proxy, proxy.password);
      if (isVmess(proxy)) addProxy(proxy, proxy.uuid);
    }
  }
}

function addProxy(proxy: ProxyType, password: string) {
  const findPass = listedPass.find((e) => e === password);
  if (!findPass) {
    proxies.push(proxy);
    listedPass.push(password);
  }
}

Deno.writeTextFile('result.json', JSON.stringify(proxies));
