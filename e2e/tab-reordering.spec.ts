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
  await expect(row).toHaveCount(0);

  await page.getByRole("button", { name: /^Archive \d/ }).click();
  const archived = page.getByTestId("tab-row-t-research");
  await archived.hover();
  await archived
    .getByLabel("Permanently delete Model Context Protocol specification")
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
  await expect(
    page
      .getByTestId("tab-row-t-research")
      .getByLabel("Move Model Context Protocol specification")
  ).toHaveValue("research");

  await page
    .getByTestId("tab-row-advanced-new")
    .getByLabel("Edit New title")
    .click();
  const editCollection = page
    .getByRole("dialog", { name: "Edit tab" })
    .getByLabel("Collection");
  await expect(editCollection.locator("option")).toHaveText([
    "Move from current session…",
    "[Unassigned]",
    "Research",
    "Empty shelf",
  ]);
  await page.getByRole("button", { name: "Close dialog" }).click();

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

test("group board keeps every tab visible and emphasizes search matches", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  await page.evaluate(() => {
    const vault = JSON.parse(localStorage.getItem("tabvault-v2") || "{}");
    const source = vault.tabs.find(
      (tab: { id: string }) => tab.id === "advanced-new"
    );
    for (let index = 1; index <= 3; index += 1) {
      const id = `group-board-extra-${index}`;
      vault.tabs.push({
        ...source,
        id,
        title: `Extra session tab ${index}`,
        url: `https://example.com/group-board-${index}`,
      });
      vault.tabOrders.session.push(id);
    }
    localStorage.setItem("tabvault-v2", JSON.stringify(vault));
  });
  await page.reload();
  await page.getByLabel("Collection-group board view").click();

  const session = page.getByTestId("group-card-session");
  await expect(
    session.locator("button[data-testid^='grouped-tab-']")
  ).toHaveCount(5);
  await expect(page.getByTestId("grouped-tab-icon-advanced-new")).toBeVisible();

  await page
    .getByLabel("Search your TabVault library")
    .fill("Extra session tab 2");
  await expect(page.getByTestId("group-board")).toBeVisible();
  await expect(
    page.getByTestId("grouped-tab-group-board-extra-2")
  ).toHaveAttribute("data-search-state", "match");
  await expect(page.getByTestId("grouped-tab-advanced-new")).toHaveAttribute(
    "data-search-state",
    "dimmed"
  );
});

test("saved links use extension tabs instead of capturable anchor navigation", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  await page.evaluate(() => {
    const target = window as unknown as {
      chrome: unknown;
      openedTabUrls: string[];
    };
    target.openedTabUrls = [];
    Object.defineProperty(target, "chrome", {
      configurable: true,
      value: {
        runtime: { id: "test-extension" },
        storage: {
          local: {
            get: async () => ({}),
            set: async () => undefined,
            remove: async () => undefined,
          },
        },
        tabs: {
          create: async ({ url }: { url: string }) => {
            target.openedTabUrls.push(url);
          },
        },
      },
    });
  });

  await page
    .getByRole("link", {
      name: "Agents can organize the web better than we can",
    })
    .first()
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { openedTabUrls: string[] }).openedTabUrls
      )
    )
    .toEqual(["https://notes.example.com/agents?b=2&a=1#part"]);
});

test("workspace sidebar remains available on secondary pages", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  const sidebar = page.getByTestId("workspace-sidebar");
  await expect(sidebar).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: /^All Tabs/ })
  ).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: "Advanced Deduplication" })
  ).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /^Tags/ })).toBeVisible();
  await sidebar.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(sidebar).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: "Advanced Deduplication" })
  ).toBeVisible();
  await sidebar.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(sidebar).toBeVisible();
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

test("empty groups delete immediately while populated groups require approval", async ({
  page,
}) => {
  await openSchemaV2Library(page);

  await page.getByLabel("Delete Empty shelf").click();
  await expect(page.getByTestId("group-separator-empty")).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Delete Empty shelf collection" })
  ).toHaveCount(0);

  await page.getByLabel("Delete Research").click();
  await expect(
    page.getByRole("dialog", { name: "Delete Research collection" })
  ).toBeVisible();
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
  await page
    .getByTestId("workspace-sidebar")
    .getByRole("button", { name: "Advanced Deduplication" })
    .click();
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
