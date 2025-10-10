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
    const subKey: KeyOfChunks = [];
    const buf = new TextEncoder().encode(JSON.stringify(value));

    // if the buffer is more than 64KB, slice it into a couple of chunks
    let chunks: Uint8Array[] = [];
    if (buf.length > this.CHUNK_SIZE) {
      chunks = this.sliceBufferToChunks(buf, this.CHUNK_SIZE);
    } else chunks.push(buf);

    // Build subkey
    const atomic = this._database.atomic();
    for (const [i, c] of chunks.entries()) {
      const chunkKey = `${key}_${i}`;
      subKey.push(chunkKey);
      atomic.set([this._bucket, chunkKey] as const, c, { expireIn });
    }

    // Add the main entry: key -> subKey
    atomic.set([this._bucket, key] as const, subKey, { expireIn });

    // commit atomic
    try {
      const commit = await atomic.commit();
      if (!commit.ok) {
        throw new Error(`Atomic commit failed for fragment key: ${key}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fragment key: ${key}, ${error.message}`);
      }
      throw new Error(`Unexpected error fragmenting key: ${key} - ${error}`);
    }

    return subKey;
  }

  /**
   * Reads the fragments of a key-value pair.
   *
   * @param subKey The array of keys for the fragments.
   * @returns A Promise that resolves to a Uint8Array containing the joined fragments.
   */
  private async readFragment(subKey: KeyOfChunks) {
    if (subKey.length === 0) {
      throw new Error('No subKeys provided for reading fragments');
    }

    const val = subKey.map((key) => [this._bucket, key] as const);

    let results: Deno.KvEntryMaybe<Uint8Array>[];
    try {
      results = await this._database.getMany<Uint8Array[]>(val);
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to read fragment of key: ${subKey}, ${error.message}`,
        );
      }
      throw new Error(
        `Unexpected error while read fragment of key: ${subKey}, ${error}`,
      );
    }
    const chunks = results.map((result) => result.value);
    const validChunks = chunks.filter((c): c is Uint8Array => c !== null); // Filter out null chunks

    // Check if all fragments are present
    if (validChunks.length !== subKey.length) {
      throw new Error(
        `Cache fragments incomplete for keys: ${subKey.join(', ')}`,
      );
    }

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
      await this.fragment(key, value, options.expireIn);
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
      const result = await this._database.get<KeyOfChunks>(
        [this._bucket, key] as const,
      );
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
