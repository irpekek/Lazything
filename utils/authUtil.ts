import { userInfo } from 'node:os';

const KEYDIR = `${userInfo().homedir}/.config/lazything`;

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

export function setAuthKey(key: string): void {
  Deno.writeTextFileSync(`${KEYDIR}/auth.txt`, key);
}
