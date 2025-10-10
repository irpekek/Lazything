export class Database {
  /**
   * Connects to the cache database.
   *
   * @param location The location of the database.
   * @param name The name of the database.
   * @returns A Promise that resolves to the database.
   */
  public static async connect(
    location: string,
    name: string,
  ) {
    try {
      return await Deno.openKv(`${location}/${name}`);
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed connect to cache database: ${error.message}`);
      } else {
        throw new Error(`Unexpected error for database: ${error}`);
      }
    }
  }
}
