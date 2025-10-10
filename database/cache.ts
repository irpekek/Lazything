import pLimit from 'p-limit';

type Bucket = 'dateCache' | 'proxyCache' | 'searchCodeCache';

interface CacheSetOptions {
  expireIn: number;
}

type KeyOfChunks = string[];

export class Cache {
  private readonly _database: Deno.Kv;
  private readonly _bucket: Bucket;
  private readonly _expiredIn = 1000 * 60 * 60 * 24; // Default expire cache in 1 day
  private readonly CHUNK_SIZE = 1024 * 64;

  constructor(bucket: Bucket, database: Deno.Kv) {
    this._bucket = bucket;
    this._database = database;
  }

  /**
   * Slices a buffer into chunks of a specified size.
   *
   * @param buf The buffer to slice.
   * @param chunkSize The size of each chunk.
   * @returns An array of Uint8Array chunks.
   */
  private sliceBufferToChunks(
    buf: Uint8Array,
    chunkSize = 1024 * 64,
  ): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < buf.length; i += chunkSize) {
      chunks.push(buf.subarray(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Fragments a key-value pair into multiple chunks.
   *
   * @param key The key of the key-value pair.
   * @param value The value of the key-value pair.
   * @param expireIn The expiration time of the key-value pair in milliseconds.
   * @returns A Promise that resolves to an array of keys for the fragments.
   */
  private async fragment<T>(key: string, value: T, expireIn: number) {
    let chunks: Uint8Array[] = [];
    const subKey: KeyOfChunks = [];
    const buf = new TextEncoder().encode(JSON.stringify(value));

    // if the buffer is more than 64KB, slice it into a couple of chunks
    if (buf.length > this.CHUNK_SIZE) {
      chunks = this.sliceBufferToChunks(buf, this.CHUNK_SIZE);
    } else chunks.push(buf);

    const chunkPromise = chunks.map(async (chunk, i) => {
      const chunkKey = `${key}_${i}`;
      subKey.push(chunkKey);
      try {
        await this._database.set([this._bucket, `${chunkKey}`], chunk, {
          expireIn,
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          throw new Error(
            `Failed to create fragment for key: ${chunkKey}, ${error.message}`,
          );
        }
        throw new Error(
          `Unexpected error while create fragment for key: ${chunkKey}, ${error}`,
        );
      }
    });
    await Promise.all(chunkPromise);

    return subKey;
  }

  /**
   * Reads the fragments of a key-value pair.
   *
   * @param subKey The array of keys for the fragments.
   * @returns A Promise that resolves to a Uint8Array containing the joined fragments.
   */
  private async readFragment(subKey: KeyOfChunks) {
    const limiter = pLimit(5);

    const subKeyPromises = subKey.map((k, i) =>
      limiter(async () => {
        try {
          const result = await this._database.get<Uint8Array>([
            this._bucket,
            k,
          ]);
          if (!result.value) return null;
          return result.value;
        } catch (error: unknown) {
          if (error instanceof Error) {
            throw new Error(
              `Failed to read fragment of key: ${k}_${i}, ${error.message}`,
            );
          }
          throw new Error(
            `Unexpected error while read fragment of key: ${k}_${i}, ${error}`,
          );
        }
      })
    );
    const chunks = await Promise.all(subKeyPromises);
    const validChunks = chunks.filter((c): c is Uint8Array => c !== null);

    const totalLength = validChunks.reduce((sum, arr) => sum + arr.length, 0);
    const joinedBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of validChunks) {
      joinedBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    return joinedBuffer;
  }

  /**
   * Sets a key-value pair in the cache.
   *
   * @param key The key of the key-value pair.
   * @param value The value of the key-value pair.
   * @param options An object containing the expiration time of the key-value pair in milliseconds.
   * @returns A Promise that resolves when the key-value pair is set.
   */
  public async set<T>(
    key: string,
    value: T,
    options: CacheSetOptions = { expireIn: this._expiredIn },
  ) {
    try {
      const subKey = await this.fragment(key, value, options.expireIn);
      await this._database.set([this._bucket, key], subKey, {
        expireIn: options.expireIn,
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to set cache for bucket: ${this._bucket} with key: ${key}, ${error.message}`,
        );
      }
      throw new Error(
        `Unexpected error while set cache of bucket: ${this._bucket}, ${error}`,
      );
    }
  }

  /**
   * Gets a key-value pair from the cache.
   *
   * @param key The key of the key-value pair.
   * @returns A Promise that resolves to the value of the key-value pair or null if the key-value pair is not found.
   */
  public async get<T>(key: string): Promise<T | null> {
    let joinedBuffer: Uint8Array;
    try {
      const result = await this._database.get<KeyOfChunks>([this._bucket, key]);
      if (!result.value) return null;
      joinedBuffer = await this.readFragment(result.value);
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to get cache of bucket: ${this._bucket} with key: ${key}, ${error.message}`,
        );
      }
      throw new Error(
        `Unexpected error while get cache of bucket: ${this._bucket}, ${error}`,
      );
    }

    try {
      const decoded = new TextDecoder().decode(joinedBuffer);
      return JSON.parse(decoded) as T;
    } catch {
      return null;
    }
  }
}
