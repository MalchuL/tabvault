import { expect, test } from "@playwright/test";
import { openSchemaV5Library } from "./schema-v5-fixture";

test("sidebar stays visible while a new page loads", async ({ page }) => {
  await openSchemaV5Library(page);
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
    await openSchemaV5Library(page);
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
  await openSchemaV5Library(page);
  const group = page.getByTestId("tab-group-unassigned");
  await expect(group).toHaveAttribute("data-drop-gap-height", "96");
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
  await expect(group).toHaveAttribute("data-drop-gap-height", "96");
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
  await expect(group).toHaveAttribute("data-drop-gap-height", "96");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const vault = JSON.parse(localStorage.getItem("tabvault-v3")!);
        return {
          groupId: vault.library.tabs.find(
            (tab: { id: string }) => tab.id === "t-1001"
          ).placement.groupId,
          order: vault.library.tabs
            .filter(t => !t.lifecycle.archived && t.placement.groupId === null)
            .sort((a, b) => a.placement.position - b.placement.position)
            .map(t => t.id),
        };
      })
    )
    .toEqual({ groupId: null, order: ["advanced-old", "t-1001"] });
});

for (const width of [1440, 390]) {
  test(`search and Quick Move stay reachable while scrolling at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    await openSchemaV5Library(page);
    const toolbar = page.getByTestId("library-search-toolbar");
    const search = page.getByRole("textbox", {
      name: "Search your TabVault library",
    });
    const top = width < 1024 ? 56 : 0;
    await page.evaluate(() => window.scrollTo(0, 400));
    await expect.poll(async () => (await toolbar.boundingBox())!.y).toBe(top);
    await expect(search).toBeInViewport();
    await expect(page.getByTestId("collection-drop-research")).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
  });
}
