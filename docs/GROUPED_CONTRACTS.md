# Grouped contracts (schema v5)

Saved Tabs group fields into `content` (original URL/title), `annotations` (raw customProperties/tags), `placement` (groupId/position), `lifecycle` (archived/archivedAt/hiddenUntil), and `timestamps` (createdAt/updatedAt). There are no dedicated note, review, or viewed fields.

Groups contain `details`, `placement`, and `timestamps`. Categories are ordinary strings; the browser's Quick Move convention targets `manual`. Editing a title or description does not automatically change a category.

Tags retain case-insensitive identity, description, and timestamps. Property definitions have case-sensitive names and contain a type, description, and default. Browser sync metadata includes one generation, one pending-change map for all resource kinds, and definition timestamps.

The canonical portable schema is [v5.tabvault.schema.json](../local-server/schema/v5.tabvault.schema.json). OpenAPI at `/docs` describes the complete HTTP boundary. [Storage lifecycle](STORAGE_AND_ARCHIVE_LIFECYCLE.md) describes `POST /sync`, transactions, conflicts, retries, and deletion behavior.

Runtime configuration groups HTTP, storage, and logging settings. The frontend remains React/Vite; the backend remains FastAPI, SQLAlchemy, and SQLite. MCP remains an independently deployed API client restricted to visible active records.
