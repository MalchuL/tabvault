import { describe, expect, it } from "vitest";
import { emptyBrowserVault } from "@/lib/library";
import { isCurrentlyHidden, libraryStats, sortTabs } from "./selectors";
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
});
