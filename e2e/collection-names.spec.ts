import { expect, test } from "@playwright/test";
import { openSchemaV5Library } from "./schema-v5-fixture";

for (const view of [
  "Standard tab view",
  "Compact tab view",
  "Collection-group board view",
]) {
  test(`collection names can be renamed in place in ${view}`, async ({
    page,
  }) => {
    await openSchemaV5Library(page);
    await page.getByRole("button", { name: view, exact: true }).click();
    const before = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("tabvault-v3")!)
    );
    await page.getByRole("button", { name: "Research", exact: true }).click();
    const input = page.getByRole("textbox", {
      name: "Rename Research",
      exact: true,
    });
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("Research");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    if (view !== "Collection-group board view") {
      await expect(
        page.getByRole("button", { name: "Collapse Research", exact: true })
      ).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByTestId("tab-row-t-research")).toBeVisible();
    } else {
      await expect(page.getByTestId("group-board")).toBeVisible();
    }
    await input.fill("  Reading  ");
    await input.press("Enter");
    await expect(
      page.getByRole("button", { name: "Reading", exact: true })
    ).toBeVisible();
    const after = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("tabvault-v3")!)
    );
    const original = before.library.vaultGroups.find(
      (group: { id: string }) => group.id === "research"
    );
    const renamed = after.library.vaultGroups.find(
      (group: { id: string }) => group.id === "research"
    );
    expect(renamed.details).toEqual({ ...original.details, name: "Reading" });
    expect(renamed.placement).toEqual(original.placement);
    expect(after.library.tabs).toEqual(before.library.tabs);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Reading", exact: true })
    ).toBeVisible();
    if (view === "Collection-group board view") {
      await page
        .getByTestId("group-card-research")
        .getByRole("button", { name: "Browse →", exact: true })
        .click();
      await expect(page.getByTestId("tab-list")).toBeVisible();
    }
    const collapse = page.getByRole("button", {
      name: "Collapse Reading",
      exact: true,
    });
    await collapse.click();
    await expect(
      page.getByRole("button", { name: "Expand Reading", exact: true })
    ).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("tab-row-t-research")).toHaveCount(0);
    await page.getByRole("button", { name: "Reading", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Rename Reading", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Expand Reading", exact: true })
    ).toHaveAttribute("aria-expanded", "false");
  });
}

test("inline collection rename saves on blur and cancels Escape or empty names", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  const name = page.getByRole("button", { name: "Research", exact: true });
  const input = page.getByRole("textbox", {
    name: "Rename Research",
    exact: true,
  });
  await name.click();
  await input.fill("Discard this change");
  await input.press("Escape");
  await expect(name).toBeVisible();
  await name.click();
  await input.fill("   ");
  await input.press("Enter");
  await expect(name).toBeVisible();
  await name.click();
  await input.fill("Reading");
  await page.getByRole("heading", { name: "All tabs", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reading", exact: true })
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Reading", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "[Unassigned]", exact: true })
  ).toHaveCount(0);
});

test("hidden collection names can be renamed without expanding them", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await page.getByRole("button", { name: /^Hidden \d/ }).click();
  await page
    .getByRole("button", { name: "Collapse Research", exact: true })
    .click();
  await page.getByRole("button", { name: "Research", exact: true }).click();
  const input = page.getByRole("textbox", {
    name: "Rename Research",
    exact: true,
  });
  await input.fill("Later reading");
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "Expand Later reading", exact: true })
  ).toHaveAttribute("aria-expanded", "false");
  await page
    .getByRole("button", { name: "Expand Later reading", exact: true })
    .click();
  await expect(page.getByTestId("tab-row-t-hidden")).toBeVisible();
});
