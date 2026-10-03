---
name: backend-architecture
description: Maintain domain boundaries in a FastAPI service. Use for changes to backend routes, services, persistence, authorization, or outbound clients.
---

# Backend architecture

Follow the backend's existing package structure and dependencies. This skill describes a FastAPI pattern, not a reason to migrate a simpler service to a new ORM, DI framework, or folder layout.

- Keep HTTP parsing and responses at the route boundary, domain rules in services, and persistence in repositories where those layers already exist. Add a layer only when it separates real responsibilities.
- Keep domain errors independent of FastAPI; translate them at the HTTP boundary. Preserve authorization checks and transaction ownership when changing a use case.
- Return DTOs rather than exposing ORM objects. Keep API field names and JSON contracts compatible with clients.
- Inject outbound clients when the service already uses DI. Treat optional satellite failures according to the current use case rather than a blanket rule.
- Document behavior that names and types do not explain, especially transactions, authorization, and failure boundaries. Skip restating obvious signatures.
- Add or update a focused check for changed behavior. Run the affected backend checks; fix failures caused by the change.

Read [layers-dto-pagination.md](layers-dto-pagination.md) only when changing DTO mapping, repository layering, or pagination. Read [satellites-and-docker.md](satellites-and-docker.md) only when changing outbound services, settings, or container setup. Treat their examples as patterns to adapt to the current code, not required scaffolding.
