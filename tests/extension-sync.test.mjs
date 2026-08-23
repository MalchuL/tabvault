import assert from "node:assert/strict";
import test from "node:test";

function chromeHarness({ failTabWrite = 0 } = {}) {
  const storage = { "tabvault-storage-mode": "backend" };
  const fetches = [];
  const closed = [];
  let messageListener;
  let vaultWrites = 0;

  globalThis.chrome = {
    alarms: {
      clear: async () => undefined,
      create: () => undefined,
      onAlarm: { addListener: () => undefined },
    },
    commands: { onCommand: { addListener: () => undefined } },
    notifications: { create: () => undefined },
    runtime: {
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
          if ("tabvault-v2" in values) {
            vaultWrites += 1;
            if (vaultWrites === failTabWrite + 1 && failTabWrite > 0)
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
    return { ok: true, json: async () => ({ success: true }) };
  };

  return {
    storage,
    fetches,
    closed,
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

test("capture creates one Session and distinct exact-URL occurrences", async () => {
  const harness = chromeHarness();
  await import(`../client/public/background.js?test=${Date.now()}-session`);
  const listener = harness.listener();
  assert.equal(typeof listener, "function");

  const exactUrl = "https://Example.com/project/?utm_source=news&b=2&a=1#part";
  const response = await capture(listener, [
    { id: 41, url: exactUrl, title: "First", pinned: true },
    { id: 42, url: exactUrl, title: "Second" },
    { id: 43, url: "chrome://settings", title: "Internal" },
  ]);

  assert.equal(response.savedCount, 2);
  assert.equal(response.closedCount, 2);
  assert.equal(response.skippedCount, 1);
  assert.equal(response.failedCount, 0);
  assert.deepEqual(harness.closed, [41, 42]);

  const vault = harness.storage["tabvault-v2"];
  assert.equal(vault.schemaVersion, 2);
  assert.equal(vault.vaultGroups.length, 1);
  assert.equal(vault.vaultGroups[0].category, "session");
  assert.match(
    vault.vaultGroups[0].name,
    /^Session [A-Z][a-z]{2} \d{2} \d{2}:\d{2}$/
  );
  assert.equal(vault.tabs.length, 2);
  assert.equal(new Set(vault.tabs.map(tab => tab.id)).size, 2);
  assert.ok(vault.tabs.every(tab => tab.url === exactUrl));
  assert.ok(vault.tabs.every(tab => tab.groupId === vault.vaultGroups[0].id));
  assert.ok(vault.tabs.every(tab => tab.tags.length === 0));
  assert.equal("quick save" in vault.tagCatalog, false);

  assert.equal(harness.fetches.length, 3);
  assert.match(harness.fetches[0].url, /\/api\/v1\/groups$/);
  const tabRequests = harness.fetches.slice(1);
  assert.ok(tabRequests.every(request => /\/api\/v1\/tabs$/.test(request.url)));
  assert.ok(
    tabRequests.every(
      request => JSON.parse(request.options.body).url === exactUrl
    )
  );
  assert.ok(
    tabRequests.every(
      request =>
        request.options.headers["Idempotency-Key"] ===
        JSON.parse(request.options.body).id
    )
  );
  assert.equal(harness.storage["tabvault-sync-status"].state, "synced");
});

test("a local occurrence failure stays open without stopping later saves", async () => {
  const harness = chromeHarness({ failTabWrite: 2 });
  await import(`../client/public/background.js?test=${Date.now()}-partial`);
  const response = await capture(harness.listener(), [
    { id: 1, url: "https://example.com/one", title: "One" },
    { id: 2, url: "https://example.com/two", title: "Two" },
    { id: 3, url: "https://example.com/three", title: "Three" },
  ]);

  assert.equal(response.savedCount, 2);
  assert.equal(response.failedCount, 1);
  assert.deepEqual(harness.closed, [1, 3]);
  assert.equal(harness.storage["tabvault-v2"].vaultGroups.length, 1);
  assert.equal(harness.storage["tabvault-v2"].tabs.length, 2);
});

test("a capture with no eligible tabs still keeps its empty Session", async () => {
  const harness = chromeHarness();
  await import(`../client/public/background.js?test=${Date.now()}-empty`);
  const response = await capture(harness.listener(), [
    { id: 9, url: "chrome://settings", title: "Settings" },
  ]);

  assert.equal(response.savedCount, 0);
  assert.equal(response.skippedCount, 1);
  assert.equal(harness.storage["tabvault-v2"].vaultGroups.length, 1);
  assert.equal(harness.storage["tabvault-v2"].tabs.length, 0);
  assert.equal(harness.fetches.length, 1);
  assert.match(harness.fetches[0].url, /\/api\/v1\/groups$/);
});

test("an empty Session survives when every eligible local tab write fails", async () => {
  const harness = chromeHarness({ failTabWrite: 1 });
  await import(`../client/public/background.js?test=${Date.now()}-all-fail`);
  const response = await capture(harness.listener(), [
    { id: 10, url: "https://example.com/fails", title: "Failure" },
  ]);

  assert.equal(response.savedCount, 0);
  assert.equal(response.failedCount, 1);
  assert.deepEqual(harness.closed, []);
  assert.equal(harness.storage["tabvault-v2"].vaultGroups.length, 1);
  assert.equal(harness.storage["tabvault-v2"].tabs.length, 0);
});
