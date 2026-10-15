import { expect, it } from "vitest";
import { emptyBrowserVault } from "./codec";
import { captureTabs } from "./operations";

it("prepends single captures to Unassigned without changing existing collections", () => {
  const session = captureTabs(emptyBrowserVault(), [
    { url: "https://example.com/a" },
    { url: "https://example.com/b" },
  ]);
  const first = captureTabs(session, [{ url: "https://example.com" }]);
  const next = captureTabs(first, [{ url: "https://example.com" }]);

  expect(next.library.vaultGroups).toBe(session.library.vaultGroups);
  expect(next.library.tabs.slice(2)).toEqual(session.library.tabs);
  expect(next.library.tabs.slice(0, 2).map(tab => tab.placement)).toEqual([
    { groupId: null, position: 0 },
    { groupId: null, position: 1 },
  ]);
  expect(new Set(next.library.tabs.map(tab => tab.id)).size).toBe(4);
  expect(first.library.tabs[0].placement.position).toBe(0);
});

it("keeps multi-tab captures in a new session and empty captures unchanged", () => {
  const initial = captureTabs(emptyBrowserVault(), [
    { url: "https://example.com/single" },
  ]);
  const next = captureTabs(initial, [
    { url: "https://example.com/a" },
    { url: "https://example.com/b" },
  ]);
  expect(next.library.vaultGroups).toHaveLength(1);
  const group = next.library.vaultGroups[0];
  expect(group.details.category).toBe("session");
  expect(next.library.tabs.slice(0, 2).map(tab => tab.placement)).toEqual([
    { groupId: group.id, position: 0 },
    { groupId: group.id, position: 1 },
  ]);
  expect(next.library.tabs[2]).toEqual(initial.library.tabs[0]);
  expect(captureTabs(next, [])).toBe(next);
});
