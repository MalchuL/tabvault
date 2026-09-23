import { expect, test, type Page } from "@playwright/test";
import { openSchemaV2Library } from "./schema-v2-fixture";

const serverOrigin = "http://127.0.0.1:47821";

async function mockUnavailableSemanticSearch(page: Page) {
  await page.route(`${serverOrigin}/api/v1/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/health") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          version: "0.2.0",
          schemaVersion: 2,
          storage: { tabs: 3, groups: 1, tags: 1 },
          vectorIndex: {
            status: "not_ready",
            indexedCount: 0,
            provider: "sentence-transformers",
            model: "deepvk/USER-bge-m3",
            lastError: "No module named 'sentence_transformers'",
          },
        }),
      });
      return;
    }
    if (path === "/api/v1/capabilities") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            keywordSearch: { available: true },
            semanticSearch: {
              available: false,
              error: "The sentence-transformers package is not installed.",
              fix: "From the local-server directory run `uv sync --extra semantic`, then restart tabvault-server.",
            },
            vectorIndex: {
              available: false,
              error: "The sentence-transformers package is not installed.",
              fix: "From the local-server directory run `uv sync --extra semantic`, then restart tabvault-server.",
            },
          },
        }),
      });
      return;
    }
    if (path === "/api/v1/property-schema") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            properties: {
              viewed: { description: "", type: "boolean", default: false },
            },
          },
        }),
      });
      return;
    }
    if (path === "/api/v1/index/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            status: "not_ready",
            indexedCount: 0,
            provider: "sentence-transformers",
            model: "deepvk/USER-bge-m3",
            lastError: "No module named 'sentence_transformers'",
            healthCheck: {
              enabled: false,
              intervalSeconds: 0,
              notifyOnNeedsAttention: false,
              lastCheck: null,
              lastResult: null,
              lastAlert: null,
            },
          },
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "not mocked" });
  });
}

test("dashboard and settings show semantic capability error and fix", async ({
  page,
}) => {
  await mockUnavailableSemanticSearch(page);
  await openSchemaV2Library(page);
  await page.evaluate(() => {
    localStorage.setItem("tabvault-storage-mode", "backend");
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(
    page.getByText("The sentence-transformers package is not installed.")
  ).toBeVisible();
  await expect(
    page.getByText("uv sync --extra semantic", { exact: false })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Rebuild index" })
  ).toBeEnabled();

  await page.goto("/settings");
  await expect(page.getByText("Semantic mode")).toBeVisible();
  await expect(
    page.getByText("The sentence-transformers package is not installed.")
  ).toBeVisible();
  await expect(
    page.getByText("uv sync --extra semantic", { exact: false })
  ).toBeVisible();
});
