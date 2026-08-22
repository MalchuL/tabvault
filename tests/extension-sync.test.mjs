import assert from "node:assert/strict";
import test from "node:test";

test("extension fast-save syncs with FastAPI's default local URL and persists sync state", async () => {
  const storage = { "tabvault-storage-mode": "backend" };
  const fetches = [];
  let messageListener;

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
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map(key => [key, storage[key]]));
          }
          return { [keys]: storage[keys] };
        },
        set: async values => Object.assign(storage, values),
      },
    },
    tabs: {
      create: async () => ({}),
      query: async () => [],
      remove: async () => undefined,
    },
    sidePanel: { open: async () => undefined },
  };
  globalThis.fetch = async (url, options) => {
    fetches.push({ url, options });
    return { ok: true };
  };

  await import(`../client/public/background.js?test=${Date.now()}`);
  assert.equal(typeof messageListener, "function");

  const response = await new Promise(resolve => {
    const keepChannelOpen = messageListener(
      {
        type: "TABVAULT_FAST_SAVE_AND_CLOSE",
        tabs: [
          {
            id: 42,
            url: "https://Example.com/project/?utm_source=news&b=2&a=1",
            title: "Project tab",
          },
        ],
      },
      {},
      resolve
    );
    assert.equal(keepChannelOpen, true);
  });

  assert.equal(response.serverSynced, true);
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].url, "http://127.0.0.1:47821/api/v1/tabs");
  assert.equal(fetches[0].options.headers["X-API-Key"], "admin");
  assert.equal(
    JSON.parse(fetches[0].options.body).tabs[0].url,
    "https://example.com/project?a=1&b=2"
  );
  assert.equal(JSON.parse(fetches[0].options.body).tabs[0].note, "");
  assert.equal(JSON.parse(fetches[0].options.body).tabs[0].agentReview, "");
  assert.equal(JSON.parse(fetches[0].options.body).tabs[0].viewed, false);
  assert.equal(storage["tabvault-sync-status"].state, "synced");
  assert.equal(storage["tabvault-v1"].tabs.length, 1);
  assert.equal(storage["tabvault-v1"].tabs[0].note, "");
});
