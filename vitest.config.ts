import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "node",
      coverage: {
        provider: "v8",
        include: [
          "src/domain/library/state.ts",
          "src/domain/library/selectors.ts",
          "src/domain/server/client.ts",
        ],
        thresholds: {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
  })
);
