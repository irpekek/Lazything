import { userInfo } from 'node:os';

// secret key file location
const KEYDIR = `${userInfo().homedir}/.config/lazything`;

/**
 * Retrieves the authentication key from a file.
 * If the key file or directory does not exist, it creates them and returns undefined.
 *
 * @returns {string | undefined} The authentication key, or undefined if not found/created.
 * @throws {Error} If reading the file fails for reasons other than it not being found.
 */
export function getAuthKey(): string | undefined {
  try {
    return Deno.readTextFileSync(`${KEYDIR}/auth.txt`);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      Deno.mkdirSync(`${KEYDIR}`, { recursive: true });
      Deno.createSync(`${KEYDIR}/auth.txt`);
      return undefined;
    }
    throw new Error('Failed to get authentication key');
  }
}

/**
 * Sets the authentication key to a file.
 *
 * @param {string} key The authentication key to set.
 * @throws {Error} If writing the file fails.
 */
export function setAuthKey(key: string): void {
  Deno.writeTextFileSync(`${KEYDIR}/auth.txt`, key);
}
