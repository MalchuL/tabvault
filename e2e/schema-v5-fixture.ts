import type { Page } from "@playwright/test";
export const schemaV5Vault = {
  propertySchema: {
    viewed: {
      description: "",
      type: "boolean",
      default: false,
    },
    note: {
      type: "string",
      description: "Saved note",
      default: "",
    },
    agentReview: {
      type: "string",
      description: "Agent review",
      default: "",
    },
  },
  schemaVersion: 5,
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
          createdAt: "2026-08-23T11:00:00.000Z",
          updatedAt: "2026-08-23T11:00:00.000Z",
        },
        placement: {
          position: 0,
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
          createdAt: "2026-08-23T10:00:00.000Z",
          updatedAt: "2026-08-23T10:00:00.000Z",
        },
        placement: {
          position: 1,
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
          createdAt: "2026-08-23T10:00:00.000Z",
          updatedAt: "2026-08-23T10:00:00.000Z",
        },
        placement: {
          position: 2,
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
          tags: ["product"],
          customProperties: {
            note: "A useful framing for the agent-facing contract.",
            agentReview: "",
            viewed: false,
          },
        },
        placement: {
          groupId: null,
          position: 0,
        },
        lifecycle: {
          archived: false,
          archivedAt: null,
          hiddenUntil: null,
        },
        timestamps: {
          createdAt: "2026-08-23T10:00:00.000Z",
          updatedAt: "2026-08-23T10:00:00.000Z",
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
          tags: ["product"],
          customProperties: {
            note: "A useful framing for the agent-facing contract.",
            agentReview: "",
            viewed: false,
          },
        },
        placement: {
          groupId: "session",
          position: 0,
        },
        lifecycle: {
          archived: false,
          archivedAt: null,
          hiddenUntil: null,
        },
        timestamps: {
          createdAt: "2026-08-23T11:00:00.000Z",
          updatedAt: "2026-08-23T11:00:00.000Z",
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
          tags: ["mcp"],
          customProperties: {
            note: "Reference implementation details.",
            agentReview: "",
            viewed: false,
          },
        },
        placement: {
          groupId: "research",
          position: 0,
        },
        lifecycle: {
          archived: false,
          archivedAt: null,
          hiddenUntil: null,
        },
        timestamps: {
          createdAt: "2026-08-23T10:00:00.000Z",
          updatedAt: "2026-08-23T10:00:00.000Z",
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
          tags: [],
          customProperties: {
            note: "Come back later",
            agentReview: "",
            viewed: false,
          },
        },
        placement: {
          groupId: "research",
          position: 1,
        },
        lifecycle: {
          archived: false,
          archivedAt: null,
          hiddenUntil: "2999-01-01T00:00:00.000Z",
        },
        timestamps: {
          createdAt: "2026-08-23T10:00:00.000Z",
          updatedAt: "2026-08-23T10:00:00.000Z",
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
          tags: [],
          customProperties: {
            note: "Archived",
            agentReview: "",
            viewed: false,
          },
        },
        placement: {
          groupId: null,
          position: 0,
        },
        lifecycle: {
          archived: true,
          archivedAt: "2026-08-23T11:00:00.000Z",
          hiddenUntil: "2999-01-01T00:00:00.000Z",
        },
        timestamps: {
          createdAt: "2026-08-23T10:00:00.000Z",
          updatedAt: "2026-08-23T10:00:00.000Z",
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
          tags: ["shared", "old"],
          customProperties: {
            note: "Old note",
            agentReview: "old review",
            viewed: false,
          },
        },
        placement: {
          groupId: null,
          position: 1,
        },
        lifecycle: {
          archived: false,
          archivedAt: null,
          hiddenUntil: null,
        },
        timestamps: {
          createdAt: "2026-08-23T10:00:00.000Z",
          updatedAt: "2026-08-23T10:00:00.000Z",
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
          tags: ["shared", "new"],
          customProperties: {
            note: "New note",
            agentReview: "new review",
            viewed: true,
          },
        },
        placement: {
          groupId: "session",
          position: 1,
        },
        lifecycle: {
          archived: false,
          archivedAt: null,
          hiddenUntil: null,
        },
        timestamps: {
          createdAt: "2026-08-23T11:00:00.000Z",
          updatedAt: "2026-08-23T11:00:00.000Z",
        },
      },
    ],
    tags: [
      {
        name: "product",
        description: "Product",
        createdAt: "2026-08-23T10:00:00.000Z",
        updatedAt: "2026-08-23T10:00:00.000Z",
      },
      {
        name: "mcp",
        description: "Protocol",
        createdAt: "2026-08-23T10:00:00.000Z",
        updatedAt: "2026-08-23T10:00:00.000Z",
      },
      {
        name: "merged",
        description: "Merged",
        createdAt: "2026-08-23T10:00:00.000Z",
        updatedAt: "2026-08-23T10:00:00.000Z",
      },
    ],
  },
  preferences: {
    tabView: "standard",
  },
  sync: {
    generation: null,
    pending: {},
    propertyTimes: {},
  },
};
export async function openSchemaV5Library(page: Page) {
  await page.goto("/");
  await page.evaluate(vault => {
    localStorage.clear();
    localStorage.setItem("tabvault-storage-mode", "local");
    localStorage.setItem("tabvault-v3", JSON.stringify(vault));
  }, schemaV5Vault);
  await page.reload();
  await page.getByTestId("tab-row-t-1001").waitFor();
}
