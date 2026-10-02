import { afterEach, expect, it, vi } from "vitest";
import {
  captureTabs,
  recordChanges,
  updateTab,
  resourceKey,
} from "@/domain/library/operations";
import { emptyBrowserVault, toServerDocument } from "@/domain/library/codec";
import { commitLibrary } from "@/domain/library/store";
import { changePropertyDefinition } from "@/domain/library/properties";
import { readBrowserVault, writeBrowserVault } from "./browserStorage";
import { reconcileSync, synchronizeLibrary, type SyncResponse } from "./sync";
afterEach(() => vi.unstubAllGlobals());
function harness() {
  const data: Record<string, string> = { "tabvault-storage-mode": "backend" };
  const queues = new Map<string, Promise<unknown>>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  });
  vi.stubGlobal("navigator", {
    locks: {
      request: (key: string, work: () => Promise<unknown>) => {
        const next = (queues.get(key) ?? Promise.resolve())
          .catch(() => {})
          .then(work);
        queues.set(key, next);
        return next;
      },
    },
  });
  vi.stubGlobal("dispatchEvent", vi.fn());
  return data;
}
it("keeps newer edits and deletions pending when earlier tokens are acknowledged", () => {
  const before = emptyBrowserVault();
  const first = recordChanges(
    before,
    captureTabs(before, [{ url: "https://example.com", title: "Original" }])
  );
  const id = first.library.tabs[0].id;
  const next = recordChanges(
    first,
    updateTab(first, id, { content: { title: "Edited while syncing" } })
  );
  const response: SyncResponse = {
    generation: "g",
    document: toServerDocument(first),
    acknowledged: Object.values(first.sync.pending).map(c => c.token),
    propertyTimes: {},
    tombstones: [],
  };
  const merged = reconcileSync(next, response);
  expect(merged.library.tabs[0].content.title).toBe("Edited while syncing");
  expect(Object.keys(merged.sync.pending)).toEqual([resourceKey("tab", id)]);
  const defined = recordChanges(
    merged,
    changePropertyDefinition(merged, "priority", {
      type: "int",
      description: "",
      default: 1,
    })
  );
  const deleted = recordChanges(
    defined,
    changePropertyDefinition(defined, "priority", null)
  );
  expect(
    reconcileSync(deleted, {
      ...response,
      document: toServerDocument(defined),
      acknowledged: Object.values(defined.sync.pending).map(c => c.token),
    }).propertySchema
  ).not.toHaveProperty("priority");
  expect(
    reconcileSync(next, {
      ...response,
      document: toServerDocument(before),
      tombstones: [{ kind: "tab", id, updatedAt: new Date().toISOString() }],
    }).library.tabs
  ).toEqual([]);
});
it("serializes concurrent local commands and retries a lost response without losing data", async () => {
  harness();
  await Promise.all([
    commitLibrary(v => captureTabs(v, [{ url: "https://a.example" }])),
    commitLibrary(v => captureTabs(v, [{ url: "https://b.example" }])),
  ]);
  const current = (await readBrowserVault())!;
  expect(current.library.tabs).toHaveLength(2);
  expect(Object.keys(current.sync.pending)).toHaveLength(4);
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          generation: "one",
          document: toServerDocument(current),
          acknowledged: body.changes.map((c: { token: string }) => c.token),
          propertyTimes: {},
          tombstones: [],
        }),
      };
    });
  vi.stubGlobal("fetch", request);
  await expect(synchronizeLibrary()).rejects.toThrow("offline");
  expect((await readBrowserVault())?.sync.pending).toEqual(
    current.sync.pending
  );
  await synchronizeLibrary();
  expect((await readBrowserVault())?.sync.pending).toEqual({});
  expect((await readBrowserVault())?.library.tabs).toHaveLength(2);
});
it("hydrates empty storage and preserves a local copy on generation conflict", async () => {
  harness();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        generation: "one",
        document: toServerDocument(emptyBrowserVault()),
        acknowledged: [],
        propertyTimes: {},
        tombstones: [],
      }),
    })
  );
  await synchronizeLibrary();
  expect((await readBrowserVault())?.sync.generation).toBe("one");
  const current = await commitLibrary(v =>
    captureTabs(v, [{ url: "https://a.example" }])
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ detail: "Server library replaced" }),
    })
  );
  await expect(synchronizeLibrary()).rejects.toThrow("Server library replaced");
  expect(await readBrowserVault()).toEqual(current);
  const bad = { ...current, schemaVersion: 4 };
  await expect(writeBrowserVault(bad as never)).rejects.toThrow();
});

it("does not discard edits made while explicit server adoption is in flight", async () => {
  harness();
  await writeBrowserVault(emptyBrowserVault());
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      await commitLibrary(v =>
        captureTabs(v, [{ url: "https://new.example" }])
      );
      return {
        ok: true,
        json: async () => ({
          generation: "replacement",
          document: toServerDocument(emptyBrowserVault()),
          acknowledged: [],
          propertyTimes: {},
          tombstones: [],
        }),
      };
    })
  );
  const { loadServerLibrary } = await import("./sync");
  await expect(loadServerLibrary()).rejects.toThrow("local library changed");
  expect((await readBrowserVault())?.library.tabs[0].content.url).toBe(
    "https://new.example"
  );
  await expect(loadServerLibrary(false)).rejects.toThrow("still pending");
});
