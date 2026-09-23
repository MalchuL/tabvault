import { afterEach, expect, it, vi } from "vitest";
import { searchLocalServer } from "./search";

afterEach(() => vi.unstubAllGlobals());

it("labels server keyword fallback from its semantic-unavailable warning", async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: { results: [] },
      warnings: [{ code: "W_SEMANTIC_UNAVAILABLE" }],
    }),
  });
  vi.stubGlobal("fetch", fetch);

  const result = await searchLocalServer(
    "http://localhost:47821/",
    "notes",
    "research",
    "key"
  );

  expect(result).toMatchObject({
    mode: "text_fallback",
    query: "notes",
    group: "research",
  });
  expect(fetch).toHaveBeenCalledWith(
    "http://localhost:47821/api/v1/search?q=notes&groupId=research",
    expect.objectContaining({
      headers: expect.objectContaining({ "X-API-Key": "key" }),
    })
  );
});
