import { expect, test } from "@playwright/test";
import { openSchemaV2Library } from "./schema-v2-fixture";

test("All Tabs, Hidden, and Archive share grouped lifecycle behavior", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  await expect(page.getByTestId("tab-row-t-hidden")).toHaveCount(0);
  await expect(page.getByTestId("tab-row-t-archived")).toHaveCount(0);
  await expect(page.getByTestId("tab-group-unassigned")).toBeVisible();
  await expect(page.getByTestId("group-separator-empty")).toBeVisible();
  await expect(
    page
      .getByTestId("tab-list")
      .locator("section[data-testid^='tab-group-']")
      .first()
  ).toHaveAttribute("data-testid", "tab-group-unassigned");

  await page.getByRole("button", { name: /^Hidden \d/ }).click();
  await expect(page.getByTestId("tab-row-t-hidden")).toBeVisible();
  await expect(
    page.getByTestId("tab-row-t-hidden").getByText(/^Resting until /)
  ).toBeVisible();
  await expect(page.getByTestId("tab-row-t-archived")).toHaveCount(0);
  await page
    .getByTestId("tab-row-t-hidden")
    .getByRole("button", { name: "Unhide Hidden research", exact: true })
    .click();
  await expect(page.getByTestId("tab-row-t-hidden")).toHaveCount(0);

  await page.getByRole("button", { name: /^Archive \d/ }).click();
  await expect(page.getByTestId("tab-row-t-archived")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByTestId("tab-row-t-archived")).toHaveCount(0);
  await page.getByRole("button", { name: /^All Tabs/ }).click();
  await expect(page.getByTestId("tab-row-t-archived")).toHaveCount(0);
  await page.getByRole("button", { name: /^Hidden \d/ }).click();
  await expect(page.getByTestId("tab-row-t-archived")).toBeVisible();
});

test("archiving clears membership and hard deletion is offered only in Archive", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  const row = page.getByTestId("tab-row-t-research");
  await row.hover();
  await row.getByLabel("Archive Model Context Protocol specification").click();
  await page.getByRole("button", { name: "Archive tab" }).click();
  await expect(row).toHaveCount(0);

  await page.getByRole("button", { name: /^Archive \d/ }).click();
  const archived = page.getByTestId("tab-row-t-research");
  await archived.hover();
  await archived
    .getByLabel("Permanently delete Model Context Protocol specification")
    .click();
  await page
    .getByRole("button", { name: "Permanently delete", exact: true })
    .click();
  await expect(archived).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tabvault-v2") || "{}")
  );
  expect(
    saved.tabs.some((tab: { id: string }) => tab.id === "t-research")
  ).toBe(false);
});

test("group hide is client-orchestrated and category colors are deterministic", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  const manualDot = page
    .getByTestId("group-separator-research")
    .locator("span[title='Category: manual']");
  const sessionDot = page
    .getByTestId("group-separator-session")
    .locator("span[title='Category: session']");
  await expect(manualDot).toBeVisible();
  await expect(sessionDot).toBeVisible();
  expect(await manualDot.getAttribute("style")).not.toBe(
    await sessionDot.getAttribute("style")
  );

  await page.getByLabel("Hide Research").click();
  await page.getByRole("button", { name: "10 min", exact: true }).click();
  await expect(page.getByTestId("tab-row-t-research")).toHaveCount(0);
  await page.getByRole("button", { name: /^Hidden \d/ }).click();
  await expect(page.getByTestId("tab-row-t-research")).toBeVisible();
  await expect(page.getByTestId("tab-row-t-hidden")).toBeVisible();
});

test("manual groups are the only quick and selected move targets", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  await expect(page.getByTestId("collection-drop-research")).toBeVisible();
  await expect(page.getByTestId("collection-drop-session")).toHaveCount(0);
  await expect(page.getByTestId("collection-drop-empty")).toHaveCount(0);

  await page.getByRole("button", { name: "Select tabs" }).click();
  await page
    .getByTestId("tab-row-t-1001")
    .getByRole("checkbox", { name: /^Select / })
    .check();
  const moveSelected = page.getByLabel("Move selected tabs to collection");
  await expect(moveSelected.locator("option")).toHaveText([
    "Move to…",
    "Research",
  ]);

  const rowMove = page
    .getByTestId("tab-row-t-1001")
    .getByLabel("Move Agents can organize the web better than we can");
  await expect(rowMove.locator("option")).toHaveText(["Move to…", "Research"]);

  await page.getByLabel("Compact tab view").click();
  const compactMove = page
    .getByTestId("tab-row-t-1001")
    .getByLabel("Move Agents can organize the web better than we can");
  await expect(compactMove).toBeVisible();
  await expect(compactMove.locator("option")).toHaveText([
    "Move to…",
    "Research",
  ]);
});

test("empty Session groups remain until explicitly deleted", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  await page
    .getByTestId("tab-row-t-duplicate")
    .getByLabel("Move Agents can organize the web better than we can")
    .selectOption("research");
  await page
    .getByTestId("tab-row-advanced-new")
    .getByLabel("Move New title")
    .selectOption("research");

  await expect(page.getByTestId("group-separator-session")).toContainText(
    "0 tabs"
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const vault = JSON.parse(localStorage.getItem("tabvault-v2") || "{}");
        return vault.vaultGroups?.some(
          (group: { id: string }) => group.id === "session"
        );
      })
    )
    .toBe(true);
});

test("Quick Clean merges tags/viewed and archives later exact occurrences", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  page.once("dialog", dialog => void dialog.dismiss());
  await page.getByRole("button", { name: "Quick clean" }).click();
  await expect(page.getByTestId("tab-row-t-duplicate")).toBeVisible();
  page.once("dialog", dialog => void dialog.accept());
  await page.getByRole("button", { name: "Quick clean" }).click();
  await expect(page.getByTestId("tab-row-t-duplicate")).toHaveCount(0);
  const survivor = page.getByTestId("tab-row-t-1001");
  await expect(survivor).toContainText("merged");
  await expect(
    survivor.getByRole("checkbox", {
      name: "Mark Agents can organize the web better than we can as viewed",
    })
  ).toBeChecked();
  await page.getByRole("button", { name: /^Archive \d/ }).click();
  await expect(page.getByTestId("tab-row-t-duplicate")).toBeVisible();
});

test("Advanced Deduplicator previews and applies an exact-URL fixed plan", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(
    page.getByRole("heading", { name: "Advanced Deduplicator" })
  ).toBeVisible();
  await expect(page.getByText(/2 cluster\(s\)/)).toBeVisible();
  await page
    .getByLabel("Survivor", { exact: true })
    .selectOption("NEWEST_CREATED");
  await expect(page.getByTestId("dedupe-option-survivor")).toBeVisible();
  await page.getByLabel("Learn about Survivor: NEWEST CREATED").hover();
  await expect(
    page.locator("[data-slot='tooltip-content']").filter({
      hasText: "Keep the Saved Tab with the most recent creation time.",
    })
  ).toBeVisible();
  await expect(page.getByText(/Keep advanced-new/)).toBeVisible();
  await page.getByRole("button", { name: "Apply this plan" }).click();
  await expect(page.getByText(/operations succeeded; 0 failed/)).toBeVisible();

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tabvault-v2") || "{}")
  );
  expect(
    saved.tabs.find((tab: { id: string }) => tab.id === "advanced-old").archived
  ).toBe(true);
  expect(
    saved.tabs.find((tab: { id: string }) => tab.id === "advanced-new").archived
  ).not.toBe(true);
});
