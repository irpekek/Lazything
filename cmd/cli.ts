#!/usr/bin/env -S deno run -A --ext=ts
import { setAuthKey } from '../utils/authUtil.ts';
import { execute } from './fetch.ts';

/**
 * Handles filtering of proxies by month.
 *
 * @param month - A string representing the number of months to filter proxies by.
 * @param domain - A string representing the domain to search for proxies in.
 */
async function handleFilter(month: string, domain: string): Promise<void> {
  const m = Number(month);
  if (domain && !isNaN(m)) await execute(domain, m);
}

/**
 * Prints the help message for the CLI.
 */
function printHelp(): void {
  console.log(`
    Usage: Lazything [options] <domain>\n
    Argument:
    <domain> \t Domain to search proxy\n
    Options:
      -k, --key <str> \t\t Set GitHub authentication key
      -f, --filter <num> \t Filter result by months (default = 3)\n
    Examples:
      lazything -k foobar \t\t Set GitHub authentication key to "foobar"
      lazything -f 3 foo.bar.baz \t Filter proxies for "foo.bar.baz" within the last 3 months
      lazything --filter 3 foo.bar.baz \t Same as above using long option
      lazything foo.bar.baz \t\t Search for proxies in "foo.bar.baz" without filtering
      lazything -h, --help \t\t Display this help message
    `);
}

/**
 * Handles command-line interface (CLI) arguments to perform various actions.
 *
 * @param args - An array of strings representing the command-line arguments.
 *               Expected formats:
 *               - `[-k|--key] <str>`: Set GitHub authentication key.
 *               - `[-f|--filter] <num> <domain>`: Filter proxies for a domain within the last `num` months.
 *               - `[-h|--help]`: Display help message.
 *               - `<domain>`: Search for proxies in a domain without filtering (default 3 months if key is set).
 */
export async function handleCLI(args: string[]): Promise<void> {
  if (args.length === 0) {
    printHelp();
    return;
  }
  const OPTIONS = {
    FILTER: ['-f', '--filter'],
    KEY: ['-k', '--key'],
    HELP: ['-h', '--help'],
  };
  const opts = args[0];
  const val = args[1];
  const domain = args[2];

  switch (true) {
    case OPTIONS.KEY.includes(opts):
      setAuthKey(val);
      break;
    case OPTIONS.HELP.includes(opts):
      printHelp();
      break;
    case OPTIONS.FILTER.includes(opts):
      if (!val) {
        console.error('Filtering value is required.');
        Deno.exit(1);
      }
      if (!domain) {
        console.error('Domain value is required.');
        Deno.exit(1);
      }
      await handleFilter(val, domain);
      break;
    default:
      execute(args[0], 3);
      Deno.exit(1);
  }
}
