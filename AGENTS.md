# Repository Guidelines

Read the files relevant to the requested change. Finish the requested work, run the
affected checks, and fix failures caused by the change. Local tests use disposable
fixtures and do not need separate approval. Keep the existing React/Vite and FastAPI
stacks unless the task explicitly calls for a migration.

## Project Structure & Module Organization

`client/src/` contains the React/Vite application: pages live in `pages/`, the app shell in `components/shell/`, cross-feature components in `components/shared/`, shadcn UI primitives in `components/ui/`, and browser/storage logic in `lib/`. Extension assets and its MV3 manifest are in `client/public/`; builds go to `dist/public/`. Shared TypeScript constants live in `shared/`.

Library UI stays within `client/src/domain/library/components/`: `workspace/` owns page composition and interaction hooks, `tabs/` renders and edits saved tabs, `collections/` renders collection boards and drop targets, `tags/` owns tag management, and `shared/` holds controls reused across those library areas. Keep domain state and data rules in the parent `domain/library/` modules.

The FastAPI service is under `local-server/`, with code in `tabvault_server/`, JSON contracts in `schema/` and `errors/`, and Python tests in `tests/`. Root `tests/` covers extension synchronization; `e2e/` contains Playwright tests. Design references belong in `docs/`.

## Build, Test, and Development Commands

- `pnpm install` installs frontend dependencies from the lockfile.
- `pnpm dev` starts Vite on port 3000; `pnpm build` creates `dist/public/`.
- `pnpm validate` runs Prettier checks, ESLint, TypeScript, and a production build; use it for frontend changes that need the full gate.
- `pnpm test:extension` runs the Node synchronization tests.
- `pnpm test:e2e` runs Playwright with its configured Vite server.
- `cd local-server && uv sync --group dev` prepares the Python environment.
- `make -C local-server check` runs Ruff formatting/linting, strict mypy, and unittest tests for backend changes.
- `make -C local-server run` starts the API locally.

The root `make check` currently references a legacy `mcp-server/` directory that is not present; use the package-level commands above.

## Coding Style & Naming Conventions

Use Prettier and ESLint for TypeScript/React. Keep strict types, two-space indentation, double quotes, `PascalCase` component files, `camelCase` functions, and `useX` hooks. Prefer `@/` and `@shared/` aliases over long relative imports. Python targets 3.11, four spaces, double quotes, a 100-character line limit, Ruff, and fully typed functions checked by mypy.

## Docstrings and Code Comments

Document production classes, functions, methods, and hooks, including private helpers
whose behavior is not clear from their names. Start with a precise summary, then explain
the purpose, important invariants, side effects, and transaction or error boundaries.
Document every parameter and non-`None` return with its full type and meaning; document
deliberately raised errors and the conditions that cause them. For state-bearing classes,
describe meaningful attributes and their lifecycle. Keep documentation consistent with
the code and avoid repeated filler. Add brief inline comments at tricky branches,
ordering constraints, or workarounds to explain why the code takes that path. Do not
narrate straightforward statements. Python uses docstrings; TypeScript uses JSDoc:

```python
def archive_title(title: str | None, url: str) -> str:
    """Choose the title stored with an archived tab.

    Browser titles can be missing or contain only whitespace. Use the URL in those
    cases so an archive record always has a useful label. This function does not
    change the tab or persist the result.

    Args:
        title (str | None): Browser-provided title, or ``None`` when unavailable.
        url (str): Page URL used when the title has no visible characters.

    Returns:
        str: The trimmed title, or the URL when no usable title exists.

    Raises:
        ValueError: Both the title and URL are empty or whitespace-only.
    """
    label = title.strip() if title else ""
    if not label:
        label = url.strip()
    if not label:
        raise ValueError("An archived tab needs a title or URL")
    return label
```

```ts
/**
 * Choose the title stored with an archived tab.
 *
 * Browser titles can be missing or contain only whitespace. Use the URL in those
 * cases so an archive record always has a useful label. This function does not
 * change the tab or persist the result.
 *
 * @param {string | null} title - Browser-provided title, or null when unavailable.
 * @param {string} url - Page URL used when the title has no visible characters.
 * @returns {string} The trimmed title, or the URL when no usable title exists.
 * @throws {Error} When both the title and URL are empty or whitespace-only.
 */
export function archiveTitle(title: string | null, url: string): string {
  const label = title?.trim() || url.trim();
  if (!label) throw new Error("An archived tab needs a title or URL");
  return label;
}
```

Place inline comments beside non-obvious code. State the reason or invariant, not what
the next statement already says. Update or remove the comment when the code changes:

```python
# Count before unassigning tabs; clearing group_id would make this query return zero.
archived_tab_count = await count_group_tabs(group_id)
await archive_and_unassign_tabs(group_id)
```

```ts
// Copy before sorting because drag order still uses the original array.
const sortedGroups = [...groups].sort((a, b) => a.position - b.position);
```

## Testing Guidelines

Name Playwright files `*.spec.ts`, Node tests `*.test.mjs`, and Python tests `test_*.py` with `test_` methods. Add focused coverage for changed behavior; include offline/local-storage or authenticated API paths when the change affects them. Run the affected suite, then broaden checks only for a concrete risk or required gate.

## Commit & Pull Request Guidelines

History uses short imperative subjects such as `Fix bugs`; make new subjects more specific, for example `Fix archive restore ordering`. Keep each commit focused. Pull requests should explain behavior and validation, link relevant issues, call out schema or configuration changes, and include screenshots or recordings for UI changes.

## Security & Configuration

Never commit bearer keys or local data. The development API key is `admin` only for trusted local use; set `TABVAULT_API_KEY` and restrictive `TABVAULT_CORS_ORIGINS` before network exposure. Preserve the archive-first lifecycle and browser-local fallback when changing storage flows.
