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

  it("retains every validation error and warning for the transfer report", async () => {
    const errors = [
      {
        code: "E_INVALID_URL",
        path: "$.library.tabs[0].content.url",
        message: "Invalid URL",
        suggestedFix: "Use an HTTPS URL",
      },
      {
        code: "E_UNKNOWN_GROUP_REFERENCE",
        path: "$.library.tabs[1].placement.groupId",
        message: "Missing group",
      },
    ];
    const warnings = [
      {
        code: "W_ORPHAN_TAG",
        path: "$.library.tabs[0].annotations.tags[0]",
        message: "Tag will be created",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ errors, warnings }),
      })
    );
    const api = createTabVaultApi({
      baseUrl: "http://localhost",
      apiKey: "key",
    });
    await expect(api.transfer.import({})).rejects.toMatchObject({
      status: 422,
      message: "Invalid URL",
      errors,
      warnings,
    });
  });

  it("keeps a useful HTTP error when a failure response is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError("HTML response");
        },
      })
    );
    await expect(
      createTabVaultApi({
        baseUrl: "http://localhost",
        apiKey: "key",
      }).transfer.import({})
    ).rejects.toMatchObject({
      status: 502,
      message: "Request failed (502)",
      errors: [],
      warnings: [],
    });
  });
});
