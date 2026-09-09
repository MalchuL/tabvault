import { expect, test } from "@playwright/test";
import { openSchemaV2Library } from "./schema-v2-fixture";

test("sidebar stays visible while a new page loads", async ({ page }) => {
  await openSchemaV2Library(page);
  const sidebar = page.getByTestId("workspace-sidebar");
  const originalSidebar = await sidebar.elementHandle();
  const originalCount = await sidebar
    .getByRole("button", { name: /^All Tabs/ })
    .textContent();
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route("**/pages/Settings.tsx*", async route => {
    await pending;
    await route.continue();
  });
  try {
    await sidebar
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Loading page" })
    ).toBeVisible();
    await expect(sidebar).toBeVisible();
    expect(
      await originalSidebar?.evaluate(
        node => node.isConnected && getComputedStyle(node).display !== "none"
      )
    ).toBe(true);
    await expect(sidebar.getByRole("button", { name: /^All Tabs/ })).toHaveText(
      originalCount!
    );
  } finally {
    release();
  }
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true })
  ).toBeVisible();
  expect(
    await originalSidebar?.evaluate(
      node =>
        node === document.querySelector('[data-testid="workspace-sidebar"]')
    )
  ).toBe(true);
  await expect(sidebar.getByRole("button", { name: /^All Tabs/ })).toHaveText(
    originalCount!
  );
});

for (const width of [1440, 390]) {
  test(`workspace pages fit at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openSchemaV2Library(page);
    for (const [route, heading] of [
      ["/", "All tabs"],
      ["/dashboard", "Dashboard"],
      ["/settings", "Settings"],
      ["/transfer", "Import & Export"],
      ["/deduplicate", "Advanced Deduplicator"],
    ]) {
      if (route !== "/") await page.goto(route);
      await expect(
        page.getByRole("heading", { name: heading, exact: true })
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(
          `${heading.replaceAll(/[^a-zA-Z]/g, "-")}.png`
        ),
        fullPage: true,
      });
    }
    if (width < 1024) {
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      await expect(page.getByTestId("workspace-sidebar")).toBeInViewport();
      await page
        .getByTestId("workspace-sidebar")
        .getByRole("button", { name: /^All Tabs/ })
        .click();
      await expect(
        page.getByRole("heading", { name: "All tabs", exact: true })
      ).toBeVisible();
      await expect(page.getByTestId("workspace-sidebar")).not.toBeInViewport();
    }
  });
}

test("reserved group spacing stays stable during drag reordering", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  const group = page.getByTestId("tab-group-unassigned");
  await expect(group).toHaveAttribute("data-drop-gap-height", "128");
  const nextGroupTop = (await page
    .getByTestId("tab-group-session")
    .boundingBox())!.y;
  const handle = await page
    .getByTestId("tab-row-t-1001")
    .getByRole("button", { name: /^Reorder/ })
    .boundingBox();
  const target = await page.getByTestId("tab-row-advanced-old").boundingBox();
  await page.mouse.move(
    handle!.x + handle!.width / 2,
    handle!.y + handle!.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    handle!.x + handle!.width / 2,
    handle!.y + handle!.height / 2 + 12,
    { steps: 3 }
  );
  await expect(page.getByTestId("tab-drag-preview")).toBeVisible();
  await expect(group).toHaveAttribute("data-drop-gap-height", "128");
  expect((await page.getByTestId("tab-group-session").boundingBox())!.y).toBe(
    nextGroupTop
  );
  await page.mouse.move(
    handle!.x + handle!.width / 2,
    target!.y + target!.height * 0.75,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(page.getByTestId("tab-drag-preview")).toHaveCount(0);
  await expect(
    group.locator('[data-testid^="tab-row-"]').first()
  ).toHaveAttribute("data-testid", "tab-row-advanced-old");
  await expect(group).toHaveAttribute("data-drop-gap-height", "128");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const vault = JSON.parse(localStorage.getItem("tabvault-v3")!);
        return {
          groupId: vault.tabs.find((tab: { id: string }) => tab.id === "t-1001")
            .groupId,
          order: vault.tabOrders.unassigned,
        };
      })
    )
    .toEqual({ groupId: null, order: ["advanced-old", "t-1001"] });
});

for (const width of [1440, 390]) {
  test(`search and selection stay reachable while scrolling at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    await openSchemaV2Library(page);
    const toolbar = page.getByTestId("library-search-toolbar");
    const search = page.getByRole("textbox", {
      name: "Search your TabVault library",
    });
    const top = width < 1024 ? 56 : 0;
    await page.evaluate(() => window.scrollTo(0, 400));
    await expect.poll(async () => (await toolbar.boundingBox())!.y).toBe(top);
    await expect(search).toBeInViewport();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page
      .getByRole("button", { name: "Select tabs", exact: true })
      .click();
    await page.evaluate(() => window.scrollTo(0, 400));
    await expect.poll(async () => (await toolbar.boundingBox())!.y).toBe(top);
    await toolbar
      .getByRole("button", { name: "Select all", exact: true })
      .click();
    await expect(
      toolbar.getByLabel("Move selected tabs to collection")
    ).toBeInViewport();
    await expect(
      toolbar.getByRole("button", {
        name: "Archive selected tabs",
        exact: true,
      })
    ).toBeInViewport();
    await expect(search).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
  });
}

test("move icon describes its action and moves selected tabs", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  await page.getByRole("button", { name: "Select tabs", exact: true }).click();
  await page
    .getByTestId("tab-row-t-1001")
    .getByRole("checkbox", { name: /^Select / })
    .check();
  const move = page.getByRole("button", {
    name: "Move selected tabs to collection",
  });
  await move.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Move selected tabs to collection"
  );
  await move.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem")).toHaveText(["Research"]);
  await page.getByRole("menuitem", { name: "Research", exact: true }).click();
  await expect(
    page.getByTestId("tab-group-research").getByTestId("tab-row-t-1001")
  ).toBeVisible();
});
