import assert from "node:assert/strict";
import test from "node:test";

function chromeHarness({ failVaultWrite = false } = {}) {
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
    if (url.endsWith("/api/v1/property-schema") && !options.method)
      return {
        ok: true,
        json: async () => ({ success: true, data: { properties: {} } }),
      };
    return { ok: true, json: async () => ({ success: true }) };
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

  const vault = harness.storage["tabvault-v3"];
  assert.equal(vault.schemaVersion, 3);
  assert.equal(vault.propertySchema.viewed.default, false);
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

  assert.equal(harness.vaultWrites(), 1);
  assert.equal(harness.fetches.length, 4);
  const groupRequest = harness.fetches.find(request =>
    /\/api\/v1\/groups$/.test(request.url)
  );
  assert.ok(groupRequest);
  const batchRequest = harness.fetches.find(request =>
    /\/api\/v1\/tabs\/batch$/.test(request.url)
  );
  assert.ok(batchRequest);
  assert.match(batchRequest.url, /\/api\/v1\/tabs\/batch$/);
  const batch = JSON.parse(batchRequest.options.body);
  assert.equal(batch.tabs.length, 2);
  assert.ok(batch.tabs.every(tab => tab.url === exactUrl));
  assert.equal(
    batchRequest.options.headers["Idempotency-Key"],
    vault.vaultGroups[0].id
  );
  assert.equal(harness.storage["tabvault-sync-status"].state, "synced");
});

test("an atomic local batch failure leaves every source tab open", async () => {
  const harness = chromeHarness({ failVaultWrite: true });
  await import(
    `../client/public/background.js?test=${Date.now()}-batch-failure`
  );
  const response = await capture(harness.listener(), [
    { id: 1, url: "https://example.com/one", title: "One" },
    { id: 2, url: "https://example.com/two", title: "Two" },
    { id: 3, url: "https://example.com/three", title: "Three" },
  ]);

  assert.match(response.error, /simulated local write failure/);
  assert.deepEqual(harness.closed, []);
  assert.equal(harness.storage["tabvault-v3"], undefined);
});

test("a capture with no eligible tabs still keeps its empty Session", async () => {
  const harness = chromeHarness();
  await import(`../client/public/background.js?test=${Date.now()}-empty`);
  const response = await capture(harness.listener(), [
    { id: 9, url: "chrome://settings", title: "Settings" },
  ]);

  assert.equal(response.savedCount, 0);
  assert.equal(response.skippedCount, 1);
  assert.equal(harness.storage["tabvault-v3"].vaultGroups.length, 1);
  assert.equal(harness.storage["tabvault-v3"].tabs.length, 0);
  assert.equal(harness.fetches.length, 3);
  assert.ok(
    harness.fetches.some(request => /\/api\/v1\/groups$/.test(request.url))
  );
});
