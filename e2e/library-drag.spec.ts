import { expect, test, type Locator, type Page } from "@playwright/test";
import { openSchemaV5Library } from "./schema-v5-fixture";

async function savedLibrary(page: Page) {
  return page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem("tabvault-v3")!).library;
    const tabOrders: Record<string, string[]> = { unassigned: [] };
    for (const g of library.vaultGroups) tabOrders[g.id] = [];
    for (const t of [...library.tabs]
      .filter(t => !t.lifecycle.archived)
      .sort((a, b) => a.placement.position - b.placement.position))
      (tabOrders[t.placement.groupId ?? "unassigned"] ??= []).push(t.id);
    return { ...library, tabOrders };
  });
}

async function startDrag(page: Page, handle: Locator) {
  await expect(page.getByTestId("tab-drag-preview")).toHaveCount(0);
  await handle.scrollIntoViewIfNeeded();
  const rect = (await handle.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width / 2 + 12,
    rect.y + rect.height / 2,
    {
      steps: 3,
    }
  );
  await expect(page.getByTestId("tab-drag-preview")).toBeVisible();
}

async function hoverTarget(page: Page, target: Locator, fraction = 0.5) {
  await target.scrollIntoViewIfNeeded();
  const rect = (await target.boundingBox())!;
  await page.mouse.move(
    rect.x + rect.width / 2,
    rect.y + rect.height * fraction,
    {
      steps: 15,
    }
  );
}

for (const backend of [false, true]) {
  test(`list transfer preserves hidden tabs and saves both orders (${backend ? "server" : "local"})`, async ({
    page,
  }) => {
    await openSchemaV5Library(page);
    const writes: { method: string; path: string; body: unknown }[] = [];
    if (backend) {
      await page.evaluate(() => {
        localStorage.setItem("tabvault-storage-mode", "backend");
        localStorage.setItem("tabvault-api-key", "drag-test-key");
      });
      await page.route("**/api/v1/sync", async route => {
        const body = route.request().postDataJSON();
        if (body.changes.length)
          writes.push({
            method: route.request().method(),
            path: "/api/v1/sync",
            body,
          });
        expect(route.request().headers()["x-api-key"]).toBe("drag-test-key");
        const vault = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("tabvault-v3")!)
        );
        const document = {
          schemaVersion: 5,
          propertySchema: vault.propertySchema,
          library: {
            tabs: vault.library.tabs.map(t => ({
              ...t,
              content: { url: t.content.url, title: t.content.title },
            })),
            groups: vault.library.vaultGroups.map(g => ({
              ...g,
              details: {
                name: g.details.name,
                category: g.details.category,
                description: g.details.description,
                color: g.details.accent,
              },
            })),
            tags: vault.library.tags,
          },
        };
        await route.fulfill({
          json: {
            generation: "test",
            document,
            acknowledged: body.changes.map(c => c.token),
            propertyTimes: {},
            tombstones: [],
          },
        });
      });
      await page.reload();
    }
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await startDrag(
      page,
      page
        .getByTestId("tab-row-t-1001")
        .getByRole("button", { name: /^Reorder/ })
    );
    await hoverTarget(page, page.getByTestId("tab-row-t-research"), 0.25);
    await expect(
      page.getByTestId("tab-group-research").getByTestId("tab-row-t-1001")
    ).toBeVisible();
    await page.mouse.up();
    await expect
      .poll(async () => (await savedLibrary(page)).tabOrders)
      .toEqual({
        unassigned: ["advanced-old"],
        session: ["t-duplicate", "advanced-new"],
        research: ["t-1001", "t-research", "t-hidden"],
        empty: [],
      });
    if (backend) {
      await expect.poll(() => writes.length).toBe(1);
      expect(writes[0].method).toBe("POST");
    }
    expect(errors).toEqual([]);
    await page.reload();
    await expect(
      page.getByTestId("tab-group-research").getByTestId("tab-row-t-1001")
    ).toBeVisible();
  });
}

for (const destination of ["collection-drop-research", "tab-group-empty"]) {
  test(`drop on ${destination} appends to the collection`, async ({ page }) => {
    await openSchemaV5Library(page);
    await startDrag(
      page,
      page
        .getByTestId("tab-row-t-1001")
        .getByRole("button", { name: /^Reorder/ })
    );
    const target = page.getByTestId(destination);
    await hoverTarget(page, target);
    // Reposition after projection and auto-scroll settle the destination layout.
    await expect(async () => {
      await hoverTarget(
        page,
        target,
        destination === "tab-group-empty" ? 0.1 : 0.9
      );
      await expect(target).toHaveAttribute("data-drop-active", "true", {
        timeout: 300,
      });
    }).toPass({ timeout: 5000 });
    await page.mouse.up();
    const groupId = destination === "tab-group-empty" ? "empty" : "research";
    await expect
      .poll(async () => (await savedLibrary(page)).tabOrders[groupId])
      .toEqual(
        groupId === "empty" ? ["t-1001"] : ["t-research", "t-hidden", "t-1001"]
      );
  });
}

test("Escape restores membership and ordering after crossing collections", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  const before = await savedLibrary(page);
  await startDrag(
    page,
    page.getByTestId("tab-row-t-1001").getByRole("button", { name: /^Reorder/ })
  );
  await hoverTarget(page, page.getByTestId("tab-row-t-research"), 0.25);
  await expect(
    page.getByTestId("tab-group-research").getByTestId("tab-row-t-1001")
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByTestId("tab-drag-preview")).toHaveCount(0);
  await expect.poll(() => savedLibrary(page)).toEqual(before);
});

test("keyboard sorting and cancellation work from compact handles", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await page.getByLabel("Compact tab view", { exact: true }).click();
  const handle = page.getByTestId("tab-drag-handle-t-1001");
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("tab-drag-preview")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(
    page
      .getByTestId("tab-group-unassigned")
      .locator('[data-testid^="tab-row-"]')
      .first()
  ).toHaveAttribute("data-testid", "tab-row-advanced-old");
  await page.keyboard.press("Space");
  await expect
    .poll(async () => (await savedLibrary(page)).tabOrders.unassigned)
    .toEqual(["advanced-old", "t-1001"]);
  await handle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tab-drag-preview")).toHaveCount(0);
  await expect
    .poll(async () => (await savedLibrary(page)).tabOrders.unassigned)
    .toEqual(["advanced-old", "t-1001"]);
});

test("compact empty row space remains a drag activator", async ({ page }) => {
  await openSchemaV5Library(page);
  await page.getByLabel("Compact tab view", { exact: true }).click();
  await startDrag(page, page.getByTestId("tab-drag-space-t-1001"));
  await hoverTarget(page, page.getByTestId("tab-row-advanced-old"), 0.75);
  await page.mouse.up();
  await expect
    .poll(async () => (await savedLibrary(page)).tabOrders.unassigned)
    .toEqual(["advanced-old", "t-1001"]);
});

test("dropping in place leaves hidden tab order unchanged", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await startDrag(
    page,
    page
      .getByTestId("tab-row-t-research")
      .getByRole("button", { name: /^Reorder/ })
  );
  await page.mouse.up();
  await expect(page.getByTestId("tab-drag-preview")).toHaveCount(0);
  await page.reload();
  await expect
    .poll(async () => (await savedLibrary(page)).tabOrders.research)
    .toEqual(["t-research", "t-hidden"]);
});

test("board favicons sort horizontally and drop into an empty collection", async ({
  page,
}) => {
  await openSchemaV5Library(page);
  await page.getByLabel("Collection-group board view", { exact: true }).click();
  await startDrag(page, page.getByTestId("grouped-tab-advanced-new"));
  await hoverTarget(page, page.getByTestId("grouped-tab-t-duplicate"));
  await expect(
    page
      .getByTestId("group-card-session")
      .locator('button[data-testid^="grouped-tab-"]')
      .first()
  ).toHaveAttribute("data-testid", "grouped-tab-advanced-new");
  await page.mouse.up();
  await expect
    .poll(async () => (await savedLibrary(page)).tabOrders.session)
    .toEqual(["advanced-new", "t-duplicate"]);
  await startDrag(page, page.getByTestId("grouped-tab-advanced-new"));
  await hoverTarget(page, page.getByTestId("group-card-empty"));
  await expect(
    page.getByTestId("group-card-empty").getByTestId("grouped-tab-advanced-new")
  ).toBeVisible();
  await page.mouse.up();
  await expect
    .poll(async () => (await savedLibrary(page)).tabOrders.empty)
    .toEqual(["advanced-new"]);
});

for (const view of ["standard", "compact"]) {
  for (const tabId of ["t-duplicate", "t-1001"]) {
    test(`moving the only tab keeps collection order stable (${view}, ${tabId})`, async ({
      page,
    }) => {
      // Keep every collection visible so auto-scroll cannot move the test pointer.
      await page.setViewportSize({ width: 1280, height: 1400 });
      await openSchemaV5Library(page);
      await page.evaluate(view => {
        const vault = JSON.parse(localStorage.getItem("tabvault-v3")!);
        vault.library.tabs = vault.library.tabs.filter(t =>
          ["t-1001", "t-duplicate", "t-research"].includes(t.id)
        );
        vault.preferences.tabView = view;
        localStorage.setItem("tabvault-v3", JSON.stringify(vault));
      }, view);
      await page.reload();
      const groups = page.locator('[data-testid^="tab-group-"]');
      await expect(groups).toHaveCount(4);
      expect(
        await groups.evaluateAll(nodes =>
          nodes.map(n => n.getAttribute("data-testid"))
        )
      ).toEqual([
        "tab-group-unassigned",
        "tab-group-session",
        "tab-group-empty",
        "tab-group-research",
      ]);
      const order = await groups.evaluateAll(nodes =>
        nodes.map(n => ({
          id: n.getAttribute("data-testid"),
          top:
            n.getBoundingClientRect().top -
            n.parentElement!.getBoundingClientRect().top,
          height: n.getBoundingClientRect().height,
        }))
      );
      await startDrag(page, page.getByTestId(`tab-drag-handle-${tabId}`));
      await hoverTarget(page, page.getByTestId("tab-row-t-research"), 0.25);
      await expect(
        page.getByTestId("tab-group-research").getByTestId(`tab-row-${tabId}`)
      ).toBeVisible();
      expect(
        await groups.evaluateAll(nodes =>
          nodes.map(n => ({
            id: n.getAttribute("data-testid"),
            top:
              n.getBoundingClientRect().top -
              n.parentElement!.getBoundingClientRect().top,
            height: n.getBoundingClientRect().height,
          }))
        )
      ).toEqual(order);
      await page.mouse.up();
      await expect
        .poll(async () => (await savedLibrary(page)).tabOrders.research)
        .toEqual([tabId, "t-research"]);
    });
  }
}

for (const view of ["standard", "compact"]) {
  for (const fraction of [0.25, 0.75]) {
    for (const crossing of [false, true]) {
      test(`first-row insertion stays stable (${view}, ${fraction}, ${crossing ? "cross-group" : "same-group"})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 1280, height: 1400 });
        await openSchemaV5Library(page);
        await page.evaluate(
          ({ view, crossing }) => {
            const vault = JSON.parse(localStorage.getItem("tabvault-v3")!);
            vault.library.tabs = vault.library.tabs.filter(t =>
              ["t-1001", "advanced-old", "t-duplicate"].includes(t.id)
            );
            vault.library.tabs.forEach((tab, position) => {
              tab.placement = {
                groupId: crossing
                  ? tab.id === "t-duplicate"
                    ? "session"
                    : "research"
                  : null,
                position,
              };
            });
            vault.preferences.tabView = view;
            localStorage.setItem("tabvault-v3", JSON.stringify(vault));
          },
          { view, crossing }
        );
        await page.reload();
        const first = page.getByTestId("tab-row-t-1001");
        await first.waitFor();
        await startDrag(page, page.getByTestId("tab-drag-handle-t-duplicate"));
        await hoverTarget(page, first, fraction);
        if (crossing) {
          // The inserted row moves the target; aim at its settled position.
          await first.evaluate(el =>
            Promise.all(el.getAnimations().map(animation => animation.finished))
          );
          await hoverTarget(page, first, fraction);
        }
        const groupId = crossing ? "research" : "unassigned";
        await expect(page.getByTestId(`tab-group-${groupId}`)).toHaveAttribute(
          "data-drop-active",
          "true"
        );
        const samples = await page
          .getByTestId(`tab-group-${groupId}`)
          .evaluate(async el => {
            const samples: string[][] = [];
            for (let i = 0; i < 45; i++) {
              await new Promise<void>(resolve =>
                requestAnimationFrame(() => resolve())
              );
              samples.push(
                [...el.querySelectorAll<HTMLElement>("[data-tab-id]")].map(
                  row => row.dataset.tabId!
                )
              );
            }
            return samples;
          });
        expect(new Set(samples.map(order => order.join(","))).size).toBe(1);
        const expected =
          fraction < 0.5
            ? ["t-duplicate", "t-1001", "advanced-old"]
            : ["t-1001", "t-duplicate", "advanced-old"];
        expect(samples.at(-1)).toEqual(expected);
        await page.mouse.up();
        await expect(page.getByTestId(`tab-group-${groupId}`)).toHaveAttribute(
          "data-drop-active",
          "false"
        );
        await expect
          .poll(async () => (await savedLibrary(page)).tabOrders[groupId])
          .toEqual(expected);
      });
    }
  }
}
