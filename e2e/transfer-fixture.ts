import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  expect,
  test as base,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import type { PortableDocument } from "../chrome_extension/src/domain/library/codec";
import type { PersistedVault } from "../chrome_extension/src/domain/library/types";
import { schemaV5Vault } from "./schema-v5-fixture";

type TransferServer = {
  url: string;
  apiKey: string;
  request: APIRequestContext;
};

// Each backend test gets its own process, database, backups, and authentication key.
export const test = base.extend<{ server: TransferServer }>({
  server: async ({ playwright }, provide, testInfo) => {
    const directory = await mkdtemp(path.join(tmpdir(), "tabvault-transfer-"));
    const apiKey = "disposable-transfer-test-key";
    const serverRoot = path.resolve("server");
    const child = spawn(
      path.join(serverRoot, ".venv/bin/python"),
      [
        "-m",
        "uvicorn",
        "api.main:create_app",
        "--factory",
        "--host",
        "127.0.0.1",
        "--port",
        "0",
      ],
      {
        cwd: serverRoot,
        env: {
          ...process.env,
          PYTHONPATH: path.join(serverRoot, "src"),
          TABVAULT_STORAGE__DATA_DIR: directory,
          TABVAULT_STORAGE__DATABASE_URL: `sqlite+aiosqlite:///${directory}/library.sqlite3`,
          TABVAULT_HTTP__HOST: "127.0.0.1",
          TABVAULT_HTTP__API_KEY: apiKey,
          TABVAULT_HTTP__CORS_ORIGINS: "http://127.0.0.1:4173",
          TABVAULT_DEBUG__ENABLED: "false",
          TABVAULT_LOGGING__LEVEL: "INFO",
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let logs = "";
    child.stdout.on("data", chunk => {
      logs += String(chunk);
    });
    child.stderr.on("data", chunk => {
      logs += String(chunk);
    });
    let request: APIRequestContext | undefined;
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Test API did not start:\n${logs}`)),
          15_000
        );
        const ready = () => {
          const origin = logs.match(
            /Uvicorn running on (http:\/\/127\.0\.0\.1:\d+)/
          )?.[1];
          if (origin) {
            clearTimeout(timer);
            resolve(origin);
          }
        };
        child.stderr.on("data", ready);
        child.once("error", error => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("exit", code => {
          clearTimeout(timer);
          reject(new Error(`Test API exited (${code}):\n${logs}`));
        });
      });
      request = await playwright.request.newContext({
        baseURL: `${url}/api/v1/`,
        extraHTTPHeaders: { "X-API-Key": apiKey },
      });
      await expect(await request.get("health")).toBeOK();
      await provide({ url, apiKey, request });
    } finally {
      await request?.dispose();
      if (child.pid && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
        await exited;
        clearTimeout(timer);
      }
      await testInfo.attach("server.log", {
        body: logs,
        contentType: "text/plain",
      });
      await rm(directory, { recursive: true, force: true });
    }
  },
});

/** Return varied disposable records, including falsy, nested, and undeclared raw values. */
export function transferVault(): PersistedVault {
  const vault = structuredClone(schemaV5Vault) as PersistedVault;
  Object.assign(vault.propertySchema, {
    count: { type: "int", description: "Zero is meaningful", default: 7 },
    score: { type: "float", description: "Fractional score", default: 1.25 },
    payload: {
      type: "json",
      description: "Nested payload",
      default: { fallback: true },
    },
  });
  Object.assign(vault.library.tabs[0].annotations.customProperties, {
    note: 'Café — Привет 👋\nSecond line, "quoted" and \\ backslash',
    viewed: false,
    count: 0,
    score: 0.125,
    payload: {
      values: [null, false, 0, "é"],
      nested: { enabled: true, nullable: null },
      // Raw property keys are opaque, even when they resemble library metadata.
      tags: ["z", "a"],
      createdAt: "not a timestamp",
      timestamps: { updatedAt: "literal value" },
    },
    undeclared: { retained: true },
  });
  // Missing overrides must remain missing rather than materializing schema defaults.
  vault.library.tabs[2].annotations.customProperties = {};
  for (const name of ["shared", "old", "new"]) {
    vault.library.tags.push({
      name,
      description: `Catalog entry: ${name}`,
      createdAt: "2026-08-23T10:00:00.000Z",
      updatedAt: "2026-08-23T10:00:00.000Z",
    });
  }
  vault.preferences.tabView = "compact";
  return vault;
}

/** Independently describe the portable fields expected from the browser fixture. */
export function expectedDocument(vault = transferVault()): PortableDocument {
  return {
    schemaVersion: 5,
    propertySchema: structuredClone(vault.propertySchema),
    library: {
      tabs: vault.library.tabs.map(tab => ({
        id: tab.id,
        content: { title: tab.content.title, url: tab.content.url },
        annotations: structuredClone(tab.annotations),
        placement: { ...tab.placement },
        lifecycle: { ...tab.lifecycle },
        timestamps: { ...tab.timestamps },
      })),
      groups: vault.library.vaultGroups.map(group => ({
        id: group.id,
        details: {
          name: group.details.name,
          description: group.details.description,
          category: group.details.category,
          color: group.details.accent ?? null,
        },
        placement: { ...group.placement },
        timestamps: { ...group.timestamps },
      })),
      tags: structuredClone(vault.library.tags),
    },
  };
}

/** Open the real transfer page with isolated browser storage and optional real API. */
export async function openTransfer(
  page: Page,
  vault: PersistedVault,
  server?: TransferServer
) {
  await page.goto("/");
  await page.evaluate(
    ({ vault, server }) => {
      localStorage.clear();
      localStorage.setItem("tabvault-v3", JSON.stringify(vault));
      localStorage.setItem(
        "tabvault-storage-mode",
        server ? "backend" : "local"
      );
      localStorage.setItem(
        "tabvault-local-server-url",
        server?.url ?? "http://127.0.0.1:1"
      );
      localStorage.setItem(
        "tabvault-api-key",
        server?.apiKey ?? "unused-test-key"
      );
    },
    {
      vault,
      server: server ? { url: server.url, apiKey: server.apiKey } : undefined,
    }
  );
  await page.goto("/transfer");
  await expect(
    page.getByRole("heading", { name: "Import & Export" })
  ).toBeVisible();
  if (server) {
    await expect(
      page.getByRole("button", { name: "Server JSON", exact: true })
    ).toBeEnabled();
    await expect
      .poll(async () => (await readVault(page)).sync.generation)
      .not.toBeNull();
  } else {
    await expect(
      page.getByRole("button", { name: "Server JSON", exact: true })
    ).toBeDisabled();
  }
}

/** Read the durable browser copy rather than relying only on success messages. */
export async function readVault(page: Page): Promise<PersistedVault> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("tabvault-v3")!));
}

/** Download through the UI and retain the actual bytes as a Playwright attachment. */
export async function downloadTransfer(
  page: Page,
  button: string,
  testInfo: TestInfo
): Promise<string> {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(
    /^tabvault-(?:browser|server|backup)-.+\.(?:json|md)$/
  );
  const file = (await download.path())!;
  const body = await readFile(file, "utf8");
  await testInfo.attach(`${button}-${testInfo.attachments.length}`, {
    body,
    contentType: button.includes("Markdown")
      ? "text/markdown"
      : "application/json",
  });
  return body;
}

/** Select a file through the UI's picker so its normal change handler performs the import. */
export async function uploadTransfer(
  page: Page,
  content: string,
  filename = "round-trip.json"
) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose a transfer file" }).click();
  await (
    await chooser
  ).setFiles({
    name: filename,
    mimeType: filename.endsWith(".json") ? "application/json" : "text/markdown",
    buffer: Buffer.from(content),
  });
  // Reset happens in finally, after async file reads, dialogs, and storage writes.
  await expect
    .poll(() =>
      page
        .locator('input[type="file"]')
        .evaluate((input: HTMLInputElement) => input.files?.length)
    )
    .toBe(0);
  await expect(
    page.getByRole("button", { name: "Choose a transfer file" })
  ).toBeEnabled();
}

/** Compare every portable field with per-record failure steps, normalizing only order and UTC spelling. */
export async function expectSameDocument(
  actual: PortableDocument,
  expected: PortableDocument,
  changedTimes = false
) {
  expect(actual.schemaVersion, "schema version").toBe(expected.schemaVersion);
  expect(actual.propertySchema, "definitions and defaults").toEqual(
    expected.propertySchema
  );
  for (const kind of ["tabs", "groups", "tags"] as const) {
    const key = (record: { id?: string; name?: string }) =>
      record.id ?? record.name!;
    expect(
      actual.library[kind].map(key).sort(),
      `${kind}: exact identities and count`
    ).toEqual(expected.library[kind].map(key).sort());
    for (const source of expected.library[kind]) {
      const id = key(source);
      await test.step(`${kind}/${id}: content, raw values, links, placement, lifecycle, timestamps`, async () => {
        const target = actual.library[kind].find(record => key(record) === id)!;
        const normalize = (record: typeof source) => {
          const result = structuredClone(record);
          const times = "timestamps" in result ? result.timestamps : result;
          times.createdAt = new Date(times.createdAt).toISOString();
          times.updatedAt = new Date(times.updatedAt).toISOString();
          if ("annotations" in result) {
            result.annotations.tags.sort();
            for (const field of ["archivedAt", "hiddenUntil"] as const) {
              const time = result.lifecycle[field];
              if (time !== null)
                result.lifecycle[field] = new Date(time).toISOString();
            }
          }
          return result;
        };
        const left = normalize(target);
        const right = normalize(source);
        if (changedTimes) {
          const leftTimes = "timestamps" in left ? left.timestamps : left;
          const rightTimes = "timestamps" in right ? right.timestamps : right;
          expect(
            Date.parse(leftTimes.updatedAt),
            `${kind}/${id}: import is a newer local mutation`
          ).toBeGreaterThanOrEqual(Date.parse(rightTimes.updatedAt));
          leftTimes.updatedAt = rightTimes.updatedAt;
        }
        expect(left, `${kind}/${id}: complete portable record`).toEqual(right);
      });
    }
  }
}

/** Read all server records, including hidden ones, independently of its filtered export. */
export async function serverDocument(
  server: TransferServer
): Promise<PortableDocument> {
  const response = await server.request.get("sync");
  await expect(response).toBeOK();
  return response.json();
}

/** Seed only disposable server data; the round-trip import itself still goes through the UI. */
export async function seedServer(
  server: TransferServer,
  document = expectedDocument()
) {
  const response = await server.request.post("import", {
    data: { format: "json", mode: "replace", content: document },
  });
  await expect(response).toBeOK();
  expect((await response.json()).success).toBe(true);
}

/** Preserve local views and preferences while emptying portable records for restore tests. */
export function emptyVault(): PersistedVault {
  const vault = transferVault();
  vault.propertySchema = {};
  vault.library.tabs = [];
  vault.library.vaultGroups = [];
  vault.library.tags = [];
  return vault;
}
