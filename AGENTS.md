# Repository Guidelines

## Project Structure & Module Organization

`client/src/` contains the React/Vite application: pages live in `pages/`, product components in `components/`, UI primitives in `components/ui/`, and browser/storage logic in `lib/`. Extension assets and its MV3 manifest are in `client/public/`; builds go to `dist/public/`. Shared TypeScript constants live in `shared/`.

The FastAPI service is under `local-server/`, with code in `tabvault_server/`, JSON contracts in `schema/` and `errors/`, and Python tests in `tests/`. Root `tests/` covers extension synchronization; `e2e/` contains Playwright tests. Design references belong in `docs/`.

## Build, Test, and Development Commands

- `pnpm install` installs frontend dependencies from the lockfile.
- `pnpm dev` starts Vite on port 3000; `pnpm build` creates `dist/public/`.
- `pnpm validate` runs Prettier checks, ESLint, TypeScript, and a production build.
- `pnpm test:extension` runs the Node synchronization tests.
- `pnpm test:e2e` runs Playwright with its configured Vite server.
- `cd local-server && uv sync --group dev` prepares the Python environment.
- `make -C local-server check` runs Ruff formatting/linting, strict mypy, and unittest tests.
- `make -C local-server run` starts the API locally.

The root `make check` currently references a legacy `mcp-server/` directory that is not present; use the package-level commands above.

## Coding Style & Naming Conventions

Use Prettier and ESLint for TypeScript/React. Keep strict types, two-space indentation, double quotes, `PascalCase` component files, `camelCase` functions, and `useX` hooks. Prefer `@/` and `@shared/` aliases over long relative imports. Python targets 3.11, four spaces, double quotes, a 100-character line limit, Ruff, and fully typed functions checked by mypy.

## Testing Guidelines

Name Playwright files `*.spec.ts`, Node tests `*.test.mjs`, and Python tests `test_*.py` with `test_` methods. Add coverage beside changed behavior and include offline/local-storage and authenticated API paths when relevant. There is no numeric coverage threshold; all applicable suites must pass.

## Commit & Pull Request Guidelines

History uses short imperative subjects such as `Fix bugs`; make new subjects more specific, for example `Fix archive restore ordering`. Keep each commit focused. Pull requests should explain behavior and validation, link relevant issues, call out schema or configuration changes, and include screenshots or recordings for UI changes.

## Security & Configuration

Never commit bearer keys or local data. The development API key is `admin` only for trusted local use; set `TABVAULT_API_KEY` and restrictive `TABVAULT_CORS_ORIGINS` before network exposure. Preserve the archive-first lifecycle and browser-local fallback when changing storage flows.
