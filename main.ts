#!/usr/bin/env -S deno run -A --ext=ts

import { cacheDir, dateCache, proxyCache } from './configs/cacheConfig.ts';
import { handleCLI } from "./cmd/cli.ts";

// load caches at startup (global init)
dateCache.load('dateCache', cacheDir);
proxyCache.load('proxyCache', cacheDir);

async function main(): Promise<void> {
  await handleCLI(Deno.args);
}

await main();
