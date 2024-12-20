import { Octokit } from 'octokit';
import { IGhMeta } from '../main.ts';
import { getAuthKey } from "../utils/authUtil.ts";

const COMMIT_ENDPOINT = 'GET /repos/{owner}/{repo}/commits';
const SEARCH_CODE_ENDPOINT = 'GET /search/code';
const BLOB_ENDPOINT = 'GET /repos/{owner}/{repo}/git/blobs/{file_sha}';
const octo = new Octokit({ auth: getAuthKey() });

export async function getLatestCommitDate(
  owner: string,
  repo: string,
  path: string
): Promise<string | undefined> {
  try {
    const response = await octo.request(COMMIT_ENDPOINT, {
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

export async function searchRepo(domain: string): Promise<IGhMeta[]> {
  const query = `"proxies:" ${domain} language:yaml`;
  try {
    const response = await octo.paginate(SEARCH_CODE_ENDPOINT, {
      q: query,
      per_page: 100,
    });
    return response;
  } catch (error) {
    throw new Error(`Failed to find the repository: ${error}`);
  }
}

export async function getBlob(owner: string, repo: string, file_sha: string) {
  try {
    const response = await octo.request(BLOB_ENDPOINT, {
      owner,
      repo,
      file_sha,
    });
    if (response.status !== 200)
      throw new Error(
        `Error while fetching proxies with status ${response.status}`
      );
    return response;
  } catch (error) {
    throw new Error(`Failed getting blob: ${error}`);
  }
}
