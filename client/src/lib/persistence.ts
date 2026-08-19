/**
 * TabVault persistence contract. The UI works against one adapter shape while
 * browser storage remains immediately available and server sync is additive.
 */
import {
  mergeLibraryToServer,
  readExtensionVault,
  readLibraryFromServer,
  writeSyncStatus,
  writeExtensionVault,
  type SyncStatus,
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
    private readonly fromServer: (value: S) => T,
    private readonly backendPreferred = false
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
    await this.saveWithStatus(value);
  }
  async saveWithStatus(value: T): Promise<SyncStatus> {
    await this.browser.save(value);
    const localSavedAt = Date.now();
    if (!this.server) {
      const status: SyncStatus = {
        state: this.backendPreferred ? "pending" : "local_only",
        localSavedAt,
      };
      await writeSyncStatus(status);
      return status;
    }
    try {
      await this.server.save(this.toServer(value));
      const status: SyncStatus = {
        state: "synced",
        localSavedAt,
        serverSyncedAt: Date.now(),
      };
      await writeSyncStatus(status);
      return status;
    } catch {
      const status: SyncStatus = { state: "pending", localSavedAt };
      await writeSyncStatus(status);
      return status;
    }
  }
}
