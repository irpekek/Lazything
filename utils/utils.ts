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

/**
 * Creates a loading animation with a specified message.
 *
 * @param message The message to display.
 * @returns An object with pause, resume, and stop methods.
 */
export function createLoadingAnimation(message: string) {
  const frames = ['-', '\\', '|', '/'];
  let index = 0;
  let isRunning = false;
  let intervalId: number | null = null;

  function updateFrame() {
    const frame = frames[index = ++index % frames.length];
    logUpdate(`${frame} ${message} 🚀`);
  }

  function start() {
    if (isRunning === true) return;
    isRunning = true;
    intervalId = setInterval(updateFrame, 80);
    updateFrame();
  }

  function pause() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    isRunning = false;
  }

  function resume() {
    start();
  }

  function stop() {
    pause();
    logUpdate.clear();
    index = 0;
  }

  start();

  return { pause, resume, stop };
}
