# Saved URL is original

TabVault stores only the original Saved URL and treats differences in query parameters, query order,
fragments, encoding, trailing slashes, or casing as meaningful. URL equality is exact and TabVault
does not maintain a secondary URL identity. This avoids complex, potentially destructive URL
equivalence rules.
