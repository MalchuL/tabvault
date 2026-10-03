import { afterEach, expect, it, vi } from "vitest";
import { checkLocalServer } from "./search";
afterEach(() => vi.unstubAllGlobals());
it("reads health with authentication and no writes", async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ status: "ok", schemaVersion: 5 }),
  });
  vi.stubGlobal("fetch", fetch);
  expect(await checkLocalServer("http://server/", "key")).toEqual({
    status: "ok",
    schemaVersion: 5,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    "http://server/api/v1/health",
    expect.objectContaining({
      headers: expect.objectContaining({ "X-API-Key": "key" }),
    })
  );
});
