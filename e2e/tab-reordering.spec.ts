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
  const origin = await activator.boundingBox();
  if (!origin) throw new Error("Could not measure the drag origin.");
  const title = (await source.getByRole("link").first().textContent())?.trim();
  const startX = origin.x + origin.width / 2;
  const startY = origin.y + origin.height / 2;
  const delta = { x: 18, y: 14 };
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + delta.x, startY + delta.y, { steps: 3 });

  await expect(source).toHaveAttribute("data-dragging", "true");
  await expect(source).toHaveCSS("opacity", "0");
  await expect(page.getByTestId("tab-drag-preview")).toContainText(title ?? "");
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

async function moveOnGroupGap(page: Page, target: Locator) {
  const targetRect = await target.boundingBox();
  if (!targetRect) throw new Error("Could not measure the collection target.");
  const gapHeight = await target.evaluate(element =>
    Number.parseFloat(getComputedStyle(element).paddingBottom)
  );
  await page.mouse.move(
    targetRect.x + targetRect.width / 2,
    targetRect.y + targetRect.height - gapHeight / 2,
    { steps: 8 }
  );
  await page.waitForTimeout(80);
  await page.mouse.move(
    targetRect.x + targetRect.width / 2 + 1,
    targetRect.y + targetRect.height - gapHeight / 2 + 1
  );
  await page.waitForTimeout(120);
}

async function finishOnGroup(page: Page, target: Locator) {
  await moveOnGroupGap(page, target);
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

test.describe("native tab reordering", () => {
  test.describe.configure({ mode: "serial" });

  test("shows the dragged tab and reorders Inbox", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshLibrary(page);
    await startNativeDrag(page, page.getByTestId(`tab-row-${SOURCE_ID}`));
    await finishBelowTarget(page, page.getByTestId(`tab-row-${TARGET_ID}`));
    await expectOrder(page);
  });

  test("reorders upward within a collection", async ({ page }) => {
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
  });

  test("uses the Compact left handle to reorder Inbox", async ({ page }) => {
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

  test("moves a dragged tab onto a collection empty item", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1800 });
    await openFreshLibrary(page);
    await page.getByRole("button", { name: "Compact tab view" }).click();
    await startNativeDrag(
      page,
      page.getByTestId("tab-row-t-1006"),
      page.getByTestId("tab-drag-handle-t-1006")
    );
    await finishOnGroup(page, page.getByTestId("tab-group-research"));
    await expect(
      page.getByTestId("tab-group-research").getByTestId("tab-row-t-1006")
    ).toBeVisible();
    await expect(
      page.getByTestId("tab-group-llm-papers").getByTestId("tab-row-t-1006")
    ).toHaveCount(0);
  });

  test("uses the dragged row as the correctly sized destination gap", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1800 });
    await openFreshLibrary(page);
    const source = page.getByTestId("tab-row-t-1006");
    await expect(page.locator("[data-drop-gap-height]")).toHaveCount(5);
    const standardHeights = await page
      .locator("[data-testid^='tab-row-']")
      .evaluateAll(rows =>
        Array.from(new Set(rows.map(row => row.getBoundingClientRect().height)))
      );
    expect(standardHeights).toEqual([128]);
    await expect(source.getByText("edit", { exact: true })).toHaveCount(0);

    const standardEmptyArea = page.getByTestId("tab-group-research");
    await expect
      .poll(() =>
        standardEmptyArea.evaluate(element =>
          Number.parseFloat(getComputedStyle(element).paddingBottom)
        )
      )
      .toBe(128);
    await page.getByRole("button", { name: "Compact tab view" }).click();
    await expect
      .poll(() =>
        standardEmptyArea.evaluate(element =>
          Number.parseFloat(getComputedStyle(element).paddingBottom)
        )
      )
      .toBe(45);
    const compactRowHeight = (await source.boundingBox())?.height;
    expect(compactRowHeight).toBe(45);

    await startNativeDrag(
      page,
      source,
      page.getByTestId("tab-drag-handle-t-1006")
    );
    const emptyArea = standardEmptyArea;
    await expect
      .poll(() =>
        emptyArea.evaluate(element =>
          Number.parseFloat(getComputedStyle(element).paddingBottom)
        )
      )
      .toBe(compactRowHeight);

    await moveOnGroupGap(page, emptyArea);
    await expect(
      page.getByTestId("tab-group-llm-papers").getByTestId("tab-row-t-1006")
    ).toHaveCount(0);
    await expect(
      page.getByTestId("tab-group-research").getByTestId("tab-row-t-1006")
    ).toHaveCSS("opacity", "0");
    await expect
      .poll(
        async () =>
          (await page.getByTestId("tab-row-t-1006").boundingBox())?.height
      )
      .toBe(compactRowHeight);
    await expect
      .poll(() =>
        page
          .getByTestId("tab-group-llm-papers")
          .evaluate(element =>
            Number.parseFloat(getComputedStyle(element).paddingBottom)
          )
      )
      .toBe(compactRowHeight);
    await expect(emptyArea).toHaveCSS(
      "padding-bottom",
      `${compactRowHeight}px`
    );
    await expect(page.getByTestId("group-insertion-gap")).toHaveCount(0);

    await page.mouse.up();
    await expect(
      page.getByTestId("tab-group-research").getByTestId("tab-row-t-1006")
    ).toBeVisible();
    await expect(emptyArea).toHaveCSS("padding-bottom", "45px");
  });

  test("restores the original collection when a cross-list drag is canceled", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1800 });
    await openFreshLibrary(page);
    const source = page.getByTestId("tab-row-t-1006");
    await page.getByRole("button", { name: "Compact tab view" }).click();
    await startNativeDrag(
      page,
      source,
      page.getByTestId("tab-drag-handle-t-1006")
    );
    await moveOnGroupGap(page, page.getByTestId("tab-group-research"));
    await expect(
      page.getByTestId("tab-group-research").getByTestId("tab-row-t-1006")
    ).toHaveCSS("opacity", "0");
    await expect(
      page.getByTestId("tab-group-llm-papers").getByTestId("tab-row-t-1006")
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(
      page.getByTestId("tab-group-llm-papers").getByTestId("tab-row-t-1006")
    ).toBeVisible();
    await expect(
      page.getByTestId("tab-group-research").getByTestId("tab-row-t-1006")
    ).toHaveCount(0);
  });

  test("moves a dragged tab with the Quick move shelf", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshLibrary(page);
    await startNativeDrag(page, page.getByTestId(`tab-row-${SOURCE_ID}`));
    const buildDropTarget = page.getByTestId("collection-drop-build");
    await buildDropTarget.hover({ force: true });
    await expect(buildDropTarget).toHaveAttribute("data-drop-active", "true");
    await page.waitForTimeout(120);
    await page.mouse.up();
    await expect(
      page.getByTestId("tab-group-build").getByTestId(`tab-row-${SOURCE_ID}`)
    ).toBeVisible();
  });

  test("moves a dragged tab directly into a flattened group", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1800 });
    await openFreshLibrary(page);
    const targetRow = page.getByTestId("tab-row-t-1006");
    await expect(targetRow).toBeVisible();
    const sourceRow = page.getByTestId(`tab-row-${SOURCE_ID}`);
    await page.getByRole("button", { name: "Compact tab view" }).click();
    await startNativeDrag(
      page,
      sourceRow,
      page.getByTestId(`tab-drag-handle-${SOURCE_ID}`)
    );
    const targetRect = await targetRow.boundingBox();
    if (!targetRect) throw new Error("Could not measure rows.");
    await page.mouse.move(
      targetRect.x + targetRect.width / 2,
      targetRect.y + 8,
      {
        steps: 8,
      }
    );

    await expect(page.getByTestId("group-insertion-gap")).toHaveCount(0);
    await expect(
      page.getByTestId("tab-group-inbox").getByTestId(`tab-row-${SOURCE_ID}`)
    ).toHaveCount(0);
    await expect(
      page
        .getByTestId("tab-group-llm-papers")
        .getByTestId(`tab-row-${SOURCE_ID}`)
    ).toHaveCSS("opacity", "0");
    const currentTargetRect = await targetRow.boundingBox();
    if (!currentTargetRect) throw new Error("Could not remeasure target row.");
    await page.mouse.move(
      currentTargetRect.x + currentTargetRect.width / 2,
      currentTargetRect.y + 4
    );
    await page.waitForTimeout(120);
    await page.mouse.up();

    const targetGroupOrder = await page
      .getByTestId("tab-group-llm-papers")
      .locator("[data-testid^='tab-row-']")
      .evaluateAll(rows => rows.map(row => row.getAttribute("data-testid")));
    expect(targetGroupOrder).toHaveLength(2);
    expect(targetGroupOrder).toContain(`tab-row-${SOURCE_ID}`);
    expect(targetGroupOrder).toContain("tab-row-t-1006");
    await expect(
      page.getByTestId("tab-group-inbox").getByTestId(`tab-row-${SOURCE_ID}`)
    ).toHaveCount(0);
  });

  test("continues sorting after entering another collection", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1800 });
    await openFreshLibrary(page);
    await page
      .getByTestId(`tab-row-${TARGET_ID}`)
      .getByLabel(/Move /)
      .selectOption("llm-papers");
    await page.getByRole("button", { name: "Compact tab view" }).click();

    await startNativeDrag(
      page,
      page.getByTestId(`tab-row-${SOURCE_ID}`),
      page.getByTestId(`tab-drag-handle-${SOURCE_ID}`)
    );
    const firstTarget = page.getByTestId("tab-row-t-1006");
    const firstRect = await firstTarget.boundingBox();
    if (!firstRect) throw new Error("Could not measure the first target.");
    await page.mouse.move(firstRect.x + firstRect.width / 2, firstRect.y + 8, {
      steps: 8,
    });
    await expect(
      page
        .getByTestId("tab-group-llm-papers")
        .getByTestId(`tab-row-${SOURCE_ID}`)
    ).toHaveCSS("opacity", "0");

    const secondTarget = page.getByTestId(`tab-row-${TARGET_ID}`);
    const secondRect = await secondTarget.boundingBox();
    if (!secondRect) throw new Error("Could not measure the second target.");
    await page.mouse.move(
      secondRect.x + secondRect.width / 2,
      secondRect.y + secondRect.height - 12,
      { steps: 8 }
    );
    await page.waitForTimeout(120);
    await page.mouse.move(
      secondRect.x + secondRect.width / 2 + 1,
      secondRect.y + secondRect.height - 11
    );
    await page.waitForTimeout(120);
    await page.mouse.up();

    const finalOrder = await page
      .getByTestId("tab-group-llm-papers")
      .locator("[data-testid^='tab-row-']")
      .evaluateAll(rows => rows.map(row => row.getAttribute("data-testid")));
    expect(finalOrder).toEqual([
      "tab-row-t-1006",
      `tab-row-${SOURCE_ID}`,
      `tab-row-${TARGET_ID}`,
    ]);
  });

  test("keeps the trailing collection gap stable for the last position", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1800 });
    await openFreshLibrary(page);
    await page
      .getByTestId(`tab-row-${TARGET_ID}`)
      .getByLabel(/Move /)
      .selectOption("llm-papers");
    await page.getByRole("button", { name: "Compact tab view" }).click();

    await startNativeDrag(
      page,
      page.getByTestId(`tab-row-${SOURCE_ID}`),
      page.getByTestId(`tab-drag-handle-${SOURCE_ID}`)
    );
    const destination = page.getByTestId("tab-group-llm-papers");
    await moveOnGroupGap(page, destination);
    await expect(destination).toHaveAttribute("data-drop-active", "true");
    await page.waitForTimeout(200);
    await expect(destination).toHaveAttribute("data-drop-active", "true");
    await page.mouse.up();

    const finalOrder = await destination
      .locator("[data-testid^='tab-row-']")
      .evaluateAll(rows => rows.map(row => row.getAttribute("data-testid")));
    expect(finalOrder).toEqual([
      "tab-row-t-1006",
      `tab-row-${TARGET_ID}`,
      `tab-row-${SOURCE_ID}`,
    ]);
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

  test("keeps empty collections visible and shows actions inside one collection", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshLibrary(page);

    await expect(page.getByTestId("tab-group-filed")).toContainText("0 tabs");
    await page.getByLabel("Filter search by collection").selectOption("filed");
    const filed = page.getByTestId("tab-group-filed");
    await expect(filed).toBeVisible();
    await expect(
      filed.getByRole("button", { name: "Open all tabs in Filed" })
    ).toBeVisible();
    await expect(
      filed.getByRole("button", { name: "Copy Filed as Markdown" })
    ).toBeVisible();
    await expect(
      filed.getByRole("button", { name: "Delete Filed" })
    ).toBeVisible();
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
