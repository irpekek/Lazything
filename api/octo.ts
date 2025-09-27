import { Octokit } from 'octokit';
import { getAuthKey } from '../utils/authUtil.ts';
import { GhMeta } from '../types/git.type.d.ts';

const COMMIT_ENDPOINT = 'GET /repos/{owner}/{repo}/commits';
const SEARCH_CODE_ENDPOINT = 'GET /search/code';
const BLOB_ENDPOINT = 'GET /repos/{owner}/{repo}/git/blobs/{file_sha}';
const octo = new Octokit({ auth: getAuthKey() });

/**
 * Retrieves the date of the latest commit for a given file path in a repository.
 *
 * @param owner The owner of the repository.
 * @param repo The name of the repository.
 * @param path The path to the file within the repository.
 * @returns A Promise that resolves to the commit date string, or `undefined` if not found.
 * @throws {Error} If the commit date cannot be retrieved.
 */
export async function getLatestCommitDate(
  owner: string,
  repo: string,
  path: string,
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

/**
 * Searches for a repository that contains a proxy configuration file.
 *
 * @param domain The domain of the website that points to the proxy.
 * @returns A Promise that resolves to a list of metadata about the repository, or `undefined` if not found.
 * @throws {Error} If the commit date cannot be retrieved.
 */
export async function searchRepo(domain: string): Promise<GhMeta[]> {
  const query = `"proxies:" ${domain} language:yaml`;
  try {
    const response = await octo.paginate(SEARCH_CODE_ENDPOINT, {
      q: query,
      per_page: 100, // max repository per one request
    });
    return response;
  } catch (error) {
    throw new Error(`Failed to find the repository: ${error}`);
  }
}

/**
 * Retrieves the content of a file in a repository.
 *
 * @param owner The owner of the repository.
 * @param repo The name of the repository.
 * @param file_sha The sha of the file.
 * @returns A Promise that resolves to the content of the file, or `undefined` if not found.
 * @throws {Error} If the commit date cannot be retrieved.
 */
export async function getBlob(owner: string, repo: string, file_sha: string) {
  try {
    const response = await octo.request(BLOB_ENDPOINT, {
      owner,
      repo,
      file_sha,
    });
    if (response.status !== 200)
      throw new Error(
        `Error while fetching proxies with status ${response.status}`,
      );
    return response;
  } catch (error) {
    throw new Error(`Failed getting blob: ${error}`);
  }
}
