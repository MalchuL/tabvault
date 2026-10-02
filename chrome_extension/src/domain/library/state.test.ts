import { describe, expect, it } from "vitest";
import { emptyBrowserVault } from "./codec";
import { libraryReducer } from "./state";

describe("libraryReducer", () => {
  it("replaces the complete vault", () => {
    const next = emptyBrowserVault();
    next.preferences.tabView = "compact";
    expect(
      libraryReducer(emptyBrowserVault(), { type: "replace", vault: next })
    ).toBe(next);
  });

  it("applies a multi-field mutation atomically", () => {
    const next = libraryReducer(emptyBrowserVault(), {
      type: "mutate",
      update: current => ({
        ...current,
        library: { ...current.library, tabs: [], savedSearches: [] },
      }),
    });
    expect(next.library.tabs).toEqual([]);
    expect(next.library.savedSearches).toEqual([]);
  });

  it("updates one field from a value or updater", () => {
    const withTag = libraryReducer(emptyBrowserVault(), {
      type: "update",
      group: "library",
      key: "savedSearches",
      value: [],
    });
    const withTwoTags = libraryReducer(withTag, {
      type: "update",
      group: "library",
      key: "savedSearches",
      value: current => [
        ...current,
        { id: "one", name: "Research", query: "research", groupId: "all" },
      ],
    });
    expect(withTwoTags.library.savedSearches).toHaveLength(1);
    expect(withTwoTags.library.tabs).toBe(withTag.library.tabs);
  });
});
