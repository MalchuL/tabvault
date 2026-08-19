# Manus transfer notes

Use this file the next time Manus regenerates or updates the frontend. It records every local change made to strip Manus runtime, unblock `pnpm install` / `pnpm build`, keep TabVault as a normal Vite + Tailwind 3 app, and make the Chrome extension side panel open Home instead of the in-app 404.

Date of this transfer: 2026-08-19.

## Why these changes exist

1. **pnpm 10/11 blocks native install scripts.** Manus ships Tailwind 4 (`@tailwindcss/oxide`) and an `esbuild` CLI. Both try to run `postinstall`. Without approving those scripts, install fails with `ERR_PNPM_IGNORED_BUILDS`, and `pnpm build` never starts because it re-runs install first.
2. **Manus runtime is injected into the built HTML.** `vite-plugin-manus-runtime` writes:

   ```html
   <script id="manus-runtime">window.__MANUS_HOST_DEV__ = false;</script>
   ```

   That is not a source file. It appears in `dist/public/index.html` (and therefore in the Chrome extension side panel). `__MANUS_HOST_DEV__` was never replaced with another flag; the plugin that injected it was removed.
3. **Manus storage URLs do not work locally.** Images under `/manus-storage/...` need the Manus storage proxy and Forge credentials.
4. **The extension side panel 404s after a Manus `App.tsx`.** Chrome loads `index.html`, so the path is `/index.html`. Wouter only mounted Home at `/` and sent everything else to NotFound. Hash routing on `chrome-extension:` pages is required (section 6).

Do **not** run `pnpm approve-builds` for oxide/esbuild. Re-apply this document instead.

## Replay checklist after a Manus update

- [ ] Restore Tailwind 3 + PostCSS (section 1). Do not keep `@tailwindcss/vite` or Tailwind 4.
- [ ] Restore the Vite config without Manus plugins (section 2).
- [ ] Delete Manus-only files (section 3).
- [ ] Point logos at `/icon-128.png` and drop `/manus-storage` images (section 4).
- [ ] Convert any new Tailwind 4 class syntax (section 5).
- [ ] Remove Manus analytics from `client/index.html`.
- [ ] Restore Chrome-extension routing in `client/src/App.tsx` (section 6). Do not leave wouter matching only `/`.
- [ ] Run `pnpm install` then `pnpm build`. Confirm `dist/public/index.html` has no `manus-runtime` script and no `__manus__/` folder.
- [ ] Reload the unpacked Chrome extension from `dist/public/`. Open the side panel; it must show Home, not the in-app 404 page.

---

## 1. Toolchain: Tailwind 4 / esbuild → Tailwind 3 / Vite-only build

### `package.json` scripts

Manus template:

```json
"build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
"start": "NODE_ENV=production node dist/index.js"
```

Local:

```json
"build": "vite build",
"start": "vite preview --host"
```

There is no `server/` directory. The esbuild step was leftover template code.

### Removed packages

| Package | Why |
| --- | --- |
| `@tailwindcss/vite` | Tailwind 4 Vite plugin; pulls `@tailwindcss/oxide` native binaries |
| `tailwindcss` v4 | Replaced with `tailwindcss` `^3.4.17` |
| `tw-animate-css` | Tailwind 4 animation import; `tailwindcss-animate` already covers UI animations |
| `esbuild` (direct dep) | Only used for the missing `server/index.ts` bundle |
| `vite-plugin-manus-runtime` | Injects `__MANUS_HOST_DEV__` and other Manus runtime |
| `@builder.io/vite-plugin-jsx-loc` | Manus click-to-source / JSX location plugin |

Keep `autoprefixer`, `postcss`, `@tailwindcss/typography`, and `tailwindcss-animate`.

### Added / restored config files

- `tailwind.config.ts` — Tailwind 3 config, `darkMode: ["class"]`, CSS-variable colors, `rounded-xs`, `shadow-xs`, accordion/caret keyframes, typography + animate plugins.
- `postcss.config.js` — `tailwindcss` + `autoprefixer`.
- `pnpm-workspace.yaml` — deny esbuild postinstall (Vite still nests esbuild; optional `@esbuild/linux-x64` provides the binary):

  ```yaml
  allowBuilds:
    esbuild: false
  ```

  If a Manus update re-adds placeholders like `set this to true or false` for `@tailwindcss/oxide` or `esbuild`, do not set them to `true`. Restore the file above after dropping Tailwind 4.

### `components.json`

Set `"config": "tailwind.config.ts"` under `tailwind` so shadcn stays on the v3 config path.

### `client/src/index.css`

Manus / Tailwind 4:

```css
@import "tailwindcss";
@import "tw-animate-css";
@custom-variant dark (&:is(.dark *));
@theme inline { ... }
```

Local / Tailwind 3:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Keep the `:root` color tokens. Do not `@apply outline-ring/50` (Tailwind 3 cannot apply that opacity modifier on a CSS-variable color). Use:

```css
* {
  border-color: var(--border);
  outline-color: color-mix(in srgb, var(--ring) 50%, transparent);
}
```

---

## 2. Vite: strip Manus runtime

Replace the Manus `vite.config.ts` with a plain React config. Do not re-import:

- `vite-plugin-manus-runtime`
- `@builder.io/vite-plugin-jsx-loc`
- `@tailwindcss/vite`
- The inline Manus debug collector (`POST /__manus__/logs`, `.manus-logs`)
- The `/manus-storage` Forge proxy (`BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY`)

Current target:

```ts
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false,
    host: true,
    allowedHosts: ["localhost", "127.0.0.1"],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
```

### `__MANUS_HOST_DEV__` vs `allowedHosts`

These are different things. Do not confuse them on the next update.

| What you see | Where it came from | What we did |
| --- | --- | --- |
| `window.__MANUS_HOST_DEV__ = false` inside `<script id="manus-runtime">` | `vitePluginManusRuntime()` at build/dev time | Removed the plugin. No replacement flag. |
| `allowedHosts: [".manuspre.computer", ".manus.computer", ...]` | Vite `server.allowedHosts` so Manus preview VMs can hit the dev server | Replaced with `["localhost", "127.0.0.1"]` |

If a new Manus export puts those preview hostnames back, drop them unless you actually host the Vite dev server on Manus VMs.

Also remove the unused `@assets` → `attached_assets` alias. That folder is not in this repo.

---

## 3. Deleted Manus-only files

Delete these if they come back:

| Path | What it was |
| --- | --- |
| `template.json` | Manus project snapshot of package.json / index.css / index.html |
| `client/src/components/ManusDialog.tsx` | “Login with Manus” dialog (unused by App) |
| `client/public/__manus__/` | Debug collector + version.json copied into the extension build |

Ignore rules that mentioned them were also dropped:

- `.gitignore`: `client/public/__manus__/version.json` and `.project-config.json`
- `eslint.config.mjs`: `"client/public/__manus__/**"`

After `pnpm build`, `dist/public/` must not contain `__manus__/`.

---

## 4. Assets and HTML

### Logos and decorative photos

Manus used remote storage:

```ts
const logoUrl = "/manus-storage/tabvault-logo_133db831.png";
const archiveVisual = "/manus-storage/tabvault-archive_79c11784.jpg";
const semanticVisual = "/manus-storage/tabvault-semantic_b15e90c2.jpg";
const validationVisual = "/manus-storage/tabvault-validation_fed8a176.jpg";
```

Local replacements:

- `client/src/pages/Home.tsx` and `client/src/pages/Transfer.tsx`: `logoUrl = "/icon-128.png"` (file already in `client/public/`).
- Home hero / semantic / validation photos: removed `<img>` tags; keep the paper-grain / gradient panels.

### `docs/FEATURE_GUIDE.md`

Removed the two markdown images that pointed at `/manus-storage/tabvault-dashboard_*.png` and `/manus-storage/tabvault-system-map_*.png`. Figure captions stayed.

### `client/index.html`

Removed the Manus Umami injection:

```html
<script
  defer
  src="%VITE_ANALYTICS_ENDPOINT%/umami"
  data-website-id="%VITE_ANALYTICS_WEBSITE_ID%"
></script>
```

Keep the Google Fonts links and the `/src/main.tsx` module script.

---

## 5. Tailwind 4 class syntax → Tailwind 3

Manus shadcn components use Tailwind 4 shorthands. Convert them whenever new UI files arrive:

| Tailwind 4 | Tailwind 3 |
| --- | --- |
| `origin-(--radix-tooltip-content-transform-origin)` | `origin-[var(--radix-tooltip-content-transform-origin)]` |
| `max-h-(--radix-…)` / `w-(--sidebar-width)` / `size-(--cell-size)` | `max-h-[var(--radix-…)]` / `w-[var(--sidebar-width)]` / `size-[var(--cell-size)]` |
| `outline-hidden` | `outline-none` |

Regex used last time (run on `client/src/**/*.{ts,tsx}`):

```text
([\w-]+)-\(--([^)]+)\)  →  \1-[var(--\2)]
outline-hidden          →  outline-none
```

`rounded-xs` and `shadow-xs` stay as class names; they are defined in `tailwind.config.ts`.

Some leftover v4-only variants (`**:`, `in-data-[…]`, `size-8!`) still exist in unused `components/ui` files. They are ignored by Tailwind 3. Convert them if those components become used.

Files converted in this transfer:

- `client/src/components/ui/calendar.tsx`
- `client/src/components/ui/chart.tsx`
- `client/src/components/ui/command.tsx`
- `client/src/components/ui/context-menu.tsx`
- `client/src/components/ui/dialog.tsx`
- `client/src/components/ui/dropdown-menu.tsx`
- `client/src/components/ui/hover-card.tsx`
- `client/src/components/ui/menubar.tsx`
- `client/src/components/ui/popover.tsx`
- `client/src/components/ui/resizable.tsx`
- `client/src/components/ui/select.tsx`
- `client/src/components/ui/sheet.tsx`
- `client/src/components/ui/sidebar.tsx`
- `client/src/components/ui/slider.tsx`
- `client/src/components/ui/tooltip.tsx`

---

## 6. Chrome extension 404: wouter treated `index.html` as a missing route

Symptom after Load unpacked: the side panel (or `chrome-extension://<id>/index.html`) showed TabVault’s **Page Not Found** screen. Supatabs works because it loads a real HTML app file (`…/src/pages/app/index.html`). TabVault already had that file (`index.html`, `manifest.json` `side_panel.default_path`), but the SPA router did not.

### Cause

Chrome opens the workspace at `chrome-extension://<extension-id>/index.html`. Wouter’s default hook reads `location.pathname`, which is `/index.html`, not `/`. Routes were:

```tsx
<Route path="/" component={Home} />
<Route path="/transfer" component={Transfer} />
<Route path="/404" component={NotFound} />
<Route component={NotFound} />
```

`/index.html` missed every named route and hit the catch-all `NotFound`. That is the 404. It is not a missing HTML page.

`setLocation("/transfer")` on an extension page also used the History API, so the URL became `chrome-extension://<id>/transfer`. A refresh then hit Chrome’s real 404 because that file does not exist.

The `<script id="manus-runtime">` tag is unrelated to this 404. It comes from `vite-plugin-manus-runtime` (section 2). Strip that plugin; do not try to replace `__MANUS_HOST_DEV__`.

### Fix in `client/src/App.tsx`

Keep the same routes. Wrap them in wouter’s `<Router>` and pick the location hook from the page protocol:

- **`chrome-extension:`** → `useHashLocation` from `wouter/use-hash-location`. Empty hash is `/`. Transfer becomes `index.html#/transfer`, so refresh still loads `index.html`.
- **http(s) / Vite preview** → custom `useNormalizedBrowserLocation` that maps `/index.html` to `/`, then uses `useBrowserLocation` from `wouter/use-browser-location`.

Those hooks are **not** re-exported from `"wouter"`. Import them from the subpaths above. Type the custom hook as `BaseLocationHook`.

Do not set Vite `base: "./"`. Path-routed web deep links such as `/transfer` would then request `./assets/…` relative to `/transfer` and 404. Leave `base` at the default `/`. Origin-absolute `/assets/…` resolves correctly on `chrome-extension://<id>/`.

Target `App.tsx` (imports + router only; keep ThemeProvider / Toaster as they are):

```tsx
import { Route, Router, Switch, type BaseLocationHook } from "wouter";
import { useBrowserLocation } from "wouter/use-browser-location";
import { useHashLocation } from "wouter/use-hash-location";

function isExtensionPage() {
  return window.location.protocol === "chrome-extension:";
}

const useNormalizedBrowserLocation: BaseLocationHook = () => {
  const [location, setLocation] = useBrowserLocation();
  const path = location.replace(/\/index\.html\/?$/, "") || "/";
  return [path, setLocation];
};

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/transfer" component={Transfer} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Inside App, wrap AppRoutes with:
<Router
  hook={isExtensionPage() ? useHashLocation : useNormalizedBrowserLocation}
>
  <AppRoutes />
</Router>
```

If Manus regenerates `App.tsx` with a local `function Router()` that only returns `<Switch>`, replace that pattern. The inner routes can stay; the wouter `<Router hook={…}>` wrapper is required.

### After applying

```bash
pnpm build
```

Reload the unpacked extension from `dist/public/`. **Open TabVault workspace** should show Home. The document URL stays `chrome-extension://<id>/index.html` (hash routes `#/` and `#/transfer`).

---

## 7. Verify

```bash
pnpm install
pnpm build
```

Success looks like:

- No `ERR_PNPM_IGNORED_BUILDS` for `@tailwindcss/oxide`.
- `dist/public/index.html` is a normal Vite HTML file (no `manus-runtime`, no `%VITE_ANALYTICS_%`).
- No `dist/public/__manus__/`.
- Chrome Load unpacked of `dist/public/` opens the side panel at `index.html` (`manifest.json` `side_panel.default_path`).
- That side panel shows the TabVault workspace (Home), not “Page Not Found”. The URL may include `#/` or `#/transfer`.
