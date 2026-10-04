import { expect } from "@playwright/test";
import {
  emptyVault,
  openTransfer,
  readVault,
  seedServer,
  serverDocument,
  test,
} from "./transfer-fixture";
import { openSchemaV5Library } from "./schema-v5-fixture";

test("no color clears tints and repairs an incorrect color across list, board, and editor", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await page.evaluate(() => {
    const vault = JSON.parse(localStorage.getItem("tabvault-v3")!);
    vault.library.vaultGroups.find(
      (group: { id: string }) => group.id === "research"
    ).details.accent = "incorrect";
    localStorage.setItem("tabvault-v3", JSON.stringify(vault));
  });
  await page.reload();
  const picker = page.getByRole("button", {
    name: "Choose color for Research",
    exact: true,
  });
  await expect(picker.locator("svg")).toHaveClass(/lucide-palette/);
  await expect(page.getByTestId("group-separator-research")).toHaveCSS(
    "background-color",
    "rgb(249, 247, 241)"
  );
  await expect(page.getByTestId("tab-group-research")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)"
  );
  await picker.click();
  await expect(page.getByRole("alert")).toHaveText("Color is incorrect.");
  await page.getByRole("button", { name: "No color", exact: true }).click();
  await expect(picker).toHaveAttribute("title", "No color");
  await picker.click();
  await expect(
    page.getByRole("button", { name: "No color", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Custom color", { exact: true })).toHaveValue(
    "#80868b"
  );
  await page
    .getByRole("button", { name: "Set color to blue", exact: true })
    .click();
  await page.getByLabel("Collection-group board view").click();
  await page.getByLabel("Edit Research", { exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Edit collection",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Choose color for Research", exact: true })
    .click();
  await page.getByRole("button", { name: "No color", exact: true }).click();
  await page.getByRole("button", { name: "Save collection" }).click();
  await page.reload();
  const card = page.getByTestId("group-card-research");
  await expect(card).toHaveCSS("background-color", "rgb(255, 253, 248)");
  await expect(card.locator("header")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)"
  );
  expect(
    (await readVault(page)).library.vaultGroups.find(
      group => group.id === "research"
    )!.details.accent
  ).toBeUndefined();
});

test("no color persists through authenticated sync and is the default for new collections", async ({
  page,
  server,
}) => {
  await seedServer(server);
  await openTransfer(page, emptyVault(), server);
  await page.goto("/");
  const picker = page.getByRole("button", {
    name: "Choose color for Research",
    exact: true,
  });
  await picker.click();
  await page.getByRole("button", { name: "No color", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await serverDocument(server)).library.groups.find(
          group => group.id === "research"
        )!.details.color
    )
    .toBeNull();
  await page.reload();
  await expect(picker).toHaveAttribute("title", "No color");
  await page
    .getByRole("button", { name: "New collection", exact: true })
    .click();
  await expect
    .poll(async () => (await serverDocument(server)).library.groups.length)
    .toBe(4);
  const created = (await serverDocument(server)).library.groups.find(
    group => !["session", "research", "empty"].includes(group.id)
  )!;
  expect(created.details.color).toBeNull();
  await expect(
    page.getByRole("button", {
      name: `Choose color for ${created.details.name}`,
      exact: true,
    })
  ).toHaveAttribute("title", "No color");
});

test("collection backgrounds use a stronger header tint in list and board views", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  const picker = page.getByRole("button", {
    name: "Choose color for Research",
    exact: true,
  });
  await picker.click();
  await page.getByLabel("Custom color", { exact: true }).fill("#1a74e9");
  await page.keyboard.press("Escape");
  for (const view of ["Standard tab view", "Compact tab view"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await expect(page.getByTestId("group-separator-research")).toHaveCSS(
      "background-color",
      "color(srgb 0.838353 0.895451 0.961961)"
    );
    await expect(page.getByTestId("tab-group-research")).toHaveCSS(
      "background-color",
      "color(srgb 0.928157 0.949176 0.967843)"
    );
    await expect(page.getByTestId("tab-row-t-research")).toHaveCSS(
      "opacity",
      "1"
    );
  }
  await page.getByLabel("Collection-group board view").click();
  const card = page.getByTestId("group-card-research");
  await expect(card.locator("header")).toHaveCSS(
    "background-color",
    "color(srgb 0.838353 0.895451 0.961961)"
  );
  await expect(card).toHaveCSS(
    "background-color",
    "color(srgb 0.928157 0.949176 0.967843)"
  );
  await picker.click();
  await page
    .getByRole("button", { name: "Set color to red", exact: true })
    .click();
  await expect(card.locator("header")).toHaveCSS(
    "background-color",
    "color(srgb 0.973176 0.847451 0.823608)"
  );
  await expect(card).toHaveCSS(
    "background-color",
    "color(srgb 0.988078 0.927843 0.906353)"
  );
  await page.reload();
  await expect(card).toHaveCSS(
    "background-color",
    "color(srgb 0.988078 0.927843 0.906353)"
  );
});

test("collection colors are repaired explicitly and persist across library views", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await page.evaluate(() => {
    const vault = JSON.parse(localStorage.getItem("tabvault-v3")!);
    vault.library.vaultGroups.find(
      (g: { id: string }) => g.id === "research"
    ).details.accent = "incorrect";
    localStorage.setItem("tabvault-v3", JSON.stringify(vault));
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Choose color for Research", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText("Color is incorrect.");
  await page.getByRole("button", { name: "Regenerate color" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Set color to blue", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Choose color for Research", exact: true })
  ).toHaveAttribute("title", "Color: blue");
  await page.getByLabel("Edit Research", { exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Edit collection",
    exact: true,
  });
  await dialog.getByLabel("Name", { exact: true }).fill("Reading");
  await dialog
    .getByRole("button", { name: "Choose color for Reading", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Set color to purple", exact: true })
    .click();
  await page.getByRole("button", { name: "Save collection" }).click();
  await page.getByLabel("Collection-group board view").click();
  await expect(
    page.getByRole("button", { name: "Choose color for Reading", exact: true })
  ).toHaveAttribute("title", "Color: purple");
  const vault = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tabvault-v3")!)
  );
  expect(
    vault.library.vaultGroups.find((g: { id: string }) => g.id === "research")
      .details.accent
  ).toBe("purple");
  expect(vault.propertySchema.color).toBeUndefined();
});

test("custom color swatches persist in list, board, and collection editor", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  const trigger = page.getByRole("button", {
    name: "Choose color for Research",
    exact: true,
  });
  await expect(trigger.locator("span")).toHaveCSS(
    "background-color",
    "rgb(130, 155, 101)"
  );
  await trigger.click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Group colors" }).getByRole("button")
  ).toHaveCount(9);
  await page.getByLabel("Custom color", { exact: true }).fill("#1a74e9");
  await page.keyboard.press("Escape");
  await expect(trigger.locator("span")).toHaveCSS(
    "background-color",
    "rgb(26, 116, 233)"
  );
  await page.reload();
  await expect(trigger).toHaveAttribute("title", "Color: #1a74e9");
  await page.getByLabel("Collection-group board view").click();
  await expect(trigger.locator("span")).toHaveCSS(
    "background-color",
    "rgb(26, 116, 233)"
  );
  await trigger.click();
  await page
    .getByRole("button", { name: "Set color to red", exact: true })
    .click();
  await expect(trigger.locator("span")).toHaveCSS(
    "background-color",
    "rgb(217, 48, 37)"
  );
  await page.getByLabel("Edit Research", { exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Edit collection",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Choose color for Research", exact: true })
    .click();
  await page.getByLabel("Custom color", { exact: true }).fill("#123abc");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Save collection" }).click();
  await page.reload();
  await expect(trigger).toHaveAttribute("title", "Color: #123abc");
  await expect(trigger.locator("span")).toHaveCSS(
    "background-color",
    "rgb(18, 58, 188)"
  );
});

for (const color of ["none", "cyan", "#007c84"]) {
  test(`opening a collection with ${color} creates a named Chrome group and tracks successful tabs`, async ({
    page,
  }) => {
    await openSchemaV5Library(page);
    await page
      .getByRole("button", { name: "Choose color for Research", exact: true })
      .click();
    if (color === "none") {
      await page.getByRole("button", { name: "No color", exact: true }).click();
    } else if (color === "cyan") {
      await page
        .getByRole("button", { name: "Set color to cyan", exact: true })
        .click();
    } else {
      await page.getByLabel("Custom color", { exact: true }).fill(color);
      await page.keyboard.press("Escape");
    }
    await page.evaluate(() => {
      const target = window as unknown as {
        chrome: unknown;
        groupCalls: unknown[];
        openedUrls: string[];
      };
      target.groupCalls = [];
      target.openedUrls = [];
      Object.defineProperty(target, "chrome", {
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
              get: async (key: string) => ({
                [key]: JSON.parse(localStorage.getItem(key) ?? "null"),
              }),
              set: async (values: Record<string, unknown>) => {
                for (const [key, value] of Object.entries(values))
                  localStorage.setItem(key, JSON.stringify(value));
              },
            },
          },
          tabs: {
            create: async ({ url }: { url: string }) => {
              target.openedUrls.push(url);
              return { id: target.openedUrls.length };
            },
            group: async (options: unknown) => {
              target.groupCalls.push(options);
              return 19;
            },
          },
          tabGroups: {
            update: async (id: number, options: unknown) => {
              target.groupCalls.push({ id, options });
            },
          },
        },
      });
    });
    await page
      .getByRole("button", { name: "Open all tabs in Research", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { groupCalls: unknown[] }).groupCalls
        )
      )
      .toEqual([
        { tabIds: [1] },
        {
          id: 19,
          options: {
            title: "Research",
            color: color === "none" ? "grey" : "cyan",
          },
        },
      ]);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const vault = JSON.parse(localStorage.getItem("tabvault-v3")!);
          return vault.library.tabs
            .filter(
              (tab: {
                placement: { groupId: string };
                lifecycle: { archived: boolean; hiddenUntil: string | null };
              }) =>
                tab.placement.groupId === "research" &&
                !tab.lifecycle.archived &&
                (!tab.lifecycle.hiddenUntil ||
                  Date.parse(tab.lifecycle.hiddenUntil) <= Date.now())
            )
            .every(
              (tab: {
                annotations: { customProperties: { viewed: boolean } };
              }) => tab.annotations.customProperties.viewed
            );
        })
      )
      .toBe(true);
  });
}
