import { expect, test } from "@playwright/test";
import { openSchemaV2Library } from "./schema-v2-fixture";

const TAB_TITLE = "Agents can organize the web better than we can";

test("tracks viewed state and preserves editable agent review", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  const viewed = page.getByTestId("tab-row-t-1001").getByRole("checkbox", {
    name: `Mark ${TAB_TITLE} as viewed`,
  });
  await expect(viewed).not.toBeChecked();
  expect(
    await viewed.evaluate(
      checkbox => checkbox.previousElementSibling?.tagName === "A"
    )
  ).toBe(true);
  await viewed.check();
  await expect(viewed).toBeChecked();

  const row = page.getByTestId("tab-row-t-1001");
  await row.hover();
  await row.getByLabel(`Edit ${TAB_TITLE}`).click();
  await page.getByLabel("Agent review").fill("Concise agent summary");
  await page.getByRole("button", { name: "Save tab" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await row.hover();
  await row.getByLabel(`Edit ${TAB_TITLE}`).click();
  await expect(page.getByLabel("Agent review")).toHaveValue(
    "Concise agent summary"
  );

  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByLabel("Compact tab view").click();
  const compactViewed = page
    .getByTestId("tab-row-t-1001")
    .getByRole("checkbox", { name: `Mark ${TAB_TITLE} as viewed` });
  expect(
    await compactViewed.evaluate(
      checkbox => checkbox.previousElementSibling?.tagName === "A"
    )
  ).toBe(true);

  await page.getByLabel("Instant-preview tab view").click();
  const previewViewed = page
    .getByTestId("tab-row-t-1001")
    .getByRole("checkbox", { name: `Mark ${TAB_TITLE} as viewed` });
  expect(
    await previewViewed.evaluate(
      checkbox => checkbox.previousElementSibling?.tagName === "H3"
    )
  ).toBe(true);
});

test("editing a Session group explicitly reclassifies it as manual", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  await page.getByLabel("Edit Session Aug 23 13:00").click();
  await page.getByLabel("Description").fill("Curated by a human");
  await expect(page.getByLabel("Category")).toHaveValue("manual");
  await page.getByRole("button", { name: "Save collection" }).click();

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tabvault-v2") || "{}")
  );
  expect(
    saved.vaultGroups.find((group: { id: string }) => group.id === "session")
      .category
  ).toBe("manual");
});

test("group edit category dropdown can explicitly override manual", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  await page.getByLabel("Edit Empty shelf").click();
  await page.getByLabel("Description").fill("A new session bucket");
  await page.getByLabel("Category").selectOption("session");
  await page.getByRole("button", { name: "Save collection" }).click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const vault = JSON.parse(localStorage.getItem("tabvault-v2") || "{}");
        return vault.vaultGroups?.find(
          (group: { id: string }) => group.id === "empty"
        )?.category;
      })
    )
    .toBe("session");
});

test("incompatible browser data offers adjacent raw download and clear actions", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      "tabvault-v1",
      JSON.stringify({ schemaVersion: 1, tabs: [{ url: "legacy" }] })
    );
  });
  await page.reload();
  await expect(page.getByText("Recovery required")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download raw data" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^tabvault-browser-recovery-.*\.json$/
  );
  await page.getByRole("button", { name: "Clear and start empty" }).click();
  await expect(page.getByText("All tabs", { exact: true })).toBeVisible();
});
