import { expect, test } from "@playwright/test";
import { openSchemaV5Library } from "./schema-v5-fixture";
test("dashboard shows storage and backups without jobs, previews, or AI search", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Library storage" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Server backups" })
  ).toBeVisible();
  for (const text of ["Jobs", "Semantic mode", "Rebuild index", "Page preview"])
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
});
