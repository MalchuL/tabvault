import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  downloadTransfer,
  emptyVault,
  expectedDocument,
  expectSameDocument,
  openTransfer,
  readVault,
  seedServer,
  serverDocument,
  test,
  transferVault,
  uploadTransfer,
} from "./transfer-fixture";

test("Browser JSON exports every portable field without modifying storage", async ({
  page,
}, testInfo) => {
  const source = transferVault();
  await openTransfer(page, source);
  const before = await readVault(page);
  const document = JSON.parse(
    await downloadTransfer(page, "Browser JSON", testInfo)
  );
  await expectSameDocument(document, expectedDocument(source));
  expect(document.library.tabs.map((tab: { id: string }) => tab.id)).toContain(
    "t-hidden"
  );
  expect(document.library.tabs.map((tab: { id: string }) => tab.id)).toContain(
    "t-archived"
  );
  expect(
    document.library.tabs.filter(
      (tab: { content: { url: string } }) =>
        tab.content.url === source.library.tabs[0].content.url
    )
  ).toHaveLength(2);
  // These are local presentation/settings fields, outside the portable contract.
  expect(document).not.toHaveProperty("preferences");
  expect(document).not.toHaveProperty("sync");
  expect(document.library).not.toHaveProperty("savedSearches");
  expect(document.library.tabs[0].content).toEqual({
    title: source.library.tabs[0].content.title,
    url: "https://notes.example.com/agents?b=2&a=1#part",
  });
  expect(await readVault(page)).toEqual(before);
});

for (const mode of ["merge", "replace"] as const) {
  test(`offline Browser JSON → ${mode} → reload → Browser JSON preserves portable data`, async ({
    page,
  }, testInfo) => {
    await openTransfer(page, transferVault());
    const exported = await downloadTransfer(page, "Browser JSON", testInfo);
    const target = emptyVault();
    target.preferences.tabView = "groups";
    target.library.savedSearches[0].name = "Destination view";
    await openTransfer(page, target);
    await page.getByRole("button", { name: mode, exact: true }).click();
    if (mode === "replace") page.once("dialog", dialog => dialog.accept());
    await test.step("Import the actual downloaded bytes", async () => {
      await uploadTransfer(page, exported);
      await expect(
        page.getByText("Browser library imported", { exact: true })
      ).toBeVisible();
    });
    const restored = await readVault(page);
    await expectSameDocument(
      expectedDocument(restored),
      JSON.parse(exported),
      true
    );
    expect(restored.preferences).toEqual(target.preferences);
    expect(restored.library.savedSearches).toEqual(
      target.library.savedSearches
    );
    expect(restored.sync.generation).toBeNull();
    expect(
      Object.keys(restored.sync.pending).length,
      "offline import remains durably queued"
    ).toBeGreaterThan(0);
    // Display fields are derived again when portable data is loaded.
    expect(restored.library.tabs[0].content).toMatchObject({
      domain: "notes.example.com",
      color: "#6b8c7e",
      icon: "A",
    });
    await page.reload();
    const reexported = JSON.parse(
      await downloadTransfer(page, "Browser JSON", testInfo)
    );
    await expectSameDocument(reexported, expectedDocument(restored));
    await test.step("Import the same file again without duplicating identities or changing timestamps", async () => {
      if (mode === "replace") page.once("dialog", dialog => dialog.accept());
      await uploadTransfer(page, exported);
      const repeated = await readVault(page);
      await expectSameDocument(
        expectedDocument(repeated),
        expectedDocument(restored)
      );
    });
  });
}

test("raw browser recovery JSON imports through the same file picker", async ({
  page,
}) => {
  const source = transferVault();
  await openTransfer(page, emptyVault());
  await uploadTransfer(
    page,
    JSON.stringify(source),
    "tabvault-before-replacement.json"
  );
  await expect(
    page.getByText("Browser library imported", { exact: true })
  ).toBeVisible();
  await expectSameDocument(
    expectedDocument(await readVault(page)),
    expectedDocument(source),
    true
  );
});

test("local replace removes destination-only records and definitions after confirmation", async ({
  page,
}) => {
  await openTransfer(page, transferVault());
  const incoming = expectedDocument();
  incoming.library.tabs = [incoming.library.tabs[0]];
  incoming.library.groups = [];
  incoming.library.tags = incoming.library.tags.filter(
    tag => tag.name === "product"
  );
  delete incoming.propertySchema.score;
  await page.getByRole("button", { name: "replace", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await uploadTransfer(page, JSON.stringify(incoming));
  await expect(
    page.getByText("Browser library imported", { exact: true })
  ).toBeVisible();
  await expectSameDocument(
    expectedDocument(await readVault(page)),
    incoming,
    true
  );
});

test("cancelling local replace leaves the entire browser vault unchanged", async ({
  page,
}) => {
  await openTransfer(page, transferVault());
  const before = await readVault(page);
  await page.getByRole("button", { name: "replace", exact: true }).click();
  const dialog = page.waitForEvent("dialog");
  page.once("dialog", dialog => dialog.dismiss());
  await uploadTransfer(page, JSON.stringify(expectedDocument(emptyVault())));
  expect((await dialog).message()).toContain("Replace this browser library");
  expect(await readVault(page)).toEqual(before);
});

for (const [name, content] of [
  ["malformed JSON", '{"schemaVersion":'],
  [
    "unsupported schema",
    JSON.stringify({ ...expectedDocument(), schemaVersion: 4 }),
  ],
  [
    "missing definitions",
    JSON.stringify({ ...expectedDocument(), propertySchema: undefined }),
  ],
  [
    "duplicate tab identity",
    (() => {
      const d = expectedDocument();
      d.library.tabs.push(d.library.tabs[0]);
      return JSON.stringify(d);
    })(),
  ],
  [
    "unknown group reference",
    (() => {
      const d = expectedDocument();
      d.library.tabs[0].placement.groupId = "missing";
      return JSON.stringify(d);
    })(),
  ],
  [
    "unsafe URL",
    (() => {
      const d = expectedDocument();
      d.library.tabs[0].content.url = "javascript:alert(1)";
      return JSON.stringify(d);
    })(),
  ],
] as const) {
  test(`offline ${name} reports failure and preserves the complete vault`, async ({
    page,
  }) => {
    await openTransfer(page, transferVault());
    const before = await readVault(page);
    await page.getByRole("button", { name: "replace", exact: true }).click();
    await uploadTransfer(page, content);
    await expect(
      page.getByText("Import could not be completed", { exact: true })
    ).toBeVisible();
    expect(await readVault(page)).toEqual(before);
  });
}

test("offline Markdown fails clearly and the picker can retry a valid JSON file", async ({
  page,
}) => {
  await openTransfer(page, emptyVault());
  const before = await readVault(page);
  await uploadTransfer(
    page,
    "## Collection\n- [Page](https://example.com)",
    "transfer.md"
  );
  await expect(
    page.getByText("Markdown import requires a connected TabVault API.", {
      exact: true,
    })
  ).toBeVisible();
  expect(await readVault(page)).toEqual(before);
  await uploadTransfer(page, JSON.stringify(expectedDocument()));
  await expect(
    page.getByText("Browser library imported", { exact: true })
  ).toBeVisible();
  await expectSameDocument(
    expectedDocument(await readVault(page)),
    expectedDocument(),
    true
  );
});

for (const storage of ["local", "server"] as const) {
  test(`${storage} merge keeps newer destination records, applies newer imports, and retains unrelated records`, async ({
    page,
    server,
  }) => {
    const original = transferVault();
    if (storage === "server") await seedServer(server);
    await openTransfer(
      page,
      storage === "server" ? emptyVault() : original,
      storage === "server" ? server : undefined
    );
    const incoming = expectedDocument();
    incoming.library.tabs = incoming.library.tabs.slice(0, 3);
    incoming.library.tabs[0].content.title = "Newer imported title";
    incoming.library.tabs[0].timestamps.updatedAt = "2026-09-01T00:00:00.000Z";
    incoming.library.tabs[1].content.title = "Older title must lose";
    incoming.library.tabs[1].timestamps.updatedAt = "2026-01-01T00:00:00.000Z";
    incoming.library.tabs[2].content.title = "Equal timestamp must lose";
    incoming.propertySchema.note.default = "Conflicting imported default";
    incoming.propertySchema.added = {
      type: "string",
      default: "new default",
      description: "New definition",
    };
    await uploadTransfer(page, JSON.stringify(incoming));
    await expect(
      page.getByText(
        storage === "server" ? "Library merged" : "Browser library imported",
        { exact: true }
      )
    ).toBeVisible();
    const expected = expectedDocument(original);
    expected.library.tabs[0] = incoming.library.tabs[0];
    expected.propertySchema.added = incoming.propertySchema.added;
    const actual =
      storage === "server"
        ? await serverDocument(server)
        : expectedDocument(await readVault(page));
    await expectSameDocument(actual, expected, storage === "local");
    await expectSameDocument(expectedDocument(await readVault(page)), actual);
  });
}

for (const mode of ["merge", "replace"] as const) {
  test(`authenticated Browser JSON → server ${mode} → browser cache → export retains the complete library`, async ({
    page,
    server,
  }, testInfo) => {
    await openTransfer(page, transferVault());
    const downloaded = await downloadTransfer(page, "Browser JSON", testInfo);
    await openTransfer(page, emptyVault(), server);
    const requests: string[] = [];
    page.on("request", request => {
      if (request.url().startsWith(server.url)) {
        expect(
          request.headers()["x-api-key"],
          "UI requests use the configured credential"
        ).toBe(server.apiKey);
        requests.push(new URL(request.url()).pathname);
      }
    });
    await page.getByRole("button", { name: mode, exact: true }).click();
    if (mode === "replace") page.once("dialog", dialog => dialog.accept());
    await uploadTransfer(page, downloaded);
    await expect(
      page.getByText(mode === "merge" ? "Library merged" : "Library replaced", {
        exact: true,
      })
    ).toBeVisible();
    const remote = await serverDocument(server);
    await expectSameDocument(remote, JSON.parse(downloaded));
    await expectSameDocument(expectedDocument(await readVault(page)), remote);
    expect((await readVault(page)).sync.pending).toEqual({});
    expect(requests).toContain("/api/v1/import");
    expect(
      requests.filter(url => url === "/api/v1/sync").length
    ).toBeGreaterThanOrEqual(2);
    await page.reload();
    await expectSameDocument(
      JSON.parse(await downloadTransfer(page, "Browser JSON", testInfo)),
      remote
    );
    await page.getByRole("button", { name: mode, exact: true }).click();
    if (mode === "replace") page.once("dialog", dialog => dialog.accept());
    await uploadTransfer(page, downloaded);
    await expect(
      page.getByText(mode === "merge" ? "Library merged" : "Library replaced", {
        exact: true,
      })
    ).toBeVisible();
    await expectSameDocument(await serverDocument(server), remote);
    await expectSameDocument(expectedDocument(await readVault(page)), remote);
  });
}

test("Server JSON round trip is exact for exported records but intentionally omits active hidden tabs", async ({
  page,
  server,
}, testInfo) => {
  await seedServer(server);
  await openTransfer(page, emptyVault(), server);
  const before = await serverDocument(server);
  const downloaded = await downloadTransfer(page, "Server JSON", testInfo);
  const expected = expectedDocument();
  expected.library.tabs = expected.library.tabs.filter(
    tab => tab.id !== "t-hidden"
  );
  await expectSameDocument(JSON.parse(downloaded), expected);
  await expectSameDocument(await serverDocument(server), before);
  const cleared = await server.request.delete("library");
  await expect(cleared).toBeOK();
  await openTransfer(page, emptyVault(), server);
  await page.getByRole("button", { name: "replace", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await uploadTransfer(page, downloaded);
  await expect(
    page.getByText("Library replaced", { exact: true })
  ).toBeVisible();
  await expectSameDocument(await serverDocument(server), expected);
  await expectSameDocument(expectedDocument(await readVault(page)), expected);
  await expectSameDocument(
    JSON.parse(await downloadTransfer(page, "Server JSON", testInfo)),
    expected
  );
  await test.step("The same Server JSON also imports into a browser without an API", async () => {
    await openTransfer(page, emptyVault());
    await uploadTransfer(page, downloaded);
    await expect(
      page.getByText("Browser library imported", { exact: true })
    ).toBeVisible();
    await expectSameDocument(
      expectedDocument(await readVault(page)),
      expected,
      true
    );
    await expectSameDocument(
      JSON.parse(await downloadTransfer(page, "Browser JSON", testInfo)),
      expected,
      true
    );
  });
});

test("server replace preserves a complete pre-replacement backup and cancelling replace does nothing", async ({
  page,
  server,
}, testInfo) => {
  await seedServer(server);
  await openTransfer(page, emptyVault(), server);
  const before = await serverDocument(server);
  const localBefore = await readVault(page);
  const backupIds = async () =>
    (await (await server.request.get("backups")).json()).data.backups.map(
      (backup: { id: string }) => backup.id
    );
  const idsBefore = await backupIds();
  await page.getByRole("button", { name: "replace", exact: true }).click();
  page.once("dialog", dialog => dialog.dismiss());
  await uploadTransfer(page, JSON.stringify(expectedDocument(emptyVault())));
  await expectSameDocument(await serverDocument(server), before);
  expect(await readVault(page)).toEqual(localBefore);
  expect(await backupIds()).toEqual(idsBefore);
  page.once("dialog", dialog => dialog.accept());
  const applied = page.waitForResponse(
    response => response.url() === `${server.url}/api/v1/import`
  );
  await uploadTransfer(page, JSON.stringify(expectedDocument(emptyVault())));
  await expect(
    page.getByText("Library replaced", { exact: true })
  ).toBeVisible();
  const backupId = (await (await applied).json()).data.backupSnapshotId;
  expect(backupId).toBeTruthy();
  const backup = await server.request.get(`backups/${backupId}/download`);
  await expect(backup).toBeOK();
  await expectSameDocument(await backup.json(), before);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  const row = page
    .locator("section > div")
    .filter({ has: page.getByRole("button", { name: "Restore backup" }) })
    .filter({ hasText: "pre_replace_import" })
    .first();
  const pending = page.waitForEvent("download");
  await row.getByRole("button", { name: "Download backup" }).click();
  const downloaded = await pending;
  const content = await readFile((await downloaded.path())!, "utf8");
  await testInfo.attach("complete-safety-backup.json", {
    body: content,
    contentType: "application/json",
  });
  await expectSameDocument(JSON.parse(content), before);
  page.once("dialog", dialog => dialog.accept());
  await row.getByRole("button", { name: "Restore backup" }).click();
  await expect(
    page.getByText(
      "Backup restored. Load the new server library from Settings.",
      { exact: true }
    )
  ).toBeVisible();
  await expectSameDocument(await serverDocument(server), before);
  // Restore changes generation; the stale browser must explicitly adopt it.
  expect((await readVault(page)).library.tabs).toEqual([]);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  const localExport = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export local copy and load server library" })
    .click();
  expect((await localExport).suggestedFilename()).toBe(
    "tabvault-before-replacement.json"
  );
  await expect(
    page.getByText("Server library loaded", { exact: true })
  ).toBeVisible();
  await expectSameDocument(expectedDocument(await readVault(page)), before);
});

test("authenticated invalid import displays field-level diagnostics without changing browser, server, or backups", async ({
  page,
  server,
}) => {
  await seedServer(server);
  await openTransfer(page, emptyVault(), server);
  const before = await serverDocument(server);
  const localBefore = await readVault(page);
  const backupsBefore = await (await server.request.get("backups")).json();
  const invalid = expectedDocument();
  invalid.library.tabs[0].content.url = "javascript:alert(1)";
  invalid.library.tabs[1].placement.groupId = "missing-collection";
  await page.getByRole("button", { name: "replace", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await uploadTransfer(page, JSON.stringify(invalid));
  await expect(
    page.getByText("Validation report", { exact: true })
  ).toBeVisible();
  await expect(
    page.locator("article").filter({ hasText: "E_INVALID_URL" })
  ).toBeVisible();
  await expect(
    page.getByText("$.library.tabs[0].content.url", { exact: true })
  ).toBeVisible();
  await expect(
    page.locator("article").filter({ hasText: "E_UNKNOWN_GROUP_REFERENCE" })
  ).toBeVisible();
  await expect(
    page.getByText("$.library.tabs[1].placement.groupId", { exact: true })
  ).toBeVisible();
  await expectSameDocument(await serverDocument(server), before);
  expect(await readVault(page)).toEqual(localBefore);
  expect(await (await server.request.get("backups")).json()).toEqual(
    backupsBefore
  );
  await test.step("A corrected file clears the report and can reuse the same filename", async () => {
    page.once("dialog", dialog => dialog.accept());
    await uploadTransfer(page, JSON.stringify(expectedDocument()));
    await expect(
      page.getByText("Library replaced", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("Validation report", { exact: true })
    ).toHaveCount(0);
    await expectSameDocument(await serverDocument(server), before);
  });
});

for (const extension of ["md", "markdown"]) {
  test(`Server .${extension} round trip preserves active links and raw properties while exposing format losses`, async ({
    page,
    server,
  }, testInfo) => {
    await seedServer(server);
    await openTransfer(page, emptyVault(), server);
    const markdown = await downloadTransfer(page, "Server Markdown", testInfo);
    expect(markdown).not.toContain("t-hidden");
    expect(markdown).not.toContain("t-archived");
    expect(markdown).toContain("## Empty shelf");
    const clear = await server.request.delete("library");
    await expect(clear).toBeOK();
    await openTransfer(page, emptyVault(), server);
    await page.getByRole("button", { name: "replace", exact: true }).click();
    page.once("dialog", dialog => dialog.accept());
    await uploadTransfer(page, markdown, `round-trip.${extension}`);
    await expect(
      page.getByText("Library replaced", { exact: true })
    ).toBeVisible();
    const restored = await serverDocument(server);
    expect(restored.propertySchema).toEqual(expectedDocument().propertySchema);
    const active = expectedDocument().library.tabs.filter(
      tab => !["t-hidden", "t-archived"].includes(tab.id)
    );
    expect(restored.library.tabs.map(tab => tab.id).sort()).toEqual(
      active.map(tab => tab.id).sort()
    );
    for (const source of active) {
      await test.step(`Markdown/${source.id}: exact URL, title, tags, raw values and named collection`, async () => {
        const tab = restored.library.tabs.find(tab => tab.id === source.id)!;
        expect(tab.content).toEqual(source.content);
        expect(tab.annotations.customProperties).toEqual(
          source.annotations.customProperties
        );
        expect([...tab.annotations.tags].sort()).toEqual(
          [...source.annotations.tags].sort()
        );
        const groupName =
          restored.library.groups.find(
            group => group.id === tab.placement.groupId
          )?.details.name ?? null;
        const sourceName =
          expectedDocument().library.groups.find(
            group => group.id === source.placement.groupId
          )?.details.name ?? null;
        expect(groupName).toBe(sourceName);
        expect(tab.timestamps.createdAt).not.toBe(source.timestamps.createdAt);
      });
    }
    expect(
      restored.library.groups.map(group => group.details.name).sort()
    ).toEqual(
      expectedDocument()
        .library.groups.map(group => group.details.name)
        .sort()
    );
    for (const group of restored.library.groups) {
      const source = expectedDocument().library.groups.find(
        source => source.details.name === group.details.name
      )!;
      expect(group.id).not.toBe(source.id);
      expect(group.details.description).toBe(source.details.description);
      expect(group.details.category).toBe("manual");
      expect(group.details.color).toBeNull();
    }
    expect(restored.library.tags.map(tag => tag.name)).not.toContain("merged");
    expect(restored.library.tags.every(tag => !tag.description)).toBe(true);
    const browserExpected = structuredClone(restored);
    browserExpected.library.tags = browserExpected.library.tags.map(tag => ({
      ...tag,
      description: tag.description ?? "",
    }));
    const browserDocument = expectedDocument(await readVault(page));
    for (const group of browserDocument.library.groups) {
      expect(
        group.details.color,
        "Markdown collections receive a browser display color"
      ).toBeTruthy();
      // Markdown supplies no color; its browser-only fallback is outside the round trip.
      group.details.color = null;
    }
    await expectSameDocument(browserDocument, browserExpected);
    // Re-export preserves the readable interchange even though original backup metadata was lost.
    expect(await downloadTransfer(page, "Server Markdown", testInfo)).toBe(
      markdown
    );
  });
}

for (const operation of ["export", "import"]) {
  test(`UI ${operation} with a rejected API key reports failure and preserves both copies`, async ({
    page,
    server,
  }) => {
    await seedServer(server);
    await openTransfer(page, emptyVault(), server);
    const before = await serverDocument(server);
    const localBefore = await readVault(page);
    const endpoint =
      operation === "export"
        ? `${server.url}/api/v1/export?format=json`
        : `${server.url}/api/v1/import`;
    await page.route(endpoint, route =>
      route.continue({
        headers: {
          ...route.request().headers(),
          "x-api-key": "rejected-test-key",
        },
      })
    );
    const rejected = page.waitForResponse(
      response => response.url() === endpoint
    );
    const downloads: string[] = [];
    page.on("download", download =>
      downloads.push(download.suggestedFilename())
    );
    if (operation === "export") {
      await page
        .getByRole("button", { name: "Server JSON", exact: true })
        .click();
      await expect(
        page.getByText("Could not export server data", { exact: true })
      ).toBeVisible();
    } else {
      await uploadTransfer(
        page,
        JSON.stringify(expectedDocument(emptyVault()))
      );
      await expect(
        page.getByText("Import could not be completed", { exact: true })
      ).toBeVisible();
    }
    expect((await rejected).status()).toBe(401);
    expect(downloads).toEqual([]);
    await expectSameDocument(await serverDocument(server), before);
    expect(await readVault(page)).toEqual(localBefore);
  });
}
