# MCP uses human-readable selectors

MCP hides persisted Tab and Group IDs and instead addresses visible Saved Tabs by exact original URL
and Groups by case-insensitive exact name. The adapter deterministically chooses the oldest match
when selectors collide, while the backend, browser synchronization, and tombstones retain stable
IDs; this trades unambiguous agent targeting for a smaller human-readable MCP contract.
