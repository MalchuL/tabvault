---
name: frontend-architecture
description: Maintain a Next.js App Router frontend. Use for changes to its routes, domain UI, API clients, auth, runtime configuration, or container setup.
---

# Frontend architecture

Use this skill only for a Next.js App Router frontend. The current TabVault client is React/Vite; follow its existing structure unless the task explicitly involves a Next.js app or migration.

- Keep page files focused on routing and composition. Put feature UI and behavior near the feature; move code to shared components only when it is reused.
- Keep server data in the existing query layer and transient UI state in the existing client state layer. Add hooks, stores, or providers only when the feature needs them.
- Use the project's shared API client and error handling. Normalize wire data at the boundary when UI models differ. Keep navigation paths separate from backend routes where the project already does so.
- Use Next Route Handlers when browser requests need server credentials or access to internal hosts. Never expose secrets to browser runtime configuration.
- For API URLs that operators must change without rebuilding, read server environment at runtime; `NEXT_PUBLIC_*` values are fixed at build time. Read [runtime-and-docker.md](runtime-and-docker.md) when changing that mechanism or the container.
- Preserve existing auth channels and session behavior. Comment on non-obvious invariants rather than documenting every export or prop.
- Check changed behavior with the affected frontend tests or build. Broaden verification when the change creates a concrete integration risk.
