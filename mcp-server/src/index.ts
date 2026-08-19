/**
 * TabVault MCP service. The maintained MCP SDK provides the stdio transport,
 * tool registry, request validation, and protocol lifecycle; this adapter only maps typed tools to the local API.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const baseUrl = (
  process.env.TABVAULT_SERVER_URL || "http://127.0.0.1:4817"
).replace(/\/+$/, "");
const apiKey = process.env.TABVAULT_API_KEY || "admin";
type HttpOptions = RequestInit & { headers?: Record<string, string> };

async function api<T>(path: string, options: HttpOptions = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(options.headers ?? {}),
    },
    ...options,
  });
  const body = await response
    .json()
    .catch(() => ({ detail: response.statusText }));
  if (!response.ok) throw new Error(JSON.stringify(body));
  return body as T;
}

function json(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

const server = new McpServer({ name: "tabvault", version: "0.2.0" });
const idSchema = z.string().min(1);

server.tool(
  "list_tabs",
  "List saved tabs, optionally filtered by group or tag.",
  {
    group: z.string().optional(),
    tag: z.string().optional(),
    fields: z.enum(["minimal", "full"]).optional(),
  },
  async ({ group, tag, fields }) => {
    const query = new URLSearchParams();
    if (group) query.set("group", group);
    if (tag) query.set("tag", tag);
    if (fields) query.set("fields", fields);
    return json(await api(`/v1/tabs${query.size ? `?${query}` : ""}`));
  }
);
server.tool(
  "get_tab",
  "Get the complete record for one saved tab.",
  { id: idSchema },
  async ({ id }) => json(await api(`/v1/tabs/${encodeURIComponent(id)}`))
);
server.tool(
  "search_tabs",
  "Search saved tabs through TabVault's semantic index, with an explicit lexical fallback when embeddings are unavailable.",
  { query: z.string().min(1), group: z.string().optional() },
  async ({ query, group }) => {
    const params = new URLSearchParams({ q: query });
    if (group) params.set("group", group);
    return json(await api(`/v1/search?${params}`));
  }
);
server.tool(
  "semantic_index_status",
  "Report the local embedding provider, model, index state, batching, and health schedule.",
  {},
  async () => json(await api("/v1/index/status"))
);
server.tool(
  "rebuild_semantic_index",
  "Rebuild the derived local semantic index from the authoritative TabVault library.",
  {},
  async () => json(await api("/v1/index/rebuild", { method: "POST" }))
);

const tabInput = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  note: z.string().optional(),
  tags: z.array(z.string()).optional(),
  groupId: z.string().nullable().optional(),
  favicon: z.string().url().optional(),
});
server.tool(
  "save_tab",
  "Save one URL. Duplicate URLs merge local tags and notes.",
  tabInput.shape,
  async input =>
    json(
      await api("/v1/tabs", {
        method: "POST",
        body: JSON.stringify({
          ...input,
          tags: input.tags ?? [],
          groupId: input.groupId ?? null,
        }),
      })
    )
);
server.tool(
  "save_tabs",
  "Save multiple URLs through the same typed local contract.",
  { tabs: z.array(tabInput).min(1) },
  async ({ tabs }) =>
    json({
      results: await Promise.all(
        tabs.map(tab =>
          api("/v1/tabs", {
            method: "POST",
            body: JSON.stringify({
              ...tab,
              tags: tab.tags ?? [],
              groupId: tab.groupId ?? null,
            }),
          })
        )
      ),
    })
);
server.tool(
  "update_tab",
  "Update a tab title, URL, note, tags, collection, or position.",
  {
    id: idSchema,
    title: z.string().optional(),
    url: z.string().url().optional(),
    note: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    groupId: z.string().nullable().optional(),
    position: z.number().int().nonnegative().optional(),
  },
  async ({ id, ...updates }) =>
    json(
      await api(`/v1/tabs/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      })
    )
);
server.tool(
  "move_tab",
  "Move a tab to another collection and optionally set its order position.",
  {
    id: idSchema,
    groupId: z.string().nullable(),
    position: z.number().int().nonnegative().optional(),
  },
  async ({ id, groupId, position }) =>
    json(
      await api(`/v1/tabs/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          groupId,
          ...(position === undefined ? {} : { position }),
        }),
      })
    )
);
server.tool(
  "delete_tab",
  "Delete a saved tab by id.",
  { id: idSchema },
  async ({ id }) =>
    json(await api(`/v1/tabs/${encodeURIComponent(id)}`, { method: "DELETE" }))
);

server.tool(
  "list_groups",
  "Return the complete nested collection list.",
  {},
  async () => json(await api("/v1/groups"))
);
server.tool(
  "create_group",
  "Create a collection, optionally inside another collection.",
  {
    name: z.string().min(1),
    parentId: z.string().nullable().optional(),
    color: z.string().optional(),
  },
  async input =>
    json(
      await api("/v1/groups", { method: "POST", body: JSON.stringify(input) })
    )
);
server.tool(
  "update_group",
  "Rename or move a collection.",
  {
    id: idSchema,
    name: z.string().optional(),
    parentId: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
    position: z.number().int().nonnegative().optional(),
  },
  async ({ id, ...updates }) =>
    json(
      await api(`/v1/groups/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      })
    )
);
server.tool(
  "delete_group",
  "Delete a collection tree; its tabs move to Inbox.",
  { id: idSchema },
  async ({ id }) =>
    json(
      await api(`/v1/groups/${encodeURIComponent(id)}`, { method: "DELETE" })
    )
);

server.tool(
  "list_tags",
  "List the tag directory and descriptions.",
  {},
  async () => json(await api("/v1/tags"))
);
server.tool(
  "add_tag",
  "Add a tag to the local directory.",
  { name: z.string().min(1), description: z.string().optional() },
  async input =>
    json(await api("/v1/tags", { method: "POST", body: JSON.stringify(input) }))
);
server.tool(
  "remove_tag",
  "Remove a tag from the directory and linked tabs.",
  { name: z.string().min(1) },
  async ({ name }) =>
    json(
      await api(`/v1/tags/${encodeURIComponent(name)}`, { method: "DELETE" })
    )
);

server.tool(
  "export_data",
  "Export exact JSON or readable Markdown, optionally scoped by collection or tag.",
  {
    format: z.enum(["json", "markdown"]).default("json"),
    group: z.string().optional(),
    tag: z.string().optional(),
  },
  async ({ format, group, tag }) => {
    const params = new URLSearchParams({ format });
    if (group) params.set("group", group);
    if (tag) params.set("tag", tag);
    return json(await api(`/v1/export?${params}`));
  }
);
server.tool(
  "import_data",
  "Validate and import TabVault JSON or Markdown. Replace creates a local backup before writing.",
  {
    mode: z.enum(["upload", "replace"]),
    format: z.enum(["json", "markdown"]),
    content: z.unknown(),
  },
  async input =>
    json(
      await api("/v1/import", { method: "POST", body: JSON.stringify(input) })
    )
);

await server.connect(new StdioServerTransport());
