import { expect, test, type Page } from "@playwright/test";

const TAB_TITLE = "Agents can organize the web better than we can";

async function openFreshLibrary(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("tab-row-t-1001")).toBeVisible();
}

test("tracks viewed state directly and when a saved link opens", async ({
  page,
  context,
}) => {
  await openFreshLibrary(page);
  const viewed = page.getByRole("checkbox", {
    name: `Mark ${TAB_TITLE} as viewed`,
  });
  await expect(viewed).not.toBeChecked();
  await viewed.check();
  await expect(viewed).toBeChecked();
  await viewed.uncheck();

  const popup = context.waitForEvent("page");
  await page
    .getByTestId("tab-row-t-1001")
    .getByRole("link", { name: TAB_TITLE })
    .click();
  const opened = await popup;
  await opened.close();
  await expect(viewed).toBeChecked();
});

test("edits agent review and collection description", async ({ page }) => {
  await openFreshLibrary(page);
  await page.getByLabel(`Edit ${TAB_TITLE}`).click({ force: true });
  await page.getByLabel("Agent review").fill("Concise agent summary");
  await page.getByLabel("Mark as viewed").check();
  await page.getByRole("button", { name: "Save tab" }).click();

  await page.getByLabel(`Edit ${TAB_TITLE}`).click({ force: true });
  await expect(page.getByLabel("Agent review")).toHaveValue(
    "Concise agent summary"
  );
  await expect(page.getByLabel("Mark as viewed")).toBeChecked();
  await page.getByLabel("Close dialog").click();

  const inboxActions = page.getByLabel("Inbox collection actions");
  await expect(inboxActions.locator("button").nth(1)).toHaveAttribute(
    "aria-label",
    "Copy Inbox as Markdown"
  );
  await expect(inboxActions.locator("button").nth(2)).toHaveAttribute(
    "aria-label",
    "Edit Inbox"
  );
  await page.getByLabel("Edit Inbox").click();
  await page.getByLabel("Description").fill("Default landing place for agents");
  await page.getByRole("button", { name: "Save collection" }).click();
  await page.getByLabel("Edit Inbox").click();
  await expect(page.getByLabel("Description")).toHaveValue(
    "Default landing place for agents"
  );
});
