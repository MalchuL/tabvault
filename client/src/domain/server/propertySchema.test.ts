import { afterEach, expect, it, vi } from "vitest";
import { ensureViewedProperty } from "./propertySchema";

afterEach(() => vi.unstubAllGlobals());

it("registers the built-in viewed property once", async () => {
  const viewed = { description: "", type: "boolean", default: false };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { properties: {} } }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { properties: { viewed } } }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { properties: { viewed } } }),
    });
  vi.stubGlobal("fetch", fetch);

  expect(await ensureViewedProperty("http://localhost:47821/", "key")).toEqual({
    viewed,
  });
  expect(await ensureViewedProperty("http://localhost:47821/", "key")).toEqual({
    viewed,
  });
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    "http://localhost:47821/api/v1/property-schema",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ name: "viewed", ...viewed }),
    })
  );
});
