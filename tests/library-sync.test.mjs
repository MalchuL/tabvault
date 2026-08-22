import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultVault,
  serverDocumentToVault,
  vaultToServerDocument,
} from "../client/public/library-sync.js";

test("library conversion round-trips tabs and collections for merge refresh", () => {
  const vault = defaultVault();
  vault.tabs = [
    {
      id: "tab-1",
      groupId: "inbox",
      title: "Example",
      url: "https://example.com/a",
      domain: "example.com",
      note: "note",
      agentReview: "Useful agent summary",
      viewed: true,
      tags: ["quick save"],
      color: "#F05A28",
      icon: "E",
      updated: "now",
    },
  ];
  vault.tabOrders.inbox = ["tab-1"];
  vault.vaultGroups.push({
    id: "custom",
    name: "Custom",
    description: "Agent filing context",
    accent: "#123456",
  });

  const document = vaultToServerDocument(vault);
  assert.equal(document.tabs[0].id, "tab-1");
  assert.equal(document.tabs[0].agentReview, "Useful agent summary");
  assert.equal(document.tabs[0].viewed, true);
  assert.equal(document.groups.at(-1).id, "custom");
  assert.equal(document.groups.at(-1).description, "Agent filing context");

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
        },
      ],
    },
    vault
  );
  assert.equal(hydrated.tabs.length, 2);
  assert.ok(hydrated.vaultGroups.some(group => group.id === "custom"));
  assert.equal(
    hydrated.tabs.find(tab => tab.id === "tab-2")?.groupId,
    "custom"
  );
  const oldTab = hydrated.tabs.find(tab => tab.id === "tab-2");
  assert.equal(oldTab.note, "");
  assert.equal(oldTab.agentReview, "");
  assert.equal(oldTab.viewed, false);
});
