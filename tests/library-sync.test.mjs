import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultVault,
  isPersistedVault,
  serverDocumentToVault,
  utcTimestamp,
  vaultToServerDocument,
} from "../dist/public/library-sync.js";

test("schema-v3 conversion preserves occurrence identity, exact URL, and Unassigned", () => {
  const vault = defaultVault();
  const now = "2026-08-23T12:00:00.000Z";
  vault.tabs = [
    {
      id: "tab-1",
      groupId: null,
      title: "Example",
      url: "HTTPS://Example.com/a?b=2&a=1#fragment",
      domain: "example.com",
      note: "note",
      agentReview: "Useful agent summary",
      viewed: true,
      customProperties: { viewed: true },
      tags: ["reference"],
      color: "#F05A28",
      icon: "E",
      createdAt: now,
      updatedAt: now,
    },
  ];
  vault.tabOrders.unassigned = ["tab-1"];
  vault.vaultGroups.push({
    id: "custom",
    name: "Custom",
    description: "Agent filing context",
    category: "manual",
    accent: "#123456",
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(isPersistedVault(vault), true);
  const document = vaultToServerDocument(vault);
  assert.equal(document.schemaVersion, 3);
  assert.equal(document.tabs[0].customProperties.viewed, true);
  assert.equal(document.tabs[0].id, "tab-1");
  assert.equal(document.tabs[0].groupId, null);
  assert.equal(document.tabs[0].url, vault.tabs[0].url);
  assert.equal(document.groups[0].category, "manual");
  assert.equal("parentId" in document.groups[0], false);

  const hydrated = serverDocumentToVault(
    {
      ...document,
      tabs: [
        ...document.tabs,
        {
          id: "tab-2",
          url: "https://example.com/b",
          title: "Server only",
          tags: [],
          groupId: "custom",
          position: 0,
          createdAt: now,
          updatedAt: now,
        },
      ],
    },
    vault
  );
  assert.equal(hydrated.tabs.length, 2);
  assert.equal(
    hydrated.tabs.find(tab => tab.id === "tab-2")?.groupId,
    "custom"
  );
  assert.equal(hydrated.tabs.find(tab => tab.id === "tab-1")?.groupId, null);
  assert.equal(hydrated.tabs.find(tab => tab.id === "tab-2")?.agentReview, "");
});

test("schema guard rejects v1, hierarchy, Inbox-shaped, and normalized data", () => {
  assert.equal(
    isPersistedVault({ schemaVersion: 1, tabs: [], vaultGroups: [] }),
    false
  );
  const vault = defaultVault();
  vault.vaultGroups.push({
    id: "bad",
    name: "Bad",
    description: "",
    category: "manual",
    accent: "#000",
    createdAt: "now",
    updatedAt: "now",
    parent: "other",
  });
  assert.equal(isPersistedVault(vault), false);
  vault.vaultGroups = [];
  vault.tabs.push({
    id: "bad",
    groupId: null,
    title: "Bad",
    url: "https://example.com",
    domain: "example.com",
    note: "",
    agentReview: "",
    viewed: false,
    tags: [],
    color: "#000",
    icon: "B",
    createdAt: "now",
    updatedAt: "now",
    normalizedUrl: "https://example.com",
  });
  assert.equal(isPersistedVault(vault), false);
});

test("schema-v2 server data migrates and tombstones suppress resurrection", () => {
  const vault = defaultVault();
  vault.tombstones = { tabs: ["deleted-tab"], groups: ["deleted-group"] };
  const hydrated = serverDocumentToVault(
    {
      schemaVersion: 2,
      tags: [],
      groups: [
        {
          id: "deleted-group",
          name: "Returned group",
          category: "manual",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
      tabs: [
        {
          id: "deleted-tab",
          url: "https://example.com/deleted",
          title: "Returned tab",
          tags: [],
          groupId: null,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
    },
    vault
  );
  assert.deepEqual(hydrated.tabs, []);
  assert.deepEqual(hydrated.vaultGroups, []);
  assert.deepEqual(hydrated.tombstones, vault.tombstones);
});

test("portable timestamps without a timezone are treated as UTC", () => {
  assert.equal(
    utcTimestamp("2026-08-29T20:37:37.346680"),
    "2026-08-29T20:37:37.346Z"
  );
  assert.equal(
    utcTimestamp("2026-08-29T20:37:37.346680Z"),
    "2026-08-29T20:37:37.346Z"
  );
  const vault = defaultVault();
  vault.vaultGroups.push({
    id: "group-1",
    name: "Group",
    description: "",
    category: "manual",
    accent: "#829b65",
    createdAt: "2026-08-29T20:37:37.346680",
    updatedAt: "2026-08-29T20:37:37.346680",
  });
  const document = vaultToServerDocument(vault);
  assert.equal(document.groups[0].updatedAt, "2026-08-29T20:37:37.346Z");
  assert.match(document.groups[0].updatedAt, /Z$/);
});
