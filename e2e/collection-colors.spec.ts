import { expect, test } from "@playwright/test";
import { openSchemaV5Library } from "./schema-v5-fixture";

test("collection colors are repaired explicitly and persist across library views", async ({
  page,
}) => {
  await openSchemaV5Library(page);
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

test("opening a collection creates a named Chrome group and tracks successful tabs", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await page
    .getByRole("button", { name: "Open all tabs in Research", exact: true })
    .click();
  await expect(
    page.getByText("Color is incorrect", { exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Regenerate color", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose color for Research", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Set color to cyan", exact: true })
    .click();
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
            (tab: { annotations: { customProperties: { viewed: boolean } } }) =>
              tab.annotations.customProperties.viewed
          );
      })
    )
    .toBe(true);
});
