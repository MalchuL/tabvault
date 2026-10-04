import { expect, test } from "@playwright/test";
import { openSchemaV5Library } from "./schema-v5-fixture";

test("All Tabs, Hidden, and Archive share grouped lifecycle behavior", async ({
  page,
}) => {
  await openSchemaV5Library(page);
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
  await openSchemaV5Library(page);
  const row = page.getByTestId("tab-row-t-research");
  await row.hover();
  await row.getByLabel("Archive Model Context Protocol specification").click();
  await expect(row).toHaveCount(0);

  await page.getByRole("button", { name: /^Archive \d/ }).click();
  const archived = page.getByTestId("tab-row-t-research");
  await archived.hover();
  page.once("dialog", dialog => dialog.accept());
  await archived
    .getByLabel("Permanently delete Model Context Protocol specification")
    .click();
  await expect(archived).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tabvault-v3") || "{}")
  );
  expect(
    saved.library.tabs.some((tab: { id: string }) => tab.id === "t-research")
  ).toBe(false);
});

test("group hide is client-orchestrated and category colors are deterministic", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  const manualIndicator = page
    .getByTestId("group-separator-research")
    .getByRole("button", { name: "Change Research to Session", exact: true });
  const sessionIndicator = page
    .getByTestId("group-separator-session")
    .getByRole("button", {
      name: "Change Session Aug 23 13:00 to Manual",
      exact: true,
    });
  await expect(manualIndicator).toBeVisible();
  await expect(sessionIndicator).toBeVisible();
  expect(await manualIndicator.getAttribute("style")).not.toBe(
    await sessionIndicator.getAttribute("style")
  );

  await page.getByLabel("Hide Research").click();
  await page.getByRole("button", { name: "10 min", exact: true }).click();
  await expect(page.getByTestId("tab-row-t-research")).toHaveCount(0);
  await page.getByRole("button", { name: /^Hidden \d/ }).click();
  await expect(page.getByTestId("tab-row-t-research")).toBeVisible();
  await expect(page.getByTestId("tab-row-t-hidden")).toBeVisible();
});

test("Quick Move sits under search and offers only manual collections", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await expect(page.getByTestId("collection-drop-research")).toBeVisible();
  await expect(page.getByTestId("collection-drop-session")).toHaveCount(0);
  await expect(page.getByTestId("collection-drop-empty")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Select tabs" })).toHaveCount(
    0
  );
  const search = await page
    .getByLabel("Search your TabVault library")
    .boundingBox();
  const move = await page.getByTestId("collection-drop-research").boundingBox();
  expect(move!.y).toBeGreaterThan(search!.y);
});

test("group board keeps every tab visible and emphasizes search matches", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await page.evaluate(() => {
    const vault = JSON.parse(localStorage.getItem("tabvault-v3") || "{}");
    const source = vault.library.tabs.find(
      (tab: { id: string }) => tab.id === "advanced-new"
    );
    for (let index = 1; index <= 3; index += 1) {
      const id = `group-board-extra-${index}`;
      vault.library.tabs.push({
        ...source,
        id,
        content: { ...source.content, title: `Extra session tab ${index}` },
        url: `https://example.com/group-board-${index}`,
      });
      vault.library.tabs.at(-1).placement = {
        groupId: "session",
        position: index + 1,
      };
    }
    localStorage.setItem("tabvault-v3", JSON.stringify(vault));
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
  await openSchemaV5Library(page);
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
  await openSchemaV5Library(page);
  const sidebar = page.getByTestId("workspace-sidebar");
  await expect(sidebar).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: /^All Tabs/ })
  ).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: "Deduplicate" })
  ).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /^Tags/ })).toBeVisible();
  await sidebar.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(sidebar).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: "Deduplicate" })
  ).toBeVisible();
  await sidebar.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(sidebar).toBeVisible();
});

test("empty Session groups remain until explicitly deleted", async ({
  page,
}) => {
  await openSchemaV5Library(page);
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
        const vault = JSON.parse(localStorage.getItem("tabvault-v3") || "{}");
        return vault.library.vaultGroups?.some(
          (group: { id: string }) => group.id === "session"
        );
      })
    )
    .toBe(true);
});

test("empty groups delete immediately while populated groups require approval", async ({
  page,
}) => {
  await openSchemaV5Library(page);

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

test("Quick Clean archives later exact records without changing their properties", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  page.once("dialog", dialog => void dialog.dismiss());
  await page.getByRole("button", { name: "Quick clean" }).click();
  await expect(page.getByTestId("tab-row-t-duplicate")).toBeVisible();
  page.once("dialog", dialog => void dialog.accept());
  await page.getByRole("button", { name: "Quick clean" }).click();
  await expect(page.getByTestId("tab-row-t-duplicate")).toHaveCount(0);
  const survivor = page.getByTestId("tab-row-t-1001");
  await expect(survivor).toContainText("product");
  await expect(
    survivor.getByRole("checkbox", {
      name: "Mark Agents can organize the web better than we can as viewed",
    })
  ).not.toBeChecked();
  await page.getByRole("button", { name: /^Archive \d/ }).click();
  await expect(page.getByTestId("tab-row-t-duplicate")).toBeVisible();
});

test("Advanced Deduplicator previews and applies an exact-URL fixed plan", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await page
    .getByTestId("workspace-sidebar")
    .getByRole("button", { name: "Deduplicate" })
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
    JSON.parse(localStorage.getItem("tabvault-v3") || "{}")
  );
  expect(
    saved.library.tabs.find((tab: { id: string }) => tab.id === "advanced-old")
      .lifecycle.archived
  ).toBe(true);
  expect(
    saved.library.tabs.find((tab: { id: string }) => tab.id === "advanced-new")
      .lifecycle.archived
  ).not.toBe(true);
});

test("collection favicons retain their square dimensions", async ({ page }) => {
  await page.route("https://www.google.com/s2/favicons?*", route =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="green"/></svg>',
    })
  );
  await openSchemaV5Library(page);
  await page.getByLabel("Collection-group board view").click();
  const icon = page.getByTestId("grouped-tab-icon-advanced-new");
  await expect(icon).toBeVisible();
  await expect(icon).toHaveJSProperty("naturalWidth", 64);
  const bounds = (await icon.boundingBox())!;
  expect(bounds.width).toBe(24);
  expect(bounds.height).toBe(24);
});

test("Unassigned shares group lifecycle commands without becoming a stored collection", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await page
    .getByTestId("group-separator-unassigned")
    .getByRole("button", { name: "Hide [Unassigned]", exact: true })
    .click();
  await page.getByRole("button", { name: "10 min", exact: true }).click();
  await expect(page.getByTestId("tab-row-t-1001")).toHaveCount(0);
  await page.getByRole("button", { name: /^Hidden \d/ }).click();
  await expect(page.getByTestId("tab-row-t-1001")).toBeVisible();
  await page
    .getByRole("button", { name: "Unhide [Unassigned]", exact: true })
    .click();
  await expect(page.getByTestId("tab-row-t-1001")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("tabvault-v3")!).library.vaultGroups.some(
        (g: { id: string }) => g.id === "unassigned"
      )
    )
  ).toBe(false);
});
