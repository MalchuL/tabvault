import { afterEach, expect, it, vi } from "vitest";
import { createSessionGroup, sessionName } from "./session";

afterEach(() => vi.unstubAllGlobals());

it("names a session with a readable local timestamp", () => {
  expect(sessionName(new Date(2026, 8, 4, 3, 7))).toBe("Session Sep 04 03:07");
});

it("uses one capture instant for the session name and stored timestamps", () => {
  vi.stubGlobal("crypto", { randomUUID: () => "session-id" });
  const capturedAt = new Date(2026, 8, 4, 3, 7);
  expect(createSessionGroup(capturedAt)).toEqual({
    id: "session-id",
    name: "Session Sep 04 03:07",
    description: "Captured from the browser",
    category: "session",
    accent: "#829b65",
    createdAt: capturedAt.toISOString(),
    updatedAt: capturedAt.toISOString(),
  });
});
