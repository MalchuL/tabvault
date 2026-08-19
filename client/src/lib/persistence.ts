/**
 * TabVault persistence contract. The UI works against one adapter shape while
 * browser storage remains immediately available and server sync is additive.
 */
import {
  mergeLibraryToServer,
  readExtensionVault,
  readLibraryFromServer,
  writeExtensionVault,
} from "./extension";

export type PersistenceMode = "browser" | "server" | "hybrid";

export interface PersistenceAdapter<T> {
  readonly mode: PersistenceMode;
  load(): Promise<T | undefined>;
  save(value: T): Promise<void>;
}

export class BrowserStorageAdapter<T> implements PersistenceAdapter<T> {
  readonly mode = "browser" as const;
  async load() {
    return readExtensionVault<T>();
  }
  async save(value: T) {
    await writeExtensionVault(value);
  }
}

export class ServerStorageAdapter<T extends Record<string, unknown>>
  implements PersistenceAdapter<T>
{
  readonly mode = "server" as const;
  constructor(
    private readonly url: string,
    private readonly apiKey: string
  ) {}
  async load() {
    return (await readLibraryFromServer(this.url, this.apiKey)) as T;
  }
  async save(value: T) {
    await mergeLibraryToServer(this.url, value, this.apiKey);
  }
}

export class HybridStorageAdapter<
  T extends Record<string, unknown>,
  S extends Record<string, unknown>,
> implements PersistenceAdapter<T>
{
  readonly mode = "hybrid" as const;
  constructor(
    private readonly browser: BrowserStorageAdapter<T>,
    private readonly server: ServerStorageAdapter<S> | null,
    private readonly toServer: (value: T) => S,
    private readonly fromServer: (value: S) => T
  ) {}
  async load() {
    const browserValue = await this.browser.load();
    if (!this.server) return browserValue;
    try {
      return this.fromServer(await this.server.load());
    } catch {
      return browserValue;
    }
  }
  async save(value: T) {
    await this.browser.save(value);
    if (this.server) {
      try {
        await this.server.save(this.toServer(value));
      } catch {
        /* Browser storage is the explicit offline fallback. */
      }
    }
  }
}
