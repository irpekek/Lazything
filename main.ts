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

interface IProxie {
  name: string;
  type: string;
  server: string;
  port: number;
  password: string;
  udp?: boolean;
  sni?: string;
  network: string;
  'ws-opts': IWsOpts;
}

async function fetchItem(url: string): Promise<IProxie[] | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Error while fetching yaml data');
    const data = await response.json();
    if (data != null && 'content' in data && typeof data === 'object') {
      const buffer = Buffer.from(data.content, 'base64');
      const dataYaml = buffer.toString('utf-8');
      const result = YAML.parse(dataYaml);
      return result.proxies;
    }
    return null;
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
const proxies: IProxie[] = [];
for (const item of items) {
  const proxiesResult = await fetchItem(item.git_url);
  let prevUUID = ''
  if(proxiesResult){
    for (const proxie of proxiesResult) {
      if (proxie.password !== prevUUID) proxies.push(proxie);
      prevUUID = proxie.password
    }
  }
}

Deno.writeTextFile('result.json', JSON.stringify(proxies));
