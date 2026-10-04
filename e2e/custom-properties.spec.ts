import { expect } from "@playwright/test";
import { openSchemaV5Library, schemaV5Vault } from "./schema-v5-fixture";
import {
  test,
  emptyVault,
  openTransfer,
  readVault,
  seedServer,
  serverDocument,
  expectedDocument,
} from "./transfer-fixture";

for (const backend of [false, true]) {
  test(`keyed property removal affects one tab or every tab (${backend ? "server" : "local"})`, async ({
    page,
    server,
  }) => {
    const vault = structuredClone(schemaV5Vault);
    Object.assign(vault.propertySchema, {
      payload: {
        type: "json",
        description: "Optional payload",
        default: { fallback: true },
      },
    });
    for (const tab of vault.library.tabs)
      Object.assign(tab.annotations.customProperties, {
        payload: null,
        orphan: false,
      });
    if (backend) {
      await seedServer(server, expectedDocument(vault));
      await openTransfer(page, emptyVault(), server);
      await page.goto("/");
    } else {
      await openSchemaV5Library(page);
      await page.evaluate(
        vault => localStorage.setItem("tabvault-v3", JSON.stringify(vault)),
        vault
      );
      await page.reload();
    }
    await page
      .getByTestId("tab-row-t-1001")
      .getByRole("button", { name: /^Edit / })
      .click();
    await page
      .getByRole("button", { name: "Use default for payload", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Remove orphan from this tab", exact: true })
      .click();
    await page.getByRole("button", { name: "Save tab", exact: true }).click();
    const saved = await readVault(page);
    expect(
      saved.library.tabs.find(tab => tab.id === "t-1001")!.annotations
        .customProperties
    ).not.toHaveProperty("payload");
    expect(
      saved.library.tabs.find(tab => tab.id === "t-1001")!.annotations
        .customProperties
    ).not.toHaveProperty("orphan");
    expect(
      saved.library.tabs.find(tab => tab.id === "t-duplicate")!.annotations
        .customProperties
    ).toHaveProperty("payload", null);
    await page
      .getByRole("button", { name: "Custom Properties", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Remove payload everywhere", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Remove orphan everywhere", exact: true })
      .click();
    await expect
      .poll(async () => {
        const current = await readVault(page);
        return (
          !Object.hasOwn(current.propertySchema, "payload") &&
          current.library.tabs.every(
            tab =>
              !Object.hasOwn(tab.annotations.customProperties, "payload") &&
              !Object.hasOwn(tab.annotations.customProperties, "orphan")
          )
        );
      })
      .toBe(true);
    if (backend) {
      await expect
        .poll(async () => {
          const current = await serverDocument(server);
          return (
            !Object.hasOwn(current.propertySchema, "payload") &&
            current.library.tabs.every(
              tab =>
                !Object.hasOwn(tab.annotations.customProperties, "payload") &&
                !Object.hasOwn(tab.annotations.customProperties, "orphan")
            )
          );
        })
        .toBe(true);
    }
    await page.reload();
    expect((await readVault(page)).library.tabs).toHaveLength(
      vault.library.tabs.length
    );
    expect((await readVault(page)).propertySchema).toHaveProperty("note");
    await expect(
      page.getByRole("button", {
        name: "Remove payload everywhere",
        exact: true,
      })
    ).toHaveCount(0);
  });
}
test("custom values are editable inside Edit tab with defaults, validation, and raw-value retention", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await page
    .getByRole("button", { name: "Custom Properties", exact: true })
    .click();
  await page.getByLabel("Property name").fill("priority");
  await page.getByLabel("Property type").selectOption("int");
  await page.getByLabel("Default value").fill("3");
  await page.getByRole("button", { name: "Save property" }).click();
  await expect(
    page.getByRole("heading", { name: "priority", exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: /^All Tabs/ }).click();
  const row = page.getByTestId("tab-row-t-1001");
  await row.getByRole("button", { name: /^Edit / }).click();
  await expect(page.getByLabel("priority", { exact: true })).toHaveValue("3");
  await page.getByLabel("priority", { exact: true }).fill("1.5");
  await page.getByRole("button", { name: "Save tab", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("valid int");
  await page.getByLabel("priority", { exact: true }).fill("7");
  await page.getByLabel("note", { exact: true }).fill("Edited note");
  await page.getByLabel("agentReview", { exact: true }).fill("Agent summary");
  await page.getByLabel("Tags", { exact: true }).fill("docs, custom");
  await page.getByRole("button", { name: "Save tab", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await row.getByRole("button", { name: /^Edit / }).click();
  await expect(page.getByLabel("priority", { exact: true })).toHaveValue("7");
  await expect(page.getByLabel("agentReview", { exact: true })).toHaveValue(
    "Agent summary"
  );
  await page.getByRole("button", { name: "Use default for priority" }).click();
  await page.getByRole("button", { name: "Save tab", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("tabvault-v3")!).library.tabs.find(
            (t: { id: string }) => t.id === "t-1001"
          ).annotations.customProperties.priority
      )
    )
    .toBeUndefined();
});
test("definitions are generic, persist locally, and retain undeclared values after deletion", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await page
    .getByRole("button", { name: "Custom Properties", exact: true })
    .click();
  const note = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("heading", { name: "note", exact: true }) });
  await note.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "note", exact: true })
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "note", exact: true })
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^All Tabs/ }).click();
  await page
    .getByTestId("tab-row-t-1001")
    .getByRole("button", { name: /^Edit / })
    .click();
  await expect(page.getByText("Undeclared · retained")).toBeVisible();
  await page.getByRole("button", { name: "Save tab", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("tabvault-v3")!).library.tabs.find(
            (t: { id: string }) => t.id === "t-1001"
          ).annotations.customProperties.note
      )
    )
    .toBe("A useful framing for the agent-facing contract.");
});
