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
      api.request("/health"),
      api.transfer.export("json"),
      api.transfer.import({}),
      api.transfer.validate({}),
    ]);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost/api/v1/health",
      expect.anything()
    );
  });

  it("normalizes the base URL, headers, and error status", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
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
});
