# Search indexes resolved custom properties behind a provider boundary

Search includes resolved Custom Property Values, including schema defaults, in both free-text
matching and typed property predicates while the relational database remains authoritative. A small
injected search-provider boundary contains the current local implementation and permits a future
external engine without adding Elasticsearch now; schema changes invalidate the derived index
because they may change searchable values without changing Saved Tab rows. This accepts rebuild
work after schema changes in exchange for search results that match the values clients observe.
