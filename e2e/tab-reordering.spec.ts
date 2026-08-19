import { expect, test, type Page } from "@playwright/test";

const SOURCE_ID = "t-1001";
const TARGET_ID = "t-1002";

async function openFreshLibrary(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto("/");
  await expect(page.getByTestId(`tab-row-${SOURCE_ID}`)).toBeVisible();
}

async function startDrag(page: Page, compact: boolean) {
  const source = page.getByTestId(`tab-row-${SOURCE_ID}`);
  const origin = compact
    ? await source.boundingBox()
    : await source
        .getByRole("button", {
          name: "Reorder Agents can organize the web better than we can",
        })
        .boundingBox();

  if (!origin) throw new Error("Could not measure the drag origin.");
  const pointer = {
    x: compact ? origin.x + 4 : origin.x + origin.width / 2,
    y: origin.y + origin.height / 2,
  };
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.down();
  pointer.x += 14;
  pointer.y += 12;
  await page.mouse.move(pointer.x, pointer.y, { steps: 3 });

  await expect(source).toHaveAttribute("data-dragging", "true");
  await expect(source).toHaveAttribute("data-drag-gap", "visible");
  await expect(page.getByTestId("drag-overlay")).toBeVisible();
  return pointer;
}

async function expectOverlayCenteredAtPointer(
  page: Page,
  pointer: { x: number; y: number }
) {
  const overlay = await page.getByTestId("drag-overlay").boundingBox();
  if (!overlay) throw new Error("Could not measure the drag overlay.");
  const xDelta = overlay.x + overlay.width / 2 - pointer.x;
  const yDelta = overlay.y + overlay.height / 2 - pointer.y;
  expect(Math.abs(xDelta)).toBeLessThanOrEqual(4);
  expect(Math.abs(yDelta)).toBeLessThanOrEqual(4);
}

async function moveAndDropAfterTarget(
  page: Page,
  pointer: { x: number; y: number }
) {
  const target = await page.getByTestId(`tab-row-${TARGET_ID}`).boundingBox();
  if (!target) throw new Error("Could not measure the drop target.");
  pointer.x = target.x + target.width / 2;
  pointer.y = target.y + target.height - 12;
  await page.mouse.move(pointer.x, pointer.y, { steps: 8 });
  await expectOverlayCenteredAtPointer(page, pointer);
  await page.mouse.up();
  await expect(page.getByTestId(`tab-row-${SOURCE_ID}`)).toHaveAttribute(
    "data-dragging",
    "false"
  );
  const order = await page
    .getByTestId("tab-list")
    .locator("[data-testid^='tab-row-']")
    .evaluateAll(rows => rows.map(row => row.getAttribute("data-testid")));
  expect(order.indexOf(`tab-row-${SOURCE_ID}`)).toBeGreaterThan(
    order.indexOf(`tab-row-${TARGET_ID}`)
  );
}

test.describe("tab reordering pointer alignment", () => {
  test("keeps the standard-row overlay under the desktop pointer and reorders", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshLibrary(page);
    const pointer = await startDrag(page, false);
    await expectOverlayCenteredAtPointer(page, pointer);
    await moveAndDropAfterTarget(page, pointer);
  });

  test("keeps the compact-row overlay under the narrow-screen pointer and reorders", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFreshLibrary(page);
    await page.getByRole("button", { name: "Compact tab view" }).click();
    await expect(page.getByTestId(`tab-row-${SOURCE_ID}`)).toBeVisible();
    const pointer = await startDrag(page, true);
    await expectOverlayCenteredAtPointer(page, pointer);
    await moveAndDropAfterTarget(page, pointer);
  });
});
