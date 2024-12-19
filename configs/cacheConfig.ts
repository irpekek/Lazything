import { FlatCache } from 'flat-cache';
import { userInfo } from 'node:os';

export const cacheDir = `${userInfo().homedir}/.cache/lazything/cache`

export const proxyCache = new FlatCache({
  cacheDir,
  ttl: 1000 * 60 * 60 * 2, // 2 hour
  lruSize: 500, // 500 items
  expirationInterval: 1000,
  cacheId: 'proxyCache',
});

export const dateCache = new FlatCache({
  cacheDir,
  ttl: 1000 * 60 * 60, // 1 hour
  lruSize: 1000, // 1000 items
  expirationInterval: 1000 * 2,
  cacheId: 'dateCache',
});