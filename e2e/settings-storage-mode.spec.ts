import { expect, test } from "@playwright/test";
import { openSchemaV5Library } from "./schema-v5-fixture";

test("local-only mode hides API and other server settings", async ({
  page,
}) => {
  await openSchemaV5Library(page);
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
  await expect(page.getByText("Semantic mode")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Clear server library" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Local only" }).click();
  await expect(page.getByText("API endpoint")).toHaveCount(0);
  await expect(page.getByText("API key")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check now" })).toHaveCount(0);
});

test("clear-data cancellation preserves the library and local mode cancels server clearing", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  const originalVault = await page.evaluate(() =>
    localStorage.getItem("tabvault-v3")
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const confirm = page.getByRole("button", { name: "Confirm clear" });
  await page.getByRole("button", { name: "Clear browser library" }).click();
  await expect(confirm).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirm).toHaveCount(0);

  for (const target of ["Clear server library", "Clear both"]) {
    await page.getByRole("button", { name: "Backend preferred" }).click();
    await page.getByRole("button", { name: target, exact: true }).click();
    await expect(confirm).toBeVisible();
    await page.getByRole("button", { name: "Local only" }).click();
    await expect(confirm).toHaveCount(0);
    await page.getByRole("button", { name: "Backend preferred" }).click();
    await expect(confirm).toHaveCount(0);
  }

  expect(await page.evaluate(() => localStorage.getItem("tabvault-v3"))).toBe(
    originalVault
  );
});
