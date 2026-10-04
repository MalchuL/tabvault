import { expect, test, type Page } from "@playwright/test";
import { openSchemaV5Library } from "./schema-v5-fixture";

async function saved(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("tabvault-v3")!));
}

test("search works without saved views and old saved searches are discarded on the next write", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  // Commit once so normal tag/catalog and display normalization precedes the comparison.
  const compact = page.getByRole("button", {
    name: "Compact tab view",
    exact: true,
  });
  await compact.click();
  await expect(compact).toHaveAttribute("aria-pressed", "true");
  const before = await saved(page);
  await page.evaluate(() => {
    const vault = JSON.parse(localStorage.getItem("tabvault-v3")!);
    vault.library.savedSearches = [
      {
        id: "old",
        name: "Protocol research",
        query: "Protocol",
        groupId: "research",
      },
    ];
    localStorage.setItem("tabvault-v3", JSON.stringify(vault));
  });
  await page.reload();
  const query = page.getByLabel("Search your TabVault library");
  await query.fill("Protocol");
  await page.getByLabel("Filter search by collection").selectOption("research");
  await expect(page.getByTestId("tab-row-t-research")).toBeVisible();
  await expect(page.getByTestId("tab-row-t-1001")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Views/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save view", exact: true })
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /saved search/ })).toHaveCount(
    0
  );
  await page
    .getByRole("button", { name: "Standard tab view", exact: true })
    .click();
  await expect
    .poll(async () => "savedSearches" in (await saved(page)).library)
    .toBe(false);
  const after = await saved(page);
  expect(after.library).toEqual(before.library);
  expect(after.propertySchema).toEqual(before.propertySchema);
  await page.reload();
  await query.fill("Protocol");
  await expect(page.getByTestId("tab-row-t-research")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Views/ })).toHaveCount(0);
});

for (const view of ["Standard", "Compact"]) {
  test(`tab actions move, edit, hide, restore, and archive in ${view} view`, async ({
    page,
  }) => {
    await openSchemaV5Library(page);
    await page
      .getByRole("button", { name: `${view} tab view`, exact: true })
      .click();
    const row = page.getByTestId("tab-row-t-1001");
    const title = "Agents can organize the web better than we can";
    await row.hover();
    const move = row.getByRole("button", {
      name: `Move ${title}`,
      exact: true,
    });
    await expect(move).toHaveText("");
    await expect(move).toHaveAttribute("title", "Move to…");
    await move.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem")).toHaveCount(1);
    await expect(page.getByTestId("tab-drag-preview")).toHaveCount(0);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect
      .poll(
        async () =>
          (await saved(page)).library.tabs.find(
            (tab: { id: string }) => tab.id === "t-1001"
          ).placement.groupId
      )
      .toBe("research");
    await row.hover();
    await move.click();
    await expect(
      page.getByRole("menuitem", { name: "Research", exact: true })
    ).toBeDisabled();
    await page.keyboard.press("Escape");
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

test("collapsed groups stay still when dragging starts and cancels", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await page
    .getByTestId("group-separator-session")
    .getByRole("button", { name: "Collapse Session Aug 23 13:00", exact: true })
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
  await openSchemaV5Library(page);
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
  expect(group.details).not.toHaveProperty("accent");
  await expect(page.getByTestId(`group-card-${group.id}`)).toBeVisible();
});

test("favicon drag inserts at the pointed position when the collection wraps", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 850 });
  await openSchemaV5Library(page);
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
      vault.library.tabs.at(-1).placement = {
        groupId: "session",
        position: i + 2,
      };
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
    .poll(async () =>
      (await saved(page)).library.tabs
        .filter(t => t.placement.groupId === "session")
        .sort((a, b) => a.placement.position - b.placement.position)
        .map(t => t.id)
    )
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
