import { Buffer } from 'node:buffer';
import { getBlob, getLatestCommitDate, searchRepo } from '../api/octo.ts';
import { IProxy, ProxyType } from '../types/proxy.type.d.ts';
import { styleBlockToFlow } from '../utils/yamlUtil.ts';
import YAML from 'yaml';
import { isTrojan, isVmess, isYAMLError } from '../types/guards.ts';
import pLimit from 'p-limit';
import { GhMeta } from '../types/git.type.d.ts';
import { DateTime } from 'luxon';
import { getFullDate, logUpdateSleep } from '../utils/utils.ts';
import { loading } from 'cli-loading-animation';
import { dCache, pCache } from '../main.ts';

export class ProxyService {
  private readonly limit = pLimit(50); // Throttle every 50 concurrent request
  protected readonly SLEEP_DURATION = 10 * 1000; // 10 seconds

  /**
   * Checks if the given object has a 'proxies' property.
   * @param obj The object to check.
   * @returns True if the object has a 'proxies' property, false otherwise.
   */
  private hasProxies(obj: unknown): boolean {
    return obj !== null && typeof obj === 'object' && 'proxies' in obj;
  }

  /**
   * Fetches and parses a given GitHub blob to extract a list of proxies.
   * @param owner The owner of the GitHub repository.
   * @param repo The name of the GitHub repository.
   * @param sha The SHA of the file to fetch.
   * @returns A Promise that resolves to an array of IProxy or null if fetching/parsing fails or no proxies are found.
   */
  private async listProxies(
    owner: string,
    repo: string,
    sha: string,
  ): Promise<IProxy[] | null> {
    try {
      const response = await getBlob(owner, repo, sha);
      const contentBuffer = Buffer.from(response.data.content, 'base64');
      const yamlContent = contentBuffer.toString('utf-8');
      const flowStyle = styleBlockToFlow(yamlContent);
      const parsedYaml = YAML.parse(flowStyle, { maxAliasCount: -1 });
      return this.hasProxies(parsedYaml) ? parsedYaml.proxies : null;
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
        return null;
      }
    }
  }

  /**
   * Filters GitHub items by commit date (within months).
   * @param items An array of GhMeta to filter.
   * @param months The number of months back from the current date to consider for filtering (Default=3).
   * @returns A Promise that resolves to an array of GhMeta that meet the date criteria.
   */
  private async filterByMonths(items: GhMeta[], months = 3): Promise<GhMeta[]> {
    const filteredItems: GhMeta[] = [];
    const { start: startFilterAnim, stop: stopFilterAnim } = loading(
      `Filtering repository from ${months} months back...`,
    );

    const missCacheResults = await Promise.all(
      items.map(async (item) => {
        const { sha } = item;
        try {
          const itemDate = await dCache.get<string>(sha);
          if (!itemDate) return item; // Keep item if cache miss
          else {
            filteredItems.push(item); // Cache hit
            return null;
          }
        } catch (error: unknown) {
          console.log(error);
          return null;
        }
      }),
    );

    const missCache = missCacheResults.filter(
      (item): item is GhMeta => item !== null,
    );

    startFilterAnim();
    const datePromises = missCache.map((item) => {
      return this.limit(async () => {
        const {
          repository: {
            owner: { login: owner },
            name: repo,
          },
          path,
          sha,
        } = item;

        const itemDate = await getLatestCommitDate(owner, repo, path);

        if (itemDate) {
          try {
            await dCache.set(sha, itemDate);
          } catch (error) {
            console.log(error);
          }
          const commitDate = DateTime.fromISO(itemDate).toMillis();
          const choosenDate = DateTime.now().minus({ months }).toMillis();
          if (commitDate >= choosenDate) filteredItems.push(item);
        }
      });
    });

    for (let i = 0; i < datePromises.length; i += 50) {
      await Promise.all(datePromises.slice(i, i + 50));
      if (i + 50 < datePromises.length) {
        stopFilterAnim();
        await logUpdateSleep(
          `Filter: Throttling, wait for ${this.SLEEP_DURATION / 1000} seconds`,
          this.SLEEP_DURATION,
        );
        startFilterAnim();
      }
    }
    stopFilterAnim();

    return filteredItems;
  }

  /**
   * Saves a proxy if not duplicate (using password/uuid as key).
   * @param proxy The proxy to save.
   * @param password The unique key (password or uuid).
   * @param proxies The array to append to.
   * @param listPass The Set to check duplicates.
   */
  private saveProxy(
    proxy: ProxyType,
    password: string,
    proxies: IProxy[],
    listPass: Set<string>,
  ): void {
    // Prevent duplicate proxy
    if (!listPass.has(password)) {
      proxies.push(proxy);
      listPass.add(password);
    }
  }

  /**
   * Orchestrates discovery (search, filter, fetch/parse) and export (cache, file save) of proxies for a given domain.
   * @param domain The domain to search.
   * @param months Filter by months (default 3).
   * @returns The list of collected proxies.
   */
  public async discoverProxies(domain: string, month = 3): Promise<void> {
    const { start: startSearchAnim, stop: stopSearchAnim } = loading(
      'Searching repository...',
    );
    const { start: startFetchProxiesAnim, stop: stopFetchProxiesAnim } =
      loading(`Fetching proxies...`);

    const timeStart = Date.now();
    startSearchAnim();
    const items = await searchRepo(domain);
    stopSearchAnim();
    await logUpdateSleep(`Filtering ${items.length} Items`, 1000);
    if (items.length >= 300) {
      await logUpdateSleep(
        'Too many repositories found, filtering may take a while',
        2000,
      );
    }

    const filteredItems = await this.filterByMonths(items, month);

    const totalCount = filteredItems.length;
    await logUpdateSleep(`Found: ${totalCount} repository`, 3000);
    if (totalCount === 0) Deno.exit(1);

    const proxies: IProxy[] = [];
    const listPass = new Set<string>();

    const missCacheResults = await Promise.all(
      filteredItems.map(async (item) => {
        const { sha } = item;
        try {
          const pc = await pCache.get<IProxy[]>(sha);
          if (pc === undefined || pc === null) return item; // Cache miss
          else {
            for (const p of pc) {
              if (isTrojan(p)) this.saveProxy(p, p.password, proxies, listPass);
              if (isVmess(p)) this.saveProxy(p, p.uuid, proxies, listPass);
            }
            return null; // Cache hit
          }
        } catch (error) {
          console.log(error);
          return null;
        }
      }),
    );

    const missCache = missCacheResults.filter(
      (item): item is GhMeta => item !== null,
    );

    startFetchProxiesAnim();
    const promiseProxy = missCache.map((item) => {
      return this.limit(async () => {
        const {
          repository: {
            owner: { login: owner },
            name: repo,
          },
          sha,
        } = item;

        const pc = await this.listProxies(owner, repo, sha);

        if (pc) {
          try {
            await pCache.set(sha, pc);
          } catch (error: unknown) {
            console.log(error);
          }

          for (const p of pc) {
            if (isTrojan(p)) this.saveProxy(p, p.password, proxies, listPass);
            if (isVmess(p)) this.saveProxy(p, p.uuid, proxies, listPass);
          }
        }
      });
    });

    for (let i = 0; i < promiseProxy.length; i += 50) {
      await Promise.all(promiseProxy.slice(i, i + 50));
      if (i + 50 < promiseProxy.length) {
        stopFetchProxiesAnim();
        await logUpdateSleep(
          `Fetch: Throttling, wait for ${this.SLEEP_DURATION / 1000} seconds`,
          this.SLEEP_DURATION,
        );
        startFetchProxiesAnim();
      }
    }
    stopFetchProxiesAnim();

    await logUpdateSleep(`Found: ${proxies.length} proxies`, 1000);

    const fileName = `proxies ${getFullDate()}.yaml`;
    Deno.writeTextFileSync(`${fileName}`, YAML.stringify({ proxies }));
    await logUpdateSleep(`Result saved at ${fileName}`, 3000);

    const totalTime = Date.now() - timeStart;
    await logUpdateSleep(`Total time: ${totalTime / 1000} seconds`, 5000);

    setTimeout(() => Deno.exit(1), 3000);
  }
}
