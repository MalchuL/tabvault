import { expect, test } from "@playwright/test";
import { openSchemaV5Library } from "./schema-v5-fixture";

for (const view of ["Standard", "Compact"]) {
  test(`${view} keeps mobile titles readable and actions usable`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSchemaV5Library(page);
    await page
      .getByRole("button", { name: `${view} tab view`, exact: true })
      .click();
    const row = page.getByTestId("tab-row-t-1001");
    const title = row.getByRole("link");
    expect((await title.boundingBox())!.width).toBeGreaterThan(200);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await row.getByRole("button", { name: /^Edit / }).click();
    await expect(page.getByRole("dialog", { name: "Edit tab" })).toBeVisible();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`${view}-mobile.png`),
      fullPage: true,
    });
  });
}

test("board retains unassigned tabs, search matches, and virtual collection identity", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await page
    .getByRole("button", { name: "Collection-group board view", exact: true })
    .click();
  const unassigned = page.getByTestId("group-card-unassigned");
  await expect(unassigned.locator("[data-tab-id]")).toHaveCount(2);
  await expect(
    page.getByTestId("group-board").locator("[data-tab-id]")
  ).toHaveCount(5);
  await page.getByLabel("Search your TabVault library").fill("#old");
  await expect(
    page.getByRole("heading", { name: "1 matches", exact: true })
  ).toBeVisible();
  await expect(
    unassigned.getByTestId("grouped-tab-advanced-old")
  ).toHaveAttribute("data-search-state", "match");
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await unassigned
    .getByRole("button", { name: "Browse →", exact: true })
    .click();
  await expect(page.getByLabel("Filter search by collection")).toHaveValue(
    "unassigned"
  );
  await expect(page.locator('[data-testid^="tab-row-"]')).toHaveCount(2);
  await page
    .getByRole("button", { name: "Collection-group board view", exact: true })
    .click();
  await expect(page.locator('[data-testid^="group-card-"]')).toHaveCount(1);
  const groups = await page.evaluate(
    () => JSON.parse(localStorage.getItem("tabvault-v3")!).library.vaultGroups
  );
  expect(groups.map((group: { id: string }) => group.id).sort()).toEqual([
    "empty",
    "research",
    "session",
  ]);
});

test("tag clicks filter exactly and clearing search restores all visible tabs", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await page
    .getByTestId("tab-row-t-1001")
    .getByRole("button", { name: "#product", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Search your TabVault library")).toHaveValue(
    "#product"
  );
  await expect(page.locator('[data-testid^="tab-row-"]')).toHaveCount(2);
  await expect(page.getByTestId("tab-row-t-research")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page.locator('[data-testid^="tab-row-"]')).toHaveCount(5);
});

test("board favicon opens its URL without leaving the board", async ({
  page,
  context,
}) => {
  await context.route("https://modelcontextprotocol.io/**", route =>
    route.fulfill({ contentType: "text/html", body: "Saved page" })
  );
  await openSchemaV5Library(page);
  await page
    .getByRole("button", { name: "Collection-group board view", exact: true })
    .click();
  const opened = context.waitForEvent("page");
  await page.getByTestId("grouped-tab-t-research").click();
  const target = await opened;
  await expect(target).toHaveURL(
    "https://modelcontextprotocol.io/specification"
  );
  await expect(page.getByTestId("group-board")).toBeVisible();
  await target.close();
});

test("closed mobile navigation does not capture focus and Escape restores its trigger", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSchemaV5Library(page);
  const trigger = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Tab");
  expect(
    await page
      .getByTestId("workspace-sidebar")
      .evaluate(sidebar => sidebar.contains(document.activeElement))
  ).toBe(false);
  await trigger.click();
  await expect(
    page.getByRole("button", { name: "Close navigation", exact: true })
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("first launch explains the empty library and offers an import", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Your library is empty.", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Quick clean", exact: true })
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Import a library", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Import & Export", exact: true })
  ).toBeVisible();
});

test("board opening through Chrome marks the tab viewed", async ({ page }) => {
  await openSchemaV5Library(page);
  await page
    .getByRole("button", { name: "Collection-group board view", exact: true })
    .click();
  await page.evaluate(() => {
    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: {
        runtime: {
          id: "test-extension",
          onMessage: {
            addListener: () => undefined,
            removeListener: () => undefined,
          },
        },
        storage: {
          local: {
            get: async (key: string) => {
              const raw = localStorage.getItem(key);
              try {
                return { [key]: JSON.parse(raw ?? "null") };
              } catch {
                return { [key]: raw };
              }
            },
            set: async (values: Record<string, unknown>) => {
              for (const [key, value] of Object.entries(values))
                localStorage.setItem(key, JSON.stringify(value));
            },
          },
        },
        tabs: { create: async ({ url }: { url: string }) => ({ id: 1, url }) },
      },
    });
  });
  await page.getByTestId("grouped-tab-t-research").click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("tabvault-v3")!).library.tabs.find(
            (tab: { id: string }) => tab.id === "t-research"
          ).annotations.customProperties.viewed
      )
    )
    .toBe(true);
  await expect(page.getByTestId("group-board")).toBeVisible();
});

test("board can move a tab back into virtual Unassigned", async ({ page }) => {
  await openSchemaV5Library(page);
  await page
    .getByRole("button", { name: "Collection-group board view", exact: true })
    .click();
  const source = (await page
    .getByTestId("grouped-tab-t-research")
    .boundingBox())!;
  const destination = (await page
    .getByTestId("group-card-unassigned")
    .boundingBox())!;
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    source.x + source.width / 2 + 12,
    source.y + source.height / 2,
    { steps: 3 }
  );
  await expect(page.getByTestId("tab-drag-preview")).toBeVisible();
  await page.mouse.move(
    destination.x + destination.width / 2,
    destination.y + destination.height / 2,
    { steps: 15 }
  );
  await expect(
    page
      .getByTestId("group-card-unassigned")
      .getByTestId("grouped-tab-t-research")
  ).toBeVisible();
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("tabvault-v3")!).library.tabs.find(
            (tab: { id: string }) => tab.id === "t-research"
          ).placement.groupId
      )
    )
    .toBe(null);
  await page.reload();
  await expect(
    page
      .getByTestId("group-card-unassigned")
      .getByTestId("grouped-tab-t-research")
  ).toBeVisible();
});
