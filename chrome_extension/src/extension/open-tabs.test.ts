import { afterEach, expect, it, vi } from "vitest";
import { openChromeTabs } from "./open-tabs";

afterEach(() => vi.unstubAllGlobals());

it("groups only successfully opened distinct URLs and reports grouping failures", async () => {
  const create = vi.fn(async ({ url }: { url: string }) => {
    if (url.endsWith("fail")) throw new Error("Navigation failed");
    return { id: 42 };
  });
  const group = vi.fn(async () => 7);
  const update = vi.fn(async () => undefined);
  vi.stubGlobal("chrome", { tabs: { create, group }, tabGroups: { update } });
  const options = { title: "Research", color: "blue" as const };
  const urls = [
    "https://example.com/ok",
    "https://example.com/ok",
    "chrome://settings",
    "https://example.com/fail",
  ];
  expect(await openChromeTabs(urls, options)).toEqual({
    openedCount: 1,
    requestedCount: 2,
    openedUrls: ["https://example.com/ok"],
  });
  expect(group).toHaveBeenCalledWith({ tabIds: [42] });
  expect(update).toHaveBeenCalledWith(7, options);
  update.mockRejectedValueOnce(new Error("Group unavailable"));
  expect(await openChromeTabs(urls, options)).toMatchObject({
    openedCount: 1,
    groupError: "Group unavailable",
  });
  await openChromeTabs(urls);
  expect(group).toHaveBeenCalledTimes(2);
  await openChromeTabs(["https://example.com/fail"], options);
  expect(group).toHaveBeenCalledTimes(2);
  const before = create.mock.calls.length;
  await expect(
    openChromeTabs(urls, { ...options, color: "invalid" as "blue" })
  ).rejects.toThrow("Color is incorrect");
  expect(create).toHaveBeenCalledTimes(before);
});
