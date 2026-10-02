import { expect, it } from "vitest";
import { emptyBrowserVault } from "./codec";
import { captureTabs, updateTab } from "./operations";
import {
  isCurrentlyHidden,
  libraryStats,
  searchTabs,
  sortTabs,
} from "./selectors";
it("classifies lifecycle, canonical order, and text search including defaults", () => {
  let vault = captureTabs(emptyBrowserVault(), [
    { url: "https://example.com/b", title: "Beta" },
    { url: "https://example.com/a", title: "Alpha" },
    { url: "https://example.com/c", title: "Gamma" },
  ]);
  const [a, b, c] = vault.library.tabs;
  vault = updateTab(vault, b.id, {
    lifecycle: { hiddenUntil: "2040-01-01T00:00:00Z" },
  });
  vault = updateTab(vault, c.id, { lifecycle: { archived: true } });
  expect(
    isCurrentlyHidden(vault.library.tabs[1], Date.parse("2030-01-01"))
  ).toBe(true);
  expect(
    isCurrentlyHidden(vault.library.tabs[1], Date.parse("2050-01-01"))
  ).toBe(false);
  expect(libraryStats(vault, Date.parse("2030-01-01"))).toEqual({
    activeCount: 1,
    hiddenCount: 1,
    archivedCount: 1,
    tagCount: 0,
  });
  expect(sortTabs([b, a], vault).map(t => t.id)).toEqual([a.id, b.id]);
  expect(searchTabs(vault.library.tabs, "alpha", vault).map(t => t.id)).toEqual(
    [b.id]
  );
  expect(searchTabs(vault.library.tabs, "", vault)).toBe(vault.library.tabs);
  vault.propertySchema = {
    context: { type: "string", description: "", default: "Research" },
  };
  expect(searchTabs(vault.library.tabs, "research", vault)).toHaveLength(3);
  expect(searchTabs(vault.library.tabs, "not found", vault)).toEqual([]);
});
