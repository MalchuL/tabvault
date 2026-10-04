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
        library: { ...current.library, tabs: [], tags: [] },
      }),
    });
    expect(next.library.tabs).toEqual([]);
    expect(next.library.tags).toEqual([]);
  });

  it("updates one field from a value or updater", () => {
    const withTag = libraryReducer(emptyBrowserVault(), {
      type: "update",
      group: "library",
      key: "tags",
      value: [
        {
          name: "Research",
          description: "",
          createdAt: "2026-08-23T10:00:00.000Z",
          updatedAt: "2026-08-23T10:00:00.000Z",
        },
      ],
    });
    const withTwoTags = libraryReducer(withTag, {
      type: "update",
      group: "library",
      key: "tags",
      value: current => [
        ...current,
        {
          name: "Docs",
          description: "Documentation",
          createdAt: "2026-08-23T10:00:00.000Z",
          updatedAt: "2026-08-23T10:00:00.000Z",
        },
      ],
    });
    expect(withTwoTags.library.tags).toHaveLength(2);
    expect(withTwoTags.library.tabs).toBe(withTag.library.tabs);
  });
});
