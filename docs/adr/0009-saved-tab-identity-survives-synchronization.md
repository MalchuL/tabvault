# Saved tab identity survives synchronization

A browser-created Saved Tab keeps the same ID when synchronized to the local server; only exact ID,
never URL equality, identifies the same occurrence across stores. Record-level `updatedAt`
last-write-wins resolves browser/server conflicts, and tombstones prevent deleted records from
reappearing. This accepts possible lost concurrent edits in exchange for a simple offline-capable
model consistent with the product's unsupported-concurrency assumption.
