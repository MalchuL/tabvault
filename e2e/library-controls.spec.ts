import { expect, test, type Page } from "@playwright/test";
import { openSchemaV2Library } from "./schema-v2-fixture";

async function saved(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("tabvault-v3")!));
}

for (const backend of [false, true]) {
  test(`Archive selection permanently deletes (${backend ? "server" : "local"})`, async ({
    page,
  }) => {
    await openSchemaV2Library(page);
    const deletes: string[] = [];
    if (backend) {
      await page.route("http://127.0.0.1:47821/api/v1/**", async route => {
        const request = route.request();
        if (request.method() === "DELETE") {
          expect(request.headers()["x-api-key"]).toBe("admin");
          deletes.push(request.url());
        }
        await route.fulfill({
          json: request.url().endsWith("/health")
            ? { status: "ok", schemaVersion: 3 }
            : { success: true, data: {} },
        });
      });
      await page.evaluate(() =>
        localStorage.setItem("tabvault-storage-mode", "backend")
      );
    }
    const online = backend
      ? page.waitForRequest("**/api/v1/index/status")
      : Promise.resolve();
    await page.goto("/archive");
    await online;
    await expect(page.getByTestId("tab-row-t-archived")).toBeVisible();
    await page
      .getByRole("button", { name: "Select tabs", exact: true })
      .click();
    await page.getByRole("button", { name: "Select all", exact: true }).click();
    const remove = page.getByRole("button", {
      name: "Permanently delete selected tabs",
    });
    await expect(remove).toHaveText("");
    await remove.click();
    await expect(page.getByTestId("tab-row-t-archived")).toHaveCount(0);
    await expect
      .poll(async () =>
        (await saved(page)).tabs.some(
          (tab: { id: string }) => tab.id === "t-archived"
        )
      )
      .toBe(false);
    expect((await saved(page)).tombstones.tabs).toContain("t-archived");
    if (backend)
      await expect
        .poll(() => deletes)
        .toEqual(["http://127.0.0.1:47821/api/v1/tabs/t-archived?hard=true"]);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Archive", exact: true })
    ).toBeVisible();
    await expect(page.getByTestId("tab-row-t-archived")).toHaveCount(0);
  });
}

test("preview disables dragging and view buttons describe each mode", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  for (const name of [
    "Standard tab view",
    "Compact tab view",
    "Instant-preview tab view",
    "Collection-group board view",
  ]) {
    await page.getByRole("button", { name, exact: true }).hover();
    await expect(page.getByRole("tooltip", { name, exact: true })).toHaveText(
      name
    );
  }
  await page.getByRole("button", { name: "Instant-preview tab view" }).click();
  await expect(page.getByRole("button", { name: /^Reorder/ })).toHaveCount(0);
  await expect(page.getByTestId("collection-drop-research")).toHaveCount(0);
  await expect(page.getByTestId("tab-group-session")).toHaveAttribute(
    "data-drop-gap-height",
    "0"
  );
});

test("collapsed groups stay still when dragging starts and cancels", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  await page
    .getByTestId("group-separator-session")
    .getByRole("button", { name: "Session Aug 23 13:00", exact: true })
    .click();
  const group = page.getByTestId("tab-group-session");
  const before = await group.boundingBox();
  const handle = await page
    .getByTestId("tab-row-t-1001")
    .getByRole("button", { name: /^Reorder/ })
    .boundingBox();
  await page.mouse.move(handle!.x + 5, handle!.y + 5);
  await page.mouse.down();
  await page.mouse.move(handle!.x + 20, handle!.y + 20, { steps: 4 });
  await expect(page.getByTestId("tab-drag-preview")).toBeVisible();
  expect(await group.boundingBox()).toEqual(before);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByTestId("tab-drag-preview")).toHaveCount(0);
  expect(await group.boundingBox()).toEqual(before);
});

test("create collection immediately saves an empty manual session", async ({
  page,
}) => {
  await openSchemaV2Library(page);
  await page
    .getByRole("button", { name: "Collection-group board view" })
    .click();
  await page.getByTestId("create-collection-card").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(async () => (await saved(page)).vaultGroups.length).toBe(4);
  const group = (await saved(page)).vaultGroups[0];
  expect(group.name).toMatch(/^Session [A-Z][a-z]{2} \d{2} \d{2}:\d{2}$/);
  expect(group.description).toBe("");
  expect(group.category).toBe("manual");
  await expect(page.getByTestId(`group-card-${group.id}`)).toBeVisible();
});

test("favicon drag inserts at the pointed position when the collection wraps", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 850 });
  await openSchemaV2Library(page);
  await page.evaluate(() => {
    const vault = JSON.parse(localStorage.getItem("tabvault-v3")!);
    const template = vault.tabs.find(
      (tab: { id: string }) => tab.id === "t-duplicate"
    );
    for (let i = 0; i < 5; i++) {
      const id = `extra-${i}`;
      vault.tabs.push({ ...template, id, title: `Extra ${i}` });
      vault.tabOrders.session.push(id);
    }
    vault.tabView = "groups";
    localStorage.setItem("tabvault-v3", JSON.stringify(vault));
  });
  await page.reload();
  const source = await page.getByTestId("grouped-tab-t-research").boundingBox();
  const target = await page
    .getByTestId("grouped-tab-advanced-new")
    .boundingBox();
  await page.mouse.move(source!.x + 18, source!.y + 18);
  await page.mouse.down();
  await page.mouse.move(source!.x + 28, source!.y + 18, { steps: 3 });
  await expect(page.getByTestId("tab-drag-preview")).toBeVisible();
  await page.mouse.move(target!.x + 4, target!.y + 18, { steps: 15 });
  await expect(
    page.getByTestId("group-card-session").getByTestId("grouped-tab-t-research")
  ).toHaveCount(1);
  await page.mouse.up();
  await expect
    .poll(async () => (await saved(page)).tabOrders.session)
    .toEqual([
      "t-duplicate",
      "t-research",
      "advanced-new",
      "extra-0",
      "extra-1",
      "extra-2",
      "extra-3",
      "extra-4",
    ]);
  await expect(page.getByTestId("group-board")).toBeVisible();
});
