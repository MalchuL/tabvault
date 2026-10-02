import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultVault,
  isPersistedVault,
  serverDocumentToVault,
  utcTimestamp,
  vaultToServerDocument,
} from "../dist/public/library-sync.js";

const now = "2026-08-23T12:00:00.000Z";
function tab(id = "tab-1") {
  return {
    id,
    content: {
      title: "Example",
      url: "HTTPS://Example.com/a?b=2&a=1#fragment",
      domain: "example.com",
      color: "#F05A28",
      icon: "E",
    },
    annotations: {
      note: "note",
      agentReview: "Useful agent summary",
      viewed: true,
      customProperties: { viewed: true },
      tags: ["reference"],
    },
    placement: { groupId: null },
    lifecycle: {},
    timestamps: { createdAt: now, updatedAt: now },
  };
}
function group(id = "custom") {
  return {
    id,
    details: {
      name: "Custom",
      description: "Agent filing context",
      category: "manual",
      accent: "#123456",
    },
    timestamps: { createdAt: now, updatedAt: now },
  };
}

test("schema-v4 conversion preserves occurrence identity, exact URL, and Unassigned", () => {
  const vault = defaultVault();
  vault.library.tabs = [tab()];
  vault.library.tabOrders.unassigned = ["tab-1"];
  vault.library.vaultGroups.push(group());
  assert.equal(isPersistedVault(vault), true);
  const document = vaultToServerDocument(vault);
  assert.equal(document.schemaVersion, 4);
  assert.equal(
    document.library.tabs[0].annotations.customProperties.viewed,
    true
  );
  assert.equal(document.library.tabs[0].id, "tab-1");
  assert.equal(document.library.tabs[0].placement.groupId, null);
  assert.equal(
    document.library.tabs[0].content.url,
    vault.library.tabs[0].content.url
  );
  assert.equal(document.library.groups[0].details.category, "manual");
  const remoteTab = JSON.parse(JSON.stringify(document.library.tabs[0]));
  remoteTab.id = "tab-2";
  remoteTab.placement.groupId = "custom";
  const hydrated = serverDocumentToVault(
    {
      ...document,
      library: {
        ...document.library,
        tabs: [...document.library.tabs, remoteTab],
      },
    },
    vault
  );
  assert.equal(hydrated.library.tabs.length, 2);
  assert.equal(
    hydrated.library.tabs.find(tab => tab.id === "tab-2").placement.groupId,
    "custom"
  );
  assert.equal(
    hydrated.library.tabs[0].annotations.agentReview,
    "Useful agent summary"
  );
});

test("schema guards reject previous versions and flat records without modifying input", () => {
  for (const schemaVersion of [1, 2, 3]) {
    const old = { ...defaultVault(), schemaVersion };
    const snapshot = JSON.parse(JSON.stringify(old));
    assert.equal(isPersistedVault(old), false);
    assert.throws(
      () => serverDocumentToVault(old, defaultVault()),
      /schema v4/
    );
    assert.deepEqual(old, snapshot);
  }
  const malformed = defaultVault();
  malformed.library.tabs = [{ id: "flat", url: "https://example.com" }];
  assert.equal(isPersistedVault(malformed), false);
});

test("tombstones suppress resurrection in current server documents", () => {
  const vault = defaultVault();
  vault.library.tabs = [tab("deleted-tab")];
  vault.library.vaultGroups = [group("deleted-group")];
  const document = vaultToServerDocument(vault);
  vault.library.tombstones = {
    tabs: ["deleted-tab"],
    groups: ["deleted-group"],
  };
  const hydrated = serverDocumentToVault(document, vault);
  assert.deepEqual(hydrated.library.tabs, []);
  assert.deepEqual(hydrated.library.vaultGroups, []);
  assert.deepEqual(hydrated.library.tombstones, vault.library.tombstones);
});

test("portable timestamps without a timezone are treated as UTC", () => {
  assert.equal(
    utcTimestamp("2026-08-29T20:37:37.346680"),
    "2026-08-29T20:37:37.346Z"
  );
  const vault = defaultVault();
  const collection = group();
  collection.timestamps.updatedAt = "2026-08-29T20:37:37.346680";
  vault.library.vaultGroups = [collection];
  const document = vaultToServerDocument(vault);
  assert.equal(
    document.library.groups[0].timestamps.updatedAt,
    "2026-08-29T20:37:37.346Z"
  );
});
