# 0017: One durable library sync protocol and schema-driven properties

Status: Accepted. Supersedes synchronization details in ADR 0006 and 0009, and the indexing mechanism in ADR 0015.

Browser writes use pure domain operations and a serialized durable commit. Tabs, groups, tags, property definitions, values, and positions use a common pending-change envelope and one server transaction. Direct resource endpoints remain for MCP and explicit API consumers. Display preferences are local.

Use record timestamps with server-winning ties, exact acknowledgement tokens, permanent occurrence/group tombstones, and timestamped named-resource deletion. Authoritative replacement changes the library generation; adoption requires explicit local recovery/export. No implicit legacy migration runs.

Note, Agent Review, and Viewed have no dedicated storage fields. Client conventions are registered on demand through the generic schema. The edit dialog renders declared types and retains unknown raw values. The backend does not know convention names.

The product no longer includes AI search, saved-tab multi-selection, jobs, or captured page previews. Ordinary text search, collection actions, extension multi-tab capture, import/deduplication previews, and direct JSON backup restore remain.
