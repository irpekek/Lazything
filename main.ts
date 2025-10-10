#!/usr/bin/env -S deno run -A --ext=ts --unstable-kv
import { handleCLI } from './cmd/cli.ts';
import { Database } from './database/connection.ts';
import { Cache } from './database/cache.ts';

let pCache: Cache, dCache: Cache;
try {
  const db = await Database.connect(`${Deno.cwd()}/database`, 'cache.db');
  // load caches at startup (global init)
  pCache = new Cache('proxyCache', db);
  dCache = new Cache('dateCache', db);
} catch (error: unknown) {
  console.log(error);
  Deno.exit(1);
}

export { dCache, pCache };

async function main(): Promise<void> {
  await handleCLI(Deno.args);
}

await main();
