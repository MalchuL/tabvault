import { expect, test } from "@playwright/test";
import { openSchemaV2Library } from "./schema-v2-fixture";

test("local-only mode hides API and other server settings", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await expect(page.getByText("API endpoint")).toHaveCount(0);
  await expect(page.getByText("API key")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check now" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save", exact: true })
  ).toBeVisible();
  await expect(page.getByText("Semantic mode")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Clear server library" })
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Backend preferred" }).click();
  await expect(page.getByText("API endpoint")).toBeVisible();
  await expect(page.getByText("API key")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check now" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save & check" })
  ).toBeVisible();
  await expect(page.getByText("Semantic mode")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear server library" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Local only" }).click();
  await expect(page.getByText("API endpoint")).toHaveCount(0);
  await expect(page.getByText("API key")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check now" })).toHaveCount(0);
});
