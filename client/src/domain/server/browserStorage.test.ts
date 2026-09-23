import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyBrowserVault } from "@/domain/library/codec";
import {
  clearBrowserLibrary,
  inspectBrowserVault,
  readApiKey,
  readBrowserVault,
  readLibraryRefreshInterval,
  readLocalServerUrl,
  readStorageMode,
  readSyncStatus,
  writeBrowserVault,
  writeLibraryRefreshInterval,
  writeLocalServerUrl,
  writeStorageMode,
  writeSyncStatus,
} from "./browserStorage";

afterEach(() => vi.unstubAllGlobals());

function localStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("browser storage", () => {
  it("persists and clears a vault in ordinary browser storage", async () => {
    const localStorage = localStore();
    vi.stubGlobal("window", { localStorage });
    const vault = { ...emptyBrowserVault(), tagCatalog: { docs: "Docs" } };

    await writeBrowserVault(vault);
    expect(await readBrowserVault()).toEqual(vault);
    await writeStorageMode("backend");
    await writeLocalServerUrl("http://localhost:47821/");
    await writeLibraryRefreshInterval(15.7);
    expect(await readStorageMode()).toBe("backend");
    expect(await readLocalServerUrl()).toBe("http://localhost:47821");
    expect(await readLibraryRefreshInterval()).toBe(16);

    await clearBrowserLibrary();
    expect(await readBrowserVault()).toEqual(emptyBrowserVault());
    expect(await readSyncStatus()).toEqual(
      expect.objectContaining({ state: "local_only" })
    );
  });

  it("prefers extension storage and keeps incompatible vaults available for recovery", async () => {
    const localStorage = localStore();
    localStorage.setItem("tabvault-api-key", "stale-local-key");
    const values: Record<string, unknown> = {
      "tabvault-api-key": "extension-key",
      "tabvault-v3": { schemaVersion: 99 },
    };
    const storage = {
      get: vi.fn(async (keys: string | string[]) =>
        Object.fromEntries(
          (Array.isArray(keys) ? keys : [keys]).map(key => [key, values[key]])
        )
      ),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(values, items);
      }),
      remove: vi.fn(async (keys: string[]) => {
        keys.forEach(key => delete values[key]);
      }),
    };
    vi.stubGlobal("window", {
      localStorage,
      chrome: { storage: { local: storage } },
    });

    expect(await readApiKey()).toBe("extension-key");
    expect(await inspectBrowserVault()).toEqual({
      status: "incompatible",
      raw: { schemaVersion: 99 },
      storageKey: "tabvault-v3",
    });
    await expect(readBrowserVault()).rejects.toThrow("schema v3");
    await writeSyncStatus({ state: "synced", localSavedAt: 12 });
    expect(await readSyncStatus()).toEqual({
      state: "synced",
      localSavedAt: 12,
    });
    expect(localStorage.getItem("tabvault-sync-status")).toBeNull();

    await clearBrowserLibrary();
    expect(storage.remove).toHaveBeenCalledWith([
      "tabvault-v3",
      "tabvault-v2",
      "tabvault-v1",
    ]);
    expect(values["tabvault-v3"]).toEqual(emptyBrowserVault());
  });
});
