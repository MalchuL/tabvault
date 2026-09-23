/** Index-health alarm persistence and notification delivery for the extension worker. */

type HealthAlertSettings = {
  enabled?: boolean;
  notifyOnNeedsAttention?: boolean;
  intervalMinutes?: number;
  serverUrl?: string;
  apiKey?: string;
};

const HEALTH_ALERT_KEY = "tabvault-health-alert";
export const HEALTH_ALARM_NAME = "tabvault-index-health";

/**
 * Recreate or clear the index-health alarm from persisted settings.
 * @returns {Promise<void>} Resolves after the alarm state is updated.
 */
export async function restoreHealthAlarm() {
  const stored = await chrome.storage.local.get(HEALTH_ALERT_KEY);
  const settings = stored[HEALTH_ALERT_KEY] as HealthAlertSettings | undefined;
  if (
    !settings?.enabled ||
    !settings?.notifyOnNeedsAttention ||
    !settings?.intervalMinutes
  ) {
    await chrome.alarms.clear(HEALTH_ALARM_NAME);
    return;
  }
  chrome.alarms.create(HEALTH_ALARM_NAME, {
    periodInMinutes: Math.max(1, settings.intervalMinutes),
  });
}

/**
 * Persist alert preferences and update the alarm to match them.
 * @param {HealthAlertSettings} settings - Interval, notification preference, and API connection.
 * @returns {Promise<void>} Resolves after storage and alarm update.
 */
export async function configureHealthAlerts(
  settings: HealthAlertSettings
): Promise<void> {
  await chrome.storage.local.set({ [HEALTH_ALERT_KEY]: settings });
  await restoreHealthAlarm();
}

/**
 * Check index health and notify only when the connected API reports attention is needed.
 * A stopped local server leaves the user quiet until the next scheduled check.
 * @returns {Promise<void>} Resolves after a check or a skipped offline attempt.
 */
export async function runIndexHealthAlert(): Promise<void> {
  const stored = await chrome.storage.local.get(HEALTH_ALERT_KEY);
  const settings = stored[HEALTH_ALERT_KEY] as HealthAlertSettings | undefined;
  if (
    !settings?.enabled ||
    !settings?.notifyOnNeedsAttention ||
    !settings?.serverUrl
  )
    return;
  try {
    const response = await fetch(
      `${settings.serverUrl.replace(/\/+$/, "")}/api/v1/index/health-check/run`,
      {
        method: "POST",
        headers: { "X-API-Key": settings.apiKey || "admin" },
      }
    );
    const payload = await response.json();
    const result = payload.data || payload;
    if (result.lastResult === "needs_attention") {
      chrome.notifications.create("tabvault-index-attention", {
        type: "basic",
        iconUrl: "icon-128.png",
        title: "TabVault index needs attention",
        message:
          "Your local semantic index is unavailable or needs a rebuild. Open TabVault to review it.",
      });
    }
  } catch {
    // The server is local and may be intentionally stopped; an alert should not be created for a missing local process.
  }
}
