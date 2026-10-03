import { afterEach, expect, it, vi } from "vitest";
import { emptyBrowserVault } from "@/domain/library/codec";
import {
  clearBrowserLibrary,
  inspectBrowserVault,
  readBrowserVault,
  writeBrowserVault,
  readStorageMode,
  writeStorageMode,
  writeLocalServerUrl,
  readLocalServerUrl,
  writeLibraryRefreshInterval,
  readLibraryRefreshInterval,
  writeSyncStatus,
  readSyncStatus,
} from "./browserStorage";
afterEach(() => vi.unstubAllGlobals());
it.each(["browser", "extension"])(
  "round trips current data and preserves incompatible %s bytes",
  async mode => {
    const values: Record<string, unknown> = {};
    if (mode === "extension")
      vi.stubGlobal("chrome", {
        storage: {
          local: {
            remove: async (keys: string[]) => {
              for (const key of keys) delete values[key];
            },
            get: async (key: string) => ({ [key]: values[key] }),
            set: async (next: object) => Object.assign(values, next),
          },
        },
      });
    else
      vi.stubGlobal("localStorage", {
        removeItem: (key: string) => {
          delete values[key];
        },
        getItem: (key: string) => values[key] ?? null,
        setItem: (key: string, value: string) => {
          values[key] = value;
        },
      });
    expect(await readBrowserVault()).toBeUndefined();
    await writeBrowserVault(emptyBrowserVault());
    expect(await readBrowserVault()).toEqual(emptyBrowserVault());
    await writeStorageMode("backend");
    expect(await readStorageMode()).toBe("backend");
    await writeLocalServerUrl("http://localhost:47821/");
    expect(await readLocalServerUrl()).toBe("http://localhost:47821");
    await writeLibraryRefreshInterval(15.7);
    expect(await readLibraryRefreshInterval()).toBe(16);
    await writeSyncStatus({ state: "pending", localSavedAt: 1 });
    expect((await readSyncStatus())?.state).toBe("pending");
    const legacy = { schemaVersion: 4, library: { tabs: [] } };
    values["tabvault-v3"] =
      mode === "extension" ? legacy : JSON.stringify(legacy);
    const raw = values["tabvault-v3"];
    expect((await inspectBrowserVault()).status).toBe("incompatible");
    await expect(readBrowserVault()).rejects.toThrow("schema v5");
    expect(values["tabvault-v3"]).toEqual(raw);
    await expect(
      writeBrowserVault({ ...emptyBrowserVault(), schemaVersion: 4 } as never)
    ).rejects.toThrow("invalid");
    expect(values["tabvault-v3"]).toEqual(raw);
    await clearBrowserLibrary();
    expect(await readBrowserVault()).toEqual(emptyBrowserVault());
  }
);
