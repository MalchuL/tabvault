import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

const releaseVersion = readFileSync(
  path.resolve(import.meta.dirname, "server/VERSION.txt"),
  "utf8"
).trim();

export default defineConfig({
  plugins: [
    react(),
    {
      name: "extension-manifest",
      /** Emit the manifest with the shared backend release version. @returns {void} */
      generateBundle() {
        const manifest = JSON.parse(
          readFileSync(
            path.resolve(
              import.meta.dirname,
              "chrome_extension/public/manifest.json"
            ),
            "utf8"
          )
        );
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: `${JSON.stringify({ ...manifest, version: releaseVersion }, null, 2)}\n`,
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "chrome_extension", "src"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "chrome_extension"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      preserveEntrySignatures: "strict",
      input: {
        app: path.resolve(
          import.meta.dirname,
          "chrome_extension",
          "index.html"
        ),
        "library-sync": path.resolve(
          import.meta.dirname,
          "chrome_extension",
          "src",
          "extension",
          "library-sync.ts"
        ),
        background: path.resolve(
          import.meta.dirname,
          "chrome_extension",
          "src",
          "extension",
          "background.ts"
        ),
        popup: path.resolve(
          import.meta.dirname,
          "chrome_extension",
          "src",
          "extension",
          "popup.ts"
        ),
        "popup-selection": path.resolve(
          import.meta.dirname,
          "chrome_extension",
          "src",
          "extension",
          "popup-selection.ts"
        ),
      },
      output: {
        entryFileNames: chunk =>
          ["library-sync", "background", "popup", "popup-selection"].includes(
            chunk.name
          )
            ? `${chunk.name}.js`
            : "assets/[name]-[hash].js",
      },
    },
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
