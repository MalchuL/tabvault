import assert from "node:assert/strict";
import test from "node:test";

function chromeHarness({ failVaultWrite = false } = {}) {
  const storage = { "tabvault-storage-mode": "backend" };
  const fetches = [];
  const closed = [];
  let messageListener;
  let vaultWrites = 0;

  const queues = new Map();
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      locks: {
        request: (key, work) => {
          const next = (queues.get(key) ?? Promise.resolve())
            .catch(() => {})
            .then(work);
          queues.set(key, next);
          return next;
        },
      },
    },
  });
  globalThis.dispatchEvent = () => true;
  globalThis.chrome = {
    alarms: {
      clear: async () => undefined,
      create: () => undefined,
      onAlarm: { addListener: () => undefined },
    },
    commands: { onCommand: { addListener: () => undefined } },
    notifications: { create: () => undefined },
    runtime: {
      onStartup: { addListener: () => undefined },
      onInstalled: { addListener: () => undefined },
      onMessage: {
        addListener: listener => {
          messageListener = listener;
        },
      },
      sendMessage: async () => undefined,
    },
    storage: {
      local: {
        get: async keys => {
          if (Array.isArray(keys))
            return Object.fromEntries(keys.map(key => [key, storage[key]]));
          return { [keys]: storage[keys] };
        },
        set: async values => {
          if ("tabvault-v3" in values) {
            vaultWrites += 1;
            if (failVaultWrite)
              throw new Error("simulated local write failure");
          }
          Object.assign(storage, values);
        },
      },
    },
    tabs: {
      create: async () => ({}),
      query: async () => [],
      remove: async id => closed.push(id),
    },
    sidePanel: { open: async () => undefined },
  };
  globalThis.fetch = async (url, options = {}) => {
    fetches.push({ url, options });
    if (!url.endsWith("/sync")) throw new Error("Unexpected endpoint");
    const { vaultToServerDocument } = await import(
      "../dist/public/library-sync.js"
    );
    return {
      ok: true,
      json: async () => ({
        generation: "server",
        document: vaultToServerDocument(storage["tabvault-v3"]),
        acknowledged: JSON.parse(options.body).changes.map(c => c.token),
        propertyTimes: {},
        tombstones: [],
      }),
    };
  };

  return {
    storage,
    fetches,
    closed,
    vaultWrites: () => vaultWrites,
    listener: () => messageListener,
  };
}

async function capture(listener, tabs) {
  return new Promise(resolve => {
    const keepChannelOpen = listener(
      { type: "TABVAULT_FAST_SAVE_AND_CLOSE", tabs },
      {},
      resolve
    );
    assert.equal(keepChannelOpen, true);
  });
}

test("background open requests create a collection group using successful tab IDs", async () => {
  const h = chromeHarness();
  const calls = [];
  globalThis.chrome.tabs.create = async ({ url }) => {
    if (url.endsWith("fail")) throw new Error("Navigation failed");
    return { id: 12 };
  };
  globalThis.chrome.tabs.group = async options => {
    calls.push(options);
    return 8;
  };
  globalThis.chrome.tabGroups = {
    update: async (id, options) => calls.push({ id, options }),
  };
  await import("../dist/public/background.js?open-group");
  const group = { title: "Reading", color: "purple" };
  const result = await new Promise(resolve => {
    h.listener()(
      {
        type: "TABVAULT_OPEN_TABS",
        urls: ["https://example.com", "https://example.com/fail"],
        group,
      },
      {},
      resolve
    );
  });
  assert.equal(result.openedCount, 1);
  assert.equal(result.requestedCount, 2);
  assert.deepEqual(calls, [{ tabIds: [12] }, { id: 8, options: group }]);
});

test("capture commits one session and distinct URL occurrences before closing, then syncs once", async () => {
  const h = chromeHarness();
  await import("../dist/public/background.js?capture");
  const url = "https://Example.com/path?a=1#part";
  const result = await capture(h.listener(), [
    { id: 1, url, title: "One" },
    { id: 2, url, title: "Two" },
    { id: 3, url: "chrome://settings" },
  ]);
  assert.equal(result.savedCount, 2);
  assert.equal(result.closedCount, 2);
  assert.equal(result.skippedCount, 1);
  assert.deepEqual(h.closed, [1, 2]);
  const vault = h.storage["tabvault-v3"];
  assert.equal(vault.schemaVersion, 5);
  assert.deepEqual(vault.propertySchema, {});
  assert.equal(vault.library.vaultGroups.length, 1);
  assert.equal(vault.library.vaultGroups[0].details.category, "session");
  assert.equal(new Set(vault.library.tabs.map(t => t.id)).size, 2);
  assert.ok(vault.library.tabs.every(t => t.content.url === url));
  assert.deepEqual(vault.sync.pending, {});
  assert.equal(h.fetches.length, 1);
  assert.equal(JSON.parse(h.fetches[0].options.body).changes.length, 3);
});
test("failed local persistence leaves every source open", async () => {
  const h = chromeHarness({ failVaultWrite: true });
  await import("../dist/public/background.js?failed");
  const result = await capture(h.listener(), [
    { id: 1, url: "https://example.com" },
  ]);
  assert.match(result.error, /simulated local write failure/);
  assert.deepEqual(h.closed, []);
  assert.equal(h.fetches.length, 0);
});
test("offline capture remains durable and retryable", async () => {
  const h = chromeHarness();
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  await import("../dist/public/background.js?offline");
  const result = await capture(h.listener(), [
    { id: 1, url: "https://example.com" },
  ]);
  assert.equal(result.savedCount, 1);
  assert.equal(result.serverSynced, false);
  assert.equal(Object.keys(h.storage["tabvault-v3"].sync.pending).length, 2);
  assert.deepEqual(h.closed, [1]);
});
test("legacy storage is preserved and capture closes nothing", async () => {
  const h = chromeHarness();
  const legacy = { schemaVersion: 4, library: { tabs: [] } };
  h.storage["tabvault-v3"] = legacy;
  await import("../dist/public/background.js?legacy");
  const result = await capture(h.listener(), [
    { id: 1, url: "https://example.com" },
  ]);
  assert.match(result.error, /schema v5/);
  assert.deepEqual(h.storage["tabvault-v3"], legacy);
  assert.deepEqual(h.closed, []);
  assert.equal(h.vaultWrites(), 0);
});
