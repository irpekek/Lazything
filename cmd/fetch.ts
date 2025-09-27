import { ProxyService } from '../services/ProxyService.ts';
import { getAuthKey } from '../utils/authUtil.ts';

/**
 *  Fetches proxies for the given domain and month.
 *  @param domain - The domain to fetch proxies for.
 *  @param month - The month to fetch proxies for.
 */
export async function execute(domain: string, month: number): Promise<void> {
  const key = getAuthKey();
  if (!key) {
    console.error('Authentication key is required.');
    Deno.exit(1);
  }

  const service = new ProxyService();
  await service.discoverProxies(domain, month);
}
