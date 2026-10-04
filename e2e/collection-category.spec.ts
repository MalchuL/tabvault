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

for (const view of [
  "Standard tab view",
  "Compact tab view",
  "Collection-group board view",
]) {
  test(`${view}: category control toggles session/manual, retains category colors, and persists without changing tabs`, async ({
    page,
  }, testInfo) => {
    await openSchemaV5Library(page);
    await page.getByRole("button", { name: view, exact: true }).click();
    const before = await readVault(page);
    const toManual = page.getByRole("button", {
      name: "Change Session Aug 23 13:00 to Manual",
      exact: true,
    });
    const toSession = page.getByRole("button", {
      name: "Change Session Aug 23 13:00 to Session",
      exact: true,
    });
    const manual = page.getByRole("button", {
      name: "Change Research to Session",
      exact: true,
    });
    const sessionColor = await toManual.evaluate(
      element => getComputedStyle(element).color
    );
    const manualColor = await manual.evaluate(
      element => getComputedStyle(element).color
    );
    expect(sessionColor).not.toBe(manualColor);
    await expect(toManual).toHaveAttribute("aria-pressed", "false");
    await expect(toManual.locator("svg")).toHaveClass(/lucide-clock/);
    await toManual.hover();
    await expect(page.getByRole("tooltip")).toHaveText(
      "Session collection: tabs captured together. Click to change to Manual."
    );
    await toManual.click();
    await expect(toSession).toHaveAttribute("aria-pressed", "true");
    await expect(toSession.locator("svg")).toHaveClass(/lucide-hand/);
    await expect(toSession).toHaveCSS("color", manualColor);
    await manual.hover();
    await expect(page.getByRole("tooltip")).toHaveText(
      "Manual collection: curated for reuse. Click to change to Session."
    );
    const changed = await readVault(page);
    const group = changed.library.vaultGroups.find(
      group => group.id === "session"
    )!;
    const original = before.library.vaultGroups.find(
      group => group.id === "session"
    )!;
    expect(group.details).toEqual({ ...original.details, category: "manual" });
    expect(group.placement).toEqual(original.placement);
    expect(group.timestamps.createdAt).toBe(original.timestamps.createdAt);
    expect(Date.parse(group.timestamps.updatedAt)).toBeGreaterThan(
      Date.parse(original.timestamps.updatedAt)
    );
    expect(changed.library.tabs).toEqual(before.library.tabs);
    expect(
      changed.library.vaultGroups.filter(group => group.id !== "session")
    ).toEqual(
      before.library.vaultGroups.filter(group => group.id !== "session")
    );
    expect(
      Object.values(changed.sync.pending).find(
        change => change.kind === "group" && change.id === "session"
      )!.data
    ).toMatchObject({
      details: { category: "manual", color: original.details.accent },
    });
    await testInfo.attach(`manual-${view}.png`, {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    await page.reload();
    await expect(toSession).toHaveAttribute("aria-pressed", "true");
    await toSession.focus();
    await page.keyboard.press("Space");
    await expect(toManual).toHaveAttribute("aria-pressed", "false");
    await expect(toManual).toHaveCSS("color", sessionColor);
    const restored = await readVault(page);
    expect(
      restored.library.vaultGroups.find(group => group.id === "session")!
        .details
    ).toEqual(original.details);
    expect(restored.library.tabs).toEqual(before.library.tabs);
    // Virtual Unassigned and custom categories must not be silently reclassified.
    await expect(
      page.getByRole("button", {
        name: /Change \[Unassigned\] to (?:Manual|Session)/,
      })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: /Change Empty shelf to (?:Manual|Session)/,
      })
    ).toHaveCount(0);
    await expect(
      page.locator("span[title='Category: custom-category']")
    ).toBeVisible();
  });
}

test("category icons fit narrow screens in list and board views", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await openSchemaV5Library(page);
  for (const view of [
    "Standard tab view",
    "Compact tab view",
    "Collection-group board view",
  ]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Change Session Aug 23 13:00 to Manual",
        exact: true,
      })
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
  }
});

test("category changes update Quick Move destinations and works on hidden collections", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await expect(page.getByTestId("collection-drop-session")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Change Session Aug 23 13:00 to Manual",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("collection-drop-session")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Change Session Aug 23 13:00 to Session",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("collection-drop-session")).toHaveCount(0);
  await page.getByRole("button", { name: /^Hidden \d/ }).click();
  const before = await readVault(page);
  await page
    .getByRole("button", { name: "Change Research to Session", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Change Research to Manual", exact: true })
  ).toBeVisible();
  expect((await readVault(page)).library.tabs).toEqual(before.library.tabs);
  await page
    .getByRole("button", { name: "Change Research to Manual", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Change Research to Session",
      exact: true,
    })
  ).toBeVisible();
});

test("category changes synchronize to the authenticated API and survive reload", async ({
  page,
  server,
}) => {
  await seedServer(server);
  await openTransfer(page, emptyVault(), server);
  await page.getByRole("button", { name: /^All Tabs/ }).click();
  const before = await serverDocument(server);
  await page
    .getByRole("button", {
      name: "Change Session Aug 23 13:00 to Manual",
      exact: true,
    })
    .click();
  await expect
    .poll(
      async () =>
        (await serverDocument(server)).library.groups.find(
          group => group.id === "session"
        )!.details.category
    )
    .toBe("manual");
  await expect
    .poll(async () => (await readVault(page)).sync.pending)
    .toEqual({});
  const after = await serverDocument(server);
  expect(after.library.tabs).toEqual(before.library.tabs);
  const original = before.library.groups.find(group => group.id === "session")!;
  expect(
    after.library.groups.find(group => group.id === "session")!.details
  ).toEqual({ ...original.details, category: "manual" });
  await page.reload();
  await page
    .getByRole("button", {
      name: "Change Session Aug 23 13:00 to Session",
      exact: true,
    })
    .click();
  await expect
    .poll(
      async () =>
        (await serverDocument(server)).library.groups.find(
          group => group.id === "session"
        )!.details.category
    )
    .toBe("session");
});
