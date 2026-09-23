import { describe, expect, it } from "vitest";
import { emptyBrowserVault } from "./codec";
import {
  currentSearchResponse,
  isCurrentlyHidden,
  libraryStats,
  searchResultTabs,
  sortTabs,
} from "./selectors";
import type { VaultTab } from "./types";

function tab(id: string, groupId: string | null, updates = {}): VaultTab {
  return {
    id,
    groupId,
    title: id,
    url: `https://example.com/${id}`,
    domain: "example.com",
    note: "",
    agentReview: "",
    viewed: false,
    customProperties: {},
    tags: [],
    color: "#000",
    icon: id[0],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...updates,
  };
}

describe("library selectors", () => {
  it("classifies visible, hidden, and archived tabs at one instant", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const vault = {
      ...emptyBrowserVault(),
      tabs: [
        tab("active", null),
        tab("hidden", null, { hiddenUntil: "2027-01-01T00:00:00Z" }),
        tab("expired", null, { hiddenUntil: "2025-01-01T00:00:00Z" }),
        tab("archived", null, {
          archived: true,
          hiddenUntil: "2027-01-01T00:00:00Z",
        }),
      ],
      tagCatalog: { docs: "Docs" },
    };
    expect(isCurrentlyHidden(vault.tabs[1], now)).toBe(true);
    expect(isCurrentlyHidden(vault.tabs[2], now)).toBe(false);
    expect(libraryStats(vault, now)).toEqual({
      activeCount: 2,
      hiddenCount: 1,
      archivedCount: 1,
      tagCount: 1,
    });
  });

  it("sorts collection order before relative tab order", () => {
    const tabs = [tab("b", "second"), tab("a", "first"), tab("c", "first")];
    const vault = {
      vaultGroups: [
        {
          id: "first",
          name: "First",
          description: "",
          category: "manual",
          accent: "#000",
          createdAt: "now",
          updatedAt: "now",
        },
        {
          id: "second",
          name: "Second",
          description: "",
          category: "manual",
          accent: "#000",
          createdAt: "now",
          updatedAt: "now",
        },
      ],
      tabOrders: { first: ["c", "a"], second: ["b"] },
    };
    expect(sortTabs(tabs, vault).map(item => item.id)).toEqual(["c", "a", "b"]);
    expect(tabs.map(item => item.id)).toEqual(["b", "a", "c"]);
  });

  it("keeps local tab details and safely displays server-only search results", () => {
    const local = tab("local", null, { note: "Browser note" });
    const results = [
      {
        tab: { id: "local", title: "Server title", url: local.url, tags: [] },
        score: 0.9,
      },
      {
        tab: {
          id: "remote",
          title: "Remote title",
          url: "https://www.example.com/page",
          groupId: "missing",
          tags: ["docs"],
        },
        score: 0.8,
      },
    ];
    const selected = searchResultTabs(
      results,
      [local],
      [],
      "2026-01-02T00:00:00Z"
    );
    expect(selected[0]).toBe(local);
    expect(selected[1]).toMatchObject({
      id: "remote",
      groupId: null,
      domain: "example.com",
      tags: ["docs"],
      createdAt: "2026-01-02T00:00:00Z",
    });
  });

  it("rejects search responses for a previous query, collection, or page", () => {
    const response = {
      mode: "semantic" as const,
      query: "Research",
      group: "group-a",
      results: [],
    };
    expect(currentSearchResponse(response, " research ", "group-a", true)).toBe(
      response
    );
    expect(
      currentSearchResponse(response, "notes", "group-a", true)
    ).toBeNull();
    expect(
      currentSearchResponse(response, "research", "group-b", true)
    ).toBeNull();
    expect(
      currentSearchResponse(response, "research", "group-a", false)
    ).toBeNull();
  });
});
