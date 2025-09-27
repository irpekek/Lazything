import { DateTime } from 'luxon';
import logUpdate from 'log-update';

/**
 * Gets the current date in the format "dd-MM-yyyy HH:mm:ss".
 *
 * example: 10-12-2024 13:35:47
 * @returns The current date in the format "dd-MM-yyyy HH:mm:ss".
 */
export function getFullDate(): string {
  return `${DateTime.now().toFormat('dd-MM-yyyy HH:mm:ss')}`;
}

/**
 * Pauses the execution for a specified number of milliseconds.
 *
 * @param ms The number of milliseconds to wait.
 * @returns A Promise that resolves after the specified delay.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


/**
 * Logs an update with a specified string and waits for a specified number of milliseconds.
 * @param str The string to log.
 * @param ms The number of milliseconds to wait (default 0).
 */
export async function logUpdateSleep(str: string, ms = 0) {
  logUpdate(str);
  await sleep(ms);
  logUpdate.clear();
}
