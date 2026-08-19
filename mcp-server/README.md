# TabVault MCP Server

This **TypeScript** stdio MCP service gives an AI agent access to the same local TabVault data platform used by the Chrome extension. It uses the maintained `@modelcontextprotocol/sdk` `McpServer` framework, its `StdioServerTransport`, and typed Zod tool schemas. It does not store a second copy of the library; every operation proxies to the configured HTTP server.

## Setup

Install dependencies after the local server has been started.

```bash
cd mcp-server
pnpm install
TABVAULT_SERVER_URL=https://api.example.com TABVAULT_API_KEY=admin pnpm start
```

Configure `node /absolute/path/to/mcp-server/node_modules/.bin/tsx /absolute/path/to/mcp-server/src/index.ts` in an MCP-compatible agent. Set both `TABVAULT_SERVER_URL` and `TABVAULT_API_KEY` for any deployed API domain; the bearer key defaults to `admin` only for development.

## Quality commands

Run `pnpm validate` to perform Prettier verification, ESLint, and strict TypeScript checking. Use `pnpm format` to write formatting changes, `pnpm format:check` to verify formatting only, and `pnpm lint:fix` to apply safe ESLint fixes.

The available tools cover tab, group, and tag management as well as search and JSON/Markdown import-export. `search_tabs` reports whether a result used the local semantic index or the transparent lexical fallback. Use `semantic_index_status` to inspect model readiness and `rebuild_semantic_index` after changing the local embedding model.
