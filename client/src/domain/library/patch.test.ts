import { expect, it } from "vitest";
import { patchTab } from "./patch";
import type { VaultTab } from "./types";

it("retains untouched nested fields while accepting false, empty lists, and null", () => {
  const tab: VaultTab = {
    id: "tab",
    content: {
      url: "https://example.com",
      title: "Title",
      domain: "example.com",
      color: "#000",
      icon: "T",
    },
    annotations: {
      note: "Keep",
      agentReview: "Review",
      viewed: true,
      customProperties: { priority: 1 },
      tags: ["docs"],
    },
    placement: { groupId: "group" },
    lifecycle: { archived: false, hiddenUntil: "2999-01-01T00:00:00Z" },
    timestamps: { createdAt: "now", updatedAt: "now" },
  };
  const updated = patchTab(tab, {
    content: { title: "Changed" },
    annotations: { viewed: false, tags: [] },
    placement: { groupId: null },
    lifecycle: { hiddenUntil: null },
  });
  expect(updated.content.url).toBe(tab.content.url);
  expect(updated.annotations).toEqual({
    ...tab.annotations,
    viewed: false,
    tags: [],
  });
  expect(updated.placement.groupId).toBeNull();
  expect(updated.lifecycle).toEqual({ archived: false, hiddenUntil: null });
  expect(tab.annotations.viewed).toBe(true);
  expect(tab.content.title).toBe("Title");
});
