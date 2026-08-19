import { expect, test, type Locator, type Page } from "@playwright/test";

const SOURCE_ID = "t-1001";
const TARGET_ID = "t-1002";

async function openFreshLibrary(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    window.location.replace("about:blank");
  });
  await page.waitForURL("about:blank");
  await page.goto("/");
  await expect(page.getByTestId(`tab-row-${SOURCE_ID}`)).toBeVisible();
}

async function startNativeDrag(
  page: Page,
  source: Locator,
  activator = source.getByRole("button", { name: /Reorder/ })
) {
  const sourceRect = await source.boundingBox();
  const origin = await activator.boundingBox();
  if (!origin || !sourceRect)
    throw new Error("Could not measure the drag origin.");

  const startX = origin.x + origin.width / 2;
  const startY = origin.y + origin.height / 2;
  const grabOffset = { x: startX - sourceRect.x, y: startY - sourceRect.y };
  const delta = { x: 18, y: 14 };
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + delta.x, startY + delta.y, { steps: 3 });

  await expect(source).toHaveAttribute("data-dragging", "true");
  await expect(source).toHaveAttribute("data-drag-gap", "visible");
  const draggedRect = await page.getByTestId("tab-drag-overlay").boundingBox();
  if (!draggedRect) throw new Error("Could not measure the dragged source.");
  expect(
    Math.abs(draggedRect.x + grabOffset.x - startX - delta.x)
  ).toBeLessThanOrEqual(3);
  expect(
    Math.abs(draggedRect.y + grabOffset.y - startY - delta.y)
  ).toBeLessThanOrEqual(6);
}

async function finishBelowTarget(page: Page, target: Locator) {
  const targetRect = await target.boundingBox();
  if (!targetRect) throw new Error("Could not measure the drop target.");
  await page.mouse.move(
    targetRect.x + targetRect.width / 2,
    targetRect.y + targetRect.height - 12,
    {
      steps: 8,
    }
  );
  await page.mouse.up();
}

async function finishOnCollection(page: Page, target: Locator) {
  const targetRect = await target.boundingBox();
  if (!targetRect) throw new Error("Could not measure the collection target.");
  await page.mouse.move(
    targetRect.x + targetRect.width / 2,
    targetRect.y + targetRect.height / 2,
    { steps: 8 }
  );
  await page.waitForTimeout(80);
  await page.mouse.move(
    targetRect.x + targetRect.width / 2 + 1,
    targetRect.y + targetRect.height / 2 + 1
  );
  await expect(target).toHaveAttribute("data-drop-active", "true");
  await page.mouse.up();
}

async function finishAboveTarget(page: Page, target: Locator) {
  const targetRect = await target.boundingBox();
  if (!targetRect) throw new Error("Could not measure the drop target.");
  await page.mouse.move(targetRect.x + targetRect.width / 2, targetRect.y + 8, {
    steps: 8,
  });
  await page.mouse.up();
}

async function expectOrder(page: Page, groupId = "inbox") {
  const order = await page
    .getByTestId(`tab-group-${groupId}`)
    .locator("[data-testid^='tab-row-']")
    .evaluateAll(rows => rows.map(row => row.getAttribute("data-testid")));
  expect(order.indexOf(`tab-row-${SOURCE_ID}`)).toBeGreaterThan(
    order.indexOf(`tab-row-${TARGET_ID}`)
  );
}

async function expectStablePosition(page: Page, row: Locator) {
  const first = await row.boundingBox();
  if (!first) throw new Error("Could not measure the dropped row.");
  await page.waitForTimeout(260);
  const settled = await row.boundingBox();
  if (!settled) throw new Error("Could not measure the settled row.");
  expect(Math.abs(first.y - settled.y)).toBeLessThanOrEqual(1);
}

test.describe("native tab reordering", () => {
  test("preserves the desktop grab point and reorders Inbox", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshLibrary(page);
    await startNativeDrag(page, page.getByTestId(`tab-row-${SOURCE_ID}`));
    await finishBelowTarget(page, page.getByTestId(`tab-row-${TARGET_ID}`));
    await expectOrder(page);
  });

  test("reorders upward without a post-drop position jitter", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshLibrary(page);
    await startNativeDrag(page, page.getByTestId(`tab-row-${TARGET_ID}`));
    await finishAboveTarget(page, page.getByTestId(`tab-row-${SOURCE_ID}`));
    const order = await page
      .getByTestId("tab-group-inbox")
      .locator("[data-testid^='tab-row-']")
      .evaluateAll(rows => rows.map(row => row.getAttribute("data-testid")));
    expect(order.indexOf(`tab-row-${TARGET_ID}`)).toBeLessThan(
      order.indexOf(`tab-row-${SOURCE_ID}`)
    );
    await expectStablePosition(page, page.getByTestId(`tab-row-${TARGET_ID}`));
  });

  test("uses the Compact left handle to preserve the grab point and reorder Inbox", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFreshLibrary(page);
    await page.getByRole("button", { name: "Compact tab view" }).click();
    await startNativeDrag(
      page,
      page.getByTestId(`tab-row-${SOURCE_ID}`),
      page.getByTestId(`tab-drag-handle-${SOURCE_ID}`)
    );
    await finishBelowTarget(page, page.getByTestId(`tab-row-${TARGET_ID}`));
    await expectOrder(page);
  });

  test("uses Compact empty row space to reorder Inbox on desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshLibrary(page);
    await page.getByRole("button", { name: "Compact tab view" }).click();
    await startNativeDrag(
      page,
      page.getByTestId(`tab-row-${SOURCE_ID}`),
      page.getByTestId(`tab-drag-space-${SOURCE_ID}`)
    );
    await finishBelowTarget(page, page.getByTestId(`tab-row-${TARGET_ID}`));
    await expectOrder(page);
  });

  test("reorders a nested collection from the unified All Tabs filter", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshLibrary(page);
    await page
      .getByTestId(`tab-row-${SOURCE_ID}`)
      .getByLabel(/Move /)
      .selectOption("llm-papers");
    await page
      .getByTestId(`tab-row-${TARGET_ID}`)
      .getByLabel(/Move /)
      .selectOption("llm-papers");
    await page
      .getByLabel("Filter search by collection")
      .selectOption("llm-papers");
    await expect(page.getByTestId("tab-group-llm-papers")).toBeVisible();
    await startNativeDrag(page, page.getByTestId(`tab-row-${SOURCE_ID}`));
    await finishBelowTarget(page, page.getByTestId(`tab-row-${TARGET_ID}`));
    await expectOrder(page, "llm-papers");
  });

  test("moves a dragged tab through the unified collection drop shelf", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshLibrary(page);
    await startNativeDrag(page, page.getByTestId(`tab-row-${SOURCE_ID}`));
    await finishOnCollection(page, page.getByTestId("collection-drop-build"));
    await expect(
      page.getByTestId("tab-group-build").getByTestId(`tab-row-${SOURCE_ID}`)
    ).toBeVisible();
    await expect(
      page.getByTestId("tab-group-inbox").getByTestId(`tab-row-${SOURCE_ID}`)
    ).toHaveCount(0);
  });

  test("moves a dragged tab directly into a flattened group at a requested position", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1400 });
    await openFreshLibrary(page);
    const targetRow = page.getByTestId("tab-row-t-1006");
    await expect(targetRow).toBeVisible();
    await startNativeDrag(page, page.getByTestId(`tab-row-${SOURCE_ID}`));
    await finishAboveTarget(page, targetRow);

    const targetGroupOrder = await page
      .getByTestId("tab-group-llm-papers")
      .locator("[data-testid^='tab-row-']")
      .evaluateAll(rows => rows.map(row => row.getAttribute("data-testid")));
    expect(targetGroupOrder.indexOf(`tab-row-${SOURCE_ID}`)).toBe(0);
    expect(targetGroupOrder.indexOf("tab-row-t-1006")).toBeGreaterThan(0);
    await expect(
      page.getByTestId("tab-group-inbox").getByTestId(`tab-row-${SOURCE_ID}`)
    ).toHaveCount(0);
  });

  test("moves selected tabs into another collection", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshLibrary(page);
    await page.getByRole("button", { name: "Select tabs" }).click();
    await page.getByLabel(/Select Agents can organize/).check();
    await page.getByLabel(/Select Zvec/).check();
    await page
      .getByLabel("Move selected tabs to collection")
      .selectOption("build");
    await page.getByLabel("Filter search by collection").selectOption("build");
    await expect(page.getByTestId(`tab-row-${SOURCE_ID}`)).toBeVisible();
    await expect(page.getByTestId(`tab-row-${TARGET_ID}`)).toBeVisible();
  });

  test("opens the dashboard for local cache and operational status", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshLibrary(page);
    await page.getByRole("button", { name: "Dashboard" }).click();
    await expect(
      page.getByRole("heading", { name: "System status, without the noise." })
    ).toBeVisible();
    await expect(page.getByText("Saved tabs", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Stored in this browser profile")
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to library" }).click();
    await expect(page.getByTestId(`tab-row-${SOURCE_ID}`)).toBeVisible();
  });

  test("opens every tab in a collection from its group header", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshLibrary(page);
    await page.evaluate(() => {
      const openedUrls: string[] = [];
      Object.defineProperty(window, "__tabvaultOpenedUrls", {
        configurable: true,
        value: openedUrls,
      });
      window.open = ((url?: string | URL) => {
        openedUrls.push(String(url));
        return window;
      }) as typeof window.open;
    });
    await page.getByRole("button", { name: /All Tabs/ }).click();
    await page
      .getByTestId("tab-group-inbox")
      .getByRole("button", { name: "Open all tabs in Inbox" })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { __tabvaultOpenedUrls: string[] })
              .__tabvaultOpenedUrls
        )
      )
      .toHaveLength(5);
    await expect(page.getByText("Opened 5 tabs")).toBeVisible();
  });

  test("opens every collection URL through the extension tabs API", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      const openedUrls: string[] = [];
      Object.defineProperty(window, "__tabvaultExtensionOpenedUrls", {
        configurable: true,
        value: openedUrls,
      });
      Object.defineProperty(window, "chrome", {
        configurable: true,
        value: {
          runtime: {
            id: "tabvault-test-extension",
            onMessage: {
              addListener: () => undefined,
              removeListener: () => undefined,
            },
            sendMessage: async () => ({}),
          },
          storage: {
            local: {
              get: async () => ({}),
              set: async () => undefined,
            },
          },
          tabs: {
            create: async ({ url }: { url: string }) => {
              openedUrls.push(url);
              return {};
            },
          },
        },
      });
    });
    await openFreshLibrary(page);
    await page.getByRole("button", { name: /All Tabs/ }).click();
    await page
      .getByTestId("tab-group-inbox")
      .getByRole("button", { name: "Open all tabs in Inbox" })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as Window & {
                __tabvaultExtensionOpenedUrls: string[];
              }
            ).__tabvaultExtensionOpenedUrls
        )
      )
      .toHaveLength(5);
  });

  test("uses Group board as an All Tabs view and filters without a collection route", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshLibrary(page);
    await page
      .getByRole("button", { name: "Collection-group board view" })
      .click();
    await expect(page.getByTestId("group-board")).toBeVisible();
    await expect(page.getByTestId("group-card-build")).toBeVisible();
    await expect(page.getByText("Collections", { exact: true })).toHaveCount(0);
    await page.getByTestId("group-browse-build").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", { name: "All tabs", exact: true })
    ).toBeVisible();
    await expect(page.getByLabel("Filter search by collection")).toHaveValue(
      "build"
    );
    await expect(page.getByTestId("tab-row-t-1007")).toBeVisible();
  });

  test("shares a collection as Markdown and confirms deletion", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshLibrary(page);
    await page
      .getByRole("button", { name: "Collection-group board view" })
      .click();
    const buildCard = page.getByTestId("group-card-build");
    await buildCard
      .getByRole("button", { name: "Copy Build as Markdown" })
      .click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain("# Build");
    await buildCard.getByRole("button", { name: "Delete Build" }).click();
    await expect(
      page.getByRole("dialog", { name: "Delete Build collection" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(buildCard).toBeVisible();
    await buildCard.getByRole("button", { name: "Delete Build" }).click();
    await page.getByRole("button", { name: "Delete collection" }).click();
    await expect(page.getByTestId("group-card-build")).toHaveCount(0);
  });

  test("archives a tab, exposes it in Archive, and permanently deletes only there", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshLibrary(page);
    await page
      .getByRole("button", { name: /Archive Agents can organize/ })
      .click();
    await expect(
      page.getByRole("dialog", { name: /Archive Agents can organize/ })
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId(`tab-row-${SOURCE_ID}`)).toBeVisible();
    await page
      .getByRole("button", { name: /Archive Agents can organize/ })
      .click();
    await page.getByRole("button", { name: "Archive tab" }).click();
    await expect(page.getByTestId(`tab-row-${SOURCE_ID}`)).toHaveCount(0);
    await page.getByRole("button", { name: "Archive 1" }).click();
    await expect(page.getByTestId(`tab-row-${SOURCE_ID}`)).toBeVisible();
    await page
      .getByRole("button", { name: /Archive Agents can organize/ })
      .click();
    await expect(
      page.getByRole("dialog", {
        name: /Permanently delete Agents can organize/,
      })
    ).toBeVisible();
    await page.getByRole("button", { name: "Permanently delete" }).click();
    await expect(page.getByTestId(`tab-row-${SOURCE_ID}`)).toHaveCount(0);
  });

  test("suggests catalog tags while editing a tab", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshLibrary(page);
    await page.getByRole("button", { name: /Edit Zvec/ }).click();
    const tagInput = page.getByLabel("Search or create tag");
    await tagInput.fill("pro");
    await expect(
      page.locator("#tag-catalog-suggestions option[value='product']")
    ).toHaveCount(1);
    await tagInput.fill("product");
    await tagInput.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Edit tab" }).getByText("product", {
        exact: true,
      })
    ).toBeVisible();
  });

  test("keeps spaces and normal text entry safe in search and editor fields", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshLibrary(page);
    const search = page.getByLabel("Search your TabVault library");
    await search.fill("local first notes");
    await expect(search).toHaveValue("local first notes");
    await expect(page.locator("input[type='checkbox']:checked")).toHaveCount(0);
    await search.fill("");
    await page.getByRole("button", { name: /Edit Zvec/ }).click();
    const editor = page.getByRole("dialog", { name: "Edit tab" });
    await editor.getByLabel("Title").fill("Zvec local notes");
    await editor.getByLabel("Note").fill("Keep this note readable");
    await editor.getByLabel("Search or create tag").fill("new research tag");
    await expect(editor.getByLabel("Title")).toHaveValue("Zvec local notes");
    await expect(editor.getByLabel("Note")).toHaveValue(
      "Keep this note readable"
    );
    await expect(editor.getByLabel("Search or create tag")).toHaveValue(
      "new research tag"
    );
  });
});
