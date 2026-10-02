import { describe, expect, it } from "vitest";
import { emptyBrowserVault } from "./codec";
import { libraryReducer } from "./state";

describe("libraryReducer", () => {
  it("replaces the complete vault", () => {
    const next = emptyBrowserVault();
    next.library.tagCatalog = { docs: "Docs" };
    expect(
      libraryReducer(emptyBrowserVault(), { type: "replace", vault: next })
    ).toBe(next);
  });

  it("applies a multi-field mutation atomically", () => {
    const next = libraryReducer(emptyBrowserVault(), {
      type: "mutate",
      update: current => ({
        ...current,
        library: { ...current.library, tabs: [], tabOrders: { all: [] } },
      }),
    });
    expect(next.library.tabs).toEqual([]);
    expect(next.library.tabOrders).toEqual({ all: [] });
  });

  it("updates one field from a value or updater", () => {
    const withTag = libraryReducer(emptyBrowserVault(), {
      type: "update",
      group: "library",
      key: "tagCatalog",
      value: { docs: "Docs" },
    });
    const withTwoTags = libraryReducer(withTag, {
      type: "update",
      group: "library",
      key: "tagCatalog",
      value: current => ({ ...current, later: "Later" }),
    });
    expect(withTwoTags.library.tagCatalog).toEqual({
      docs: "Docs",
      later: "Later",
    });
    expect(withTwoTags.library.tabs).toBe(withTag.library.tabs);
  });
});
