import { expect, test, type Page } from "@playwright/test";
import { openSchemaV4Library } from "./schema-v4-fixture";

async function saved(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("tabvault-v3")!));
}

test("saved views retain their query and collection and can be deleted", async ({
  page,
}) => {
  await openSchemaV4Library(page);
  const query = page.getByLabel("Search your TabVault library");
  const filter = page.getByLabel("Filter search by collection");
  const views = page.getByRole("button", { name: /^Views/ });
  await query.fill("Protocol");
  await filter.selectOption("research");
  await views.click();
  await page
    .getByPlaceholder("Protocol", { exact: true })
    .fill("Protocol research");
  await page.getByRole("button", { name: "Save view", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save view", exact: true })
  ).toHaveCount(0);
  await expect
    .poll(async () => (await saved(page)).library.savedSearches)
    .toEqual([
      {
        id: expect.any(String),
        name: "Protocol research",
        query: "Protocol",
        groupId: "research",
      },
    ]);

  await page.reload();
  await query.fill("Agents");
  await filter.selectOption("all");
  await views.click();
  await page
    .getByRole("button", { name: "Protocol research Research", exact: true })
    .click();
  await expect(query).toHaveValue("Protocol");
  await expect(filter).toHaveValue("research");
  await expect(page.getByTestId("tab-row-t-research")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save view", exact: true })
  ).toHaveCount(0);

  await views.click();
  await page
    .getByRole("button", { name: "Delete Protocol research saved search" })
    .click();
  await expect
    .poll(async () => (await saved(page)).library.savedSearches)
    .toEqual([]);
  await page.reload();
  await query.fill("Protocol");
  await views.click();
  await expect(
    page.getByRole("button", { name: "Delete Protocol research saved search" })
  ).toHaveCount(0);
});

for (const view of ["Standard", "Compact", "Instant-preview"]) {
  test(`tab actions move, edit, hide, restore, and archive in ${view} view`, async ({
    page,
  }) => {
    await openSchemaV4Library(page);
    await page
      .getByRole("button", { name: `${view} tab view`, exact: true })
      .click();
    const row = page.getByTestId("tab-row-t-1001");
    const title = "Agents can organize the web better than we can";
    await row.hover();
    await row
      .getByLabel(`Move ${title}`, { exact: true })
      .selectOption("research");
    await expect
      .poll(
        async () =>
          (await saved(page)).library.tabs.find(
            (tab: { id: string }) => tab.id === "t-1001"
          ).placement.groupId
      )
      .toBe("research");
    await row.hover();
    await row
      .getByRole("button", { name: `Edit ${title}`, exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Edit tab" })
      .getByLabel("Title", { exact: true })
      .fill("Edited tab");
    await page.getByRole("button", { name: "Save tab", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await saved(page)).library.tabs.find(
            (tab: { id: string }) => tab.id === "t-1001"
          ).content.title
      )
      .toBe("Edited tab");
    await row.hover();
    await row
      .getByRole("button", { name: "Hide Edited tab", exact: true })
      .click();
    await page.getByRole("button", { name: "10 min", exact: true }).click();
    await expect(row).toHaveCount(0);
    await page.getByRole("button", { name: /^Hidden \d/ }).click();
    await row.hover();
    await row
      .getByRole("button", { name: "Unhide Edited tab", exact: true })
      .click();
    await expect(row).toHaveCount(0);
    await page.getByRole("button", { name: /^All Tabs/ }).click();
    await row.hover();
    await row
      .getByRole("button", { name: "Archive Edited tab", exact: true })
      .click();
    await expect(row).toHaveCount(0);
    await page.getByRole("button", { name: /^Archive \d/ }).click();
    await row.hover();
    await row.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(row).toHaveCount(0);
    await page.getByRole("button", { name: /^All Tabs/ }).click();
    await expect(row).toBeVisible();
  });
}

for (const backend of [false, true]) {
  test(`Archive selection permanently deletes (${backend ? "server" : "local"})`, async ({
    page,
  }) => {
    await openSchemaV4Library(page);
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
            ? { status: "ok", schemaVersion: 4 }
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
        (await saved(page)).library.tabs.some(
          (tab: { id: string }) => tab.id === "t-archived"
        )
      )
      .toBe(false);
    expect((await saved(page)).library.tombstones.tabs).toContain("t-archived");
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
  await openSchemaV4Library(page);
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
  await openSchemaV4Library(page);
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
  await openSchemaV4Library(page);
  await page
    .getByRole("button", { name: "Collection-group board view" })
    .click();
  await page.getByTestId("create-collection-card").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(async () => (await saved(page)).library.vaultGroups.length)
    .toBe(4);
  const group = (await saved(page)).library.vaultGroups[0];
  expect(group.details.name).toMatch(
    /^Session [A-Z][a-z]{2} \d{2} \d{2}:\d{2}$/
  );
  expect(group.details.description).toBe("");
  expect(group.details.category).toBe("manual");
  await expect(page.getByTestId(`group-card-${group.id}`)).toBeVisible();
});

test("favicon drag inserts at the pointed position when the collection wraps", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 850 });
  await openSchemaV4Library(page);
  await page.evaluate(() => {
    const vault = JSON.parse(localStorage.getItem("tabvault-v3")!);
    const template = vault.library.tabs.find(
      (tab: { id: string }) => tab.id === "t-duplicate"
    );
    for (let i = 0; i < 5; i++) {
      const id = `extra-${i}`;
      vault.library.tabs.push({
        ...template,
        id,
        content: { ...template.content, title: `Extra ${i}` },
      });
      vault.library.tabOrders.session.push(id);
    }
    vault.preferences.tabView = "groups";
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
    .poll(async () => (await saved(page)).library.tabOrders.session)
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
