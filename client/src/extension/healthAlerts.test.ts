import { afterEach, expect, it, vi } from "vitest";
import {
  HEALTH_ALARM_NAME,
  restoreHealthAlarm,
  runIndexHealthAlert,
} from "./healthAlerts";

afterEach(() => vi.unstubAllGlobals());

it("restores an alert alarm only when schedule and notifications are enabled", async () => {
  const stored = {
    "tabvault-health-alert": {
      enabled: true,
      notifyOnNeedsAttention: true,
      intervalMinutes: 15,
    },
  };
  const create = vi.fn();
  const clear = vi.fn();
  vi.stubGlobal("chrome", {
    storage: { local: { get: vi.fn().mockResolvedValue(stored) } },
    alarms: { create, clear },
  });

  await restoreHealthAlarm();
  expect(create).toHaveBeenCalledWith(HEALTH_ALARM_NAME, {
    periodInMinutes: 15,
  });

  stored["tabvault-health-alert"].notifyOnNeedsAttention = false;
  await restoreHealthAlarm();
  expect(clear).toHaveBeenCalledWith(HEALTH_ALARM_NAME);
});

it("notifies only when the index check reports attention", async () => {
  const create = vi.fn();
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({
          "tabvault-health-alert": {
            enabled: true,
            notifyOnNeedsAttention: true,
            serverUrl: "http://127.0.0.1:47821",
            apiKey: "test-key",
          },
        }),
      },
    },
    notifications: { create },
  });
  const fetch = vi.fn().mockResolvedValue({
    json: async () => ({ data: { lastResult: "needs_attention" } }),
  });
  vi.stubGlobal("fetch", fetch);

  await runIndexHealthAlert();
  expect(fetch).toHaveBeenCalledWith(
    "http://127.0.0.1:47821/api/v1/index/health-check/run",
    expect.objectContaining({ headers: { "X-API-Key": "test-key" } })
  );
  expect(create).toHaveBeenCalledOnce();

  fetch.mockRejectedValueOnce(new Error("server stopped"));
  await runIndexHealthAlert();
  expect(create).toHaveBeenCalledOnce();
});
