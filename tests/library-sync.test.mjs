import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultVault,
  isPersistedVault,
  serverDocumentToVault,
  vaultToServerDocument,
} from "../dist/public/library-sync.js";
const now = "2026-08-23T12:00:00.000Z";
test("v5 portable round trip preserves raw properties, occurrence identity and original URL", () => {
  const vault = defaultVault();
  vault.propertySchema = {
    note: { description: "", type: "string", default: "" },
  };
  vault.library.tabs = [
    {
      id: "one",
      content: {
        url: "HTTPS://Example.com/a?b=2&a=1#fragment",
        title: "Example",
        domain: "example.com",
        color: "#123456",
        icon: "E",
      },
      annotations: {
        customProperties: { note: "Useful", unknown: null },
        tags: [],
      },
      placement: { groupId: null, position: 2 },
      lifecycle: { archived: false, archivedAt: null, hiddenUntil: null },
      timestamps: { createdAt: now, updatedAt: now },
    },
  ];
  const document = vaultToServerDocument(vault);
  assert.equal(document.schemaVersion, 5);
  const hydrated = serverDocumentToVault(document, vault);
  assert.equal(isPersistedVault(hydrated), true);
  assert.equal(
    hydrated.library.tabs[0].content.url,
    vault.library.tabs[0].content.url
  );
  assert.deepEqual(
    hydrated.library.tabs[0].annotations,
    vault.library.tabs[0].annotations
  );
  assert.equal(hydrated.library.tabs[0].placement.position, 2);
});
test("legacy and malformed records are rejected without changing the input", () => {
  for (const version of [1, 2, 3, 4]) {
    const previous = { ...defaultVault(), schemaVersion: version };
    const copy = globalThis.structuredClone(previous);
    assert.equal(isPersistedVault(previous), false);
    assert.throws(() => serverDocumentToVault(previous), /schema v5/);
    assert.deepEqual(previous, copy);
  }
  const malformed = defaultVault();
  malformed.library.tabs = [{ id: "flat", url: "https://example.com" }];
  assert.equal(isPersistedVault(malformed), false);
});
