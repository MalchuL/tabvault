# Schema v2 is a clean break

Schema v2 replaces the database migration history and does not read, import, export, or synchronize
schema v1. Incompatible browser-local data blocks normal loading and may be downloaded untouched
before the user explicitly clears it. This favors a coherent new model over compatibility code while
preserving a recovery path for manual adaptation of browser data.
