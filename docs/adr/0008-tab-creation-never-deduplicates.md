# Tab creation never deduplicates

Creating a Saved Tab always creates a new save occurrence without searching, merging, or moving an
existing record with the same URL. Intentional duplicate reduction is a separate client
workflow. An optional in-process idempotency cache scopes keys to the authenticated client and
create endpoint, retains at most 10,000 entries for ten minutes, coalesces concurrent matching
requests, and rejects key reuse with a different payload. Cache loss on restart is accepted.
