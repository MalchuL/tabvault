import type { Page } from "@playwright/test";
const now = "2026-08-23T10:00:00.000Z";
const later = "2026-08-23T11:00:00.000Z";
export const schemaV4Vault = {
  propertySchema: {
    viewed: {
      description: "",
      type: "boolean",
      default: false,
    },
  },
  schemaVersion: 4,
  library: {
    vaultGroups: [
      {
        id: "session",
        details: {
          name: "Session Aug 23 13:00",
          description: "Captured together",
          category: "session",
          accent: "#829b65",
        },
        timestamps: {
          createdAt: later,
          updatedAt: later,
        },
      },
      {
        id: "research",
        details: {
          name: "Research",
          description: "Research material",
          category: "manual",
          accent: "#829b65",
        },
        timestamps: {
          createdAt: now,
          updatedAt: now,
        },
      },
      {
        id: "empty",
        details: {
          name: "Empty shelf",
          description: "Kept explicitly",
          category: "custom-category",
          accent: "#829b65",
        },
        timestamps: {
          createdAt: now,
          updatedAt: now,
        },
      },
    ],
    tabs: [
      {
        id: "t-1001",
        content: {
          title: "Agents can organize the web better than we can",
          url: "https://notes.example.com/agents?b=2&a=1#part",
          domain: "notes.example.com",
          color: "#EDB958",
          icon: "A",
        },
        annotations: {
          note: "A useful framing for the agent-facing contract.",
          agentReview: "",
          viewed: false,
          tags: ["product"],
          customProperties: {},
        },
        placement: {
          groupId: null,
        },
        lifecycle: {},
        timestamps: {
          createdAt: now,
          updatedAt: now,
        },
      },
      {
        id: "t-duplicate",
        content: {
          title: "Agents can organize the web better than we can",
          url: "https://notes.example.com/agents?b=2&a=1#part",
          domain: "notes.example.com",
          color: "#EDB958",
          icon: "A",
        },
        annotations: {
          note: "A useful framing for the agent-facing contract.",
          agentReview: "",
          viewed: true,
          tags: ["Product", "merged"],
          customProperties: {},
        },
        placement: {
          groupId: "session",
        },
        lifecycle: {},
        timestamps: {
          createdAt: later,
          updatedAt: later,
        },
      },
      {
        id: "t-research",
        content: {
          title: "Model Context Protocol specification",
          url: "https://modelcontextprotocol.io/specification",
          domain: "modelcontextprotocol.io",
          color: "#0e3c34",
          icon: "M",
        },
        annotations: {
          note: "Reference implementation details.",
          agentReview: "",
          viewed: false,
          tags: ["mcp"],
          customProperties: {},
        },
        placement: {
          groupId: "research",
        },
        lifecycle: {},
        timestamps: {
          createdAt: now,
          updatedAt: now,
        },
      },
      {
        id: "t-hidden",
        content: {
          title: "Hidden research",
          url: "https://example.com/hidden",
          domain: "example.com",
          color: "#6b8c7e",
          icon: "H",
        },
        annotations: {
          note: "Come back later",
          agentReview: "",
          viewed: false,
          tags: [],
          customProperties: {},
        },
        placement: {
          groupId: "research",
        },
        lifecycle: {
          hiddenUntil: "2999-01-01T00:00:00.000Z",
        },
        timestamps: {
          createdAt: now,
          updatedAt: now,
        },
      },
      {
        id: "t-archived",
        content: {
          title: "Archived reference",
          url: "https://example.com/archived",
          domain: "example.com",
          color: "#6b8c7e",
          icon: "R",
        },
        annotations: {
          note: "Archived",
          agentReview: "",
          viewed: false,
          tags: [],
          customProperties: {},
        },
        placement: {
          groupId: null,
        },
        lifecycle: {
          archived: true,
          archivedAt: later,
          hiddenUntil: "2999-01-01T00:00:00.000Z",
        },
        timestamps: {
          createdAt: now,
          updatedAt: now,
        },
      },
      {
        id: "advanced-old",
        content: {
          title: "Old title",
          url: "https://example.com/exact?a=1#x",
          domain: "example.com",
          color: "#6b8c7e",
          icon: "O",
        },
        annotations: {
          note: "Old note",
          agentReview: "old review",
          viewed: false,
          tags: ["shared", "old"],
          customProperties: {},
        },
        placement: {
          groupId: null,
        },
        lifecycle: {},
        timestamps: {
          createdAt: now,
          updatedAt: now,
        },
      },
      {
        id: "advanced-new",
        content: {
          title: "New title",
          url: "https://example.com/exact?a=1#x",
          domain: "example.com",
          color: "#6b8c7e",
          icon: "N",
        },
        annotations: {
          note: "New note",
          agentReview: "new review",
          viewed: true,
          tags: ["shared", "new"],
          customProperties: {},
        },
        placement: {
          groupId: "session",
        },
        lifecycle: {},
        timestamps: {
          createdAt: later,
          updatedAt: later,
        },
      },
    ],
    tagCatalog: { product: "Product", mcp: "Protocol", merged: "Merged" },
    tabOrders: {
      unassigned: ["t-1001", "advanced-old"],
      session: ["t-duplicate", "advanced-new"],
      research: ["t-research", "t-hidden"],
      empty: [],
    },
    savedSearches: [],
  },
  preferences: {
    tabView: "standard",
  },
};
export async function openSchemaV4Library(page: Page) {
  await page.goto("/");
  await page.evaluate(vault => {
    localStorage.clear();
    localStorage.setItem("tabvault-v3", JSON.stringify(vault));
  }, schemaV4Vault);
  await page.reload();
  await page.getByTestId("tab-row-t-1001").waitFor();
}
