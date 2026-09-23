import { afterEach, describe, expect, it, vi } from "vitest";
import { createTabVaultApi, TabVaultApiError } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("createTabVaultApi", () => {
  it("routes each domain operation through the configured request helper", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetch);
    const api = createTabVaultApi({
      baseUrl: "http://localhost",
      apiKey: "key",
    });

    await Promise.all([
      api.tabs.list(),
      api.tabs.get("tab/id"),
      api.tabs.create({}),
      api.tabs.createBatch({}, "once"),
      api.tabs.update("tab", {}),
      api.tabs.remove("tab"),
      api.tabs.remove("tab", true),
      api.groups.list(),
      api.groups.create({}),
      api.groups.update("group", {}),
      api.groups.remove("group"),
      api.search.query(new URLSearchParams({ q: "docs" })),
      api.search.structured({}),
      api.index.status(),
      api.index.rebuild(),
      api.transfer.sync(),
      api.transfer.export("json"),
      api.transfer.import({}),
      api.transfer.validate({}),
      api.properties.get(),
      api.properties.upsert({}),
      api.properties.remove("property/name"),
    ]);

    expect(fetch).toHaveBeenCalledTimes(22);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost/api/v1/tabs/tab%2Fid",
      expect.anything()
    );
  });

  it("normalizes the base URL, headers, and error status", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetch);
    const api = createTabVaultApi({
      baseUrl: "http://localhost:1/",
      apiKey: "key",
    });
    await expect(api.request("/health")).rejects.toEqual(
      expect.objectContaining<TabVaultApiError>({ status: 503 })
    );
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:1/api/v1/health",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-API-Key": "key" }),
      })
    );
  });

  it("loads a ready article and resolves stored asset references", async () => {
    const createObjectURL = vi.fn(() => "blob:asset");
    vi.stubGlobal("URL", { createObjectURL });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              status: "ready",
              contentHtml: '<img src="tabvault-asset://asset-1">',
              title: "Captured",
            },
          }),
        })
        .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["x"]) })
    );
    const result = await createTabVaultApi({
      baseUrl: "http://localhost:1",
      apiKey: "key",
    }).previews.loadArticle({
      id: "tab",
      title: "Fallback",
      url: "https://example.com",
    });
    expect(result.article.title).toBe("Captured");
    expect(result.article.content).toContain("blob:asset");
    expect(result.objectUrls).toEqual(["blob:asset"]);
  });

  it("rejects unavailable previews", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { status: "failed", error: "capture failed" },
        }),
      })
    );
    await expect(
      createTabVaultApi({
        baseUrl: "http://localhost",
        apiKey: "key",
      }).previews.loadArticle({
        id: "tab",
        title: "Tab",
        url: "https://example.com",
      })
    ).rejects.toThrow("capture failed");
  });
});
