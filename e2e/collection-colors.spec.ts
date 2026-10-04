import { expect, test } from "@playwright/test";
import { openSchemaV5Library } from "./schema-v5-fixture";

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

for (const color of ["cyan", "#007c84"]) {
  test(`opening a collection with ${color} creates a named Chrome group and tracks successful tabs`, async ({
    page,
  }) => {
    await openSchemaV5Library(page);
    await page
      .getByRole("button", { name: "Choose color for Research", exact: true })
      .click();
    if (color === "cyan") {
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
        { id: 19, options: { title: "Research", color: "cyan" } },
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
