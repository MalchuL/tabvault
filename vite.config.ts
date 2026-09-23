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
    rollupOptions: {
      preserveEntrySignatures: "strict",
      input: {
        app: path.resolve(import.meta.dirname, "client", "index.html"),
        "library-sync": path.resolve(
          import.meta.dirname,
          "client",
          "src",
          "extension",
          "library-sync.ts"
        ),
        background: path.resolve(
          import.meta.dirname,
          "client",
          "src",
          "extension",
          "background.ts"
        ),
        popup: path.resolve(
          import.meta.dirname,
          "client",
          "src",
          "extension",
          "popup.ts"
        ),
        "popup-selection": path.resolve(
          import.meta.dirname,
          "client",
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
