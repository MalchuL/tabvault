import { describe, expect, it } from "vitest";
import { emptyBrowserVault } from "@/lib/library";
import { libraryReducer } from "./state";

describe("libraryReducer", () => {
  it("replaces the complete vault", () => {
    const next = { ...emptyBrowserVault(), tagCatalog: { docs: "Docs" } };
    expect(
      libraryReducer(emptyBrowserVault(), { type: "replace", vault: next })
    ).toBe(next);
  });

  it("applies a multi-field mutation atomically", () => {
    const next = libraryReducer(emptyBrowserVault(), {
      type: "mutate",
      update: current => ({
        ...current,
        tabs: [],
        tabOrders: { all: [] },
      }),
    });
    expect(next.tabs).toEqual([]);
    expect(next.tabOrders).toEqual({ all: [] });
  });

  it("updates one field from a value or updater", () => {
    const withTag = libraryReducer(emptyBrowserVault(), {
      type: "update",
      key: "tagCatalog",
      value: { docs: "Docs" },
    });
    const withTwoTags = libraryReducer(withTag, {
      type: "update",
      key: "tagCatalog",
      value: current => ({ ...current, later: "Later" }),
    });
    expect(withTwoTags.tagCatalog).toEqual({ docs: "Docs", later: "Later" });
    expect(withTwoTags.tabs).toBe(withTag.tabs);
  });
});
