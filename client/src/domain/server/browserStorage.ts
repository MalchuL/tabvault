/** Browser-local library and server settings shared by the web app and extension. */

import {
  emptyBrowserVault,
  isPersistedVault,
  migratePersistedVault,
  type PersistedVault,
} from "@/domain/library/codec";

const TABVAULT_STORAGE_KEY = "tabvault-v3";
const PREVIOUS_TABVAULT_STORAGE_KEY = "tabvault-v2";
const LEGACY_TABVAULT_STORAGE_KEY = "tabvault-v1";
const TABVAULT_SERVER_URL_KEY = "tabvault-local-server-url";
const TABVAULT_API_KEY_KEY = "tabvault-api-key";
const TABVAULT_SYNC_STATUS_KEY = "tabvault-sync-status";
const TABVAULT_STORAGE_MODE_KEY = "tabvault-storage-mode";
const TABVAULT_LIBRARY_REFRESH_INTERVAL_KEY =
  "tabvault-library-refresh-interval";
export const DEFAULT_TABVAULT_SERVER_URL = "http://127.0.0.1:47821";
export const DEFAULT_TABVAULT_API_KEY = "admin";

export type SyncStatus = {
  state: "local_only" | "synced" | "pending";
  localSavedAt: number;
  serverSyncedAt?: number;
};

export type StorageMode = "local" | "backend";

export type BrowserVaultInspection =
  | { status: "empty" }
  | { status: "compatible"; vault: PersistedVault }
  | { status: "incompatible"; raw: unknown; storageKey: string };

/**
 * Inspect all supported storage versions before the app hydrates its vault.
 *
 * @returns {Promise<BrowserVaultInspection>} Inspection result identifying an empty, compatible, or recoverable incompatible vault.
 */
export async function inspectBrowserVault(): Promise<BrowserVaultInspection> {
  if (window.chrome?.storage?.local) {
    const stored = await window.chrome.storage.local.get([
      TABVAULT_STORAGE_KEY,
      PREVIOUS_TABVAULT_STORAGE_KEY,
      LEGACY_TABVAULT_STORAGE_KEY,
    ]);
    const storageKey =
      stored[TABVAULT_STORAGE_KEY] !== undefined
        ? TABVAULT_STORAGE_KEY
        : stored[PREVIOUS_TABVAULT_STORAGE_KEY] !== undefined
          ? PREVIOUS_TABVAULT_STORAGE_KEY
          : stored[LEGACY_TABVAULT_STORAGE_KEY] !== undefined
            ? LEGACY_TABVAULT_STORAGE_KEY
            : null;
    if (!storageKey) return { status: "empty" };
    const raw = stored[storageKey];
    const migrated = migratePersistedVault(raw);
    return migrated
      ? { status: "compatible", vault: migrated }
      : { status: "incompatible", raw, storageKey };
  }
  const storageKey =
    window.localStorage.getItem(TABVAULT_STORAGE_KEY) !== null
      ? TABVAULT_STORAGE_KEY
      : window.localStorage.getItem(PREVIOUS_TABVAULT_STORAGE_KEY) !== null
        ? PREVIOUS_TABVAULT_STORAGE_KEY
        : window.localStorage.getItem(LEGACY_TABVAULT_STORAGE_KEY) !== null
          ? LEGACY_TABVAULT_STORAGE_KEY
          : null;
  if (!storageKey) return { status: "empty" };
  const raw = window.localStorage.getItem(storageKey) ?? "";
  try {
    const value: unknown = JSON.parse(raw);
    const migrated = migratePersistedVault(value);
    return migrated
      ? { status: "compatible", vault: migrated }
      : { status: "incompatible", raw, storageKey };
  } catch {
    return { status: "incompatible", raw, storageKey };
  }
}

/**
 * Load a compatible vault, preserving an incompatible value for recovery.
 *
 * @returns {Promise<PersistedVault | undefined>} Compatible saved vault, or undefined when storage is empty.
 * @throws {Error} When stored data cannot be migrated to schema v3.
 */
export async function readBrowserVault() {
  const inspection = await inspectBrowserVault();
  if (inspection.status === "incompatible")
    throw new Error("Browser library is not schema v3");
  return inspection.status === "compatible" ? inspection.vault : undefined;
}

/**
 * Reject invalid vaults before they can replace a recoverable local copy.
 *
 * @param {PersistedVault} vault - Schema-v3 library to persist.
 * @returns {Promise<void>} Resolves once the validated vault is stored.
 * @throws {Error} When the vault fails schema validation.
 */
export async function writeBrowserVault(vault: PersistedVault) {
  if (!isPersistedVault(vault))
    throw new Error("Refusing to persist an invalid schema-v3 vault");
  if (window.chrome?.storage?.local)
    await window.chrome.storage.local.set({ [TABVAULT_STORAGE_KEY]: vault });
  else window.localStorage.setItem(TABVAULT_STORAGE_KEY, JSON.stringify(vault));
}

/**
 * Read a setting from extension storage with browser local storage as fallback.
 *
 * @param {string} key - Browser storage key.
 * @returns {Promise<unknown>} Stored scalar value, or null/undefined when absent.
 */
async function readStoredValue(key: string): Promise<unknown> {
  const stored = await window.chrome?.storage?.local?.get(key);
  return stored?.[key] ?? window.localStorage.getItem(key);
}

/**
 * Store scalar settings and sync status in the available browser store.
 *
 * @param {string} key - Browser storage key.
 * @param {string | number | SyncStatus} value - Scalar or sync-status value to store.
 * @returns {Promise<void>} Resolves once the setting is stored.
 */
async function writeStoredValue(
  key: string,
  value: string | number | SyncStatus
): Promise<void> {
  if (window.chrome?.storage?.local)
    await window.chrome.storage.local.set({ [key]: value });
  else
    window.localStorage.setItem(
      key,
      typeof value === "string" ? value : JSON.stringify(value)
    );
}

/**
 * Read the last local/server synchronization outcome.
 *
 * @returns {Promise<SyncStatus | undefined>} Saved sync status, or undefined when none exists.
 */
export async function readSyncStatus() {
  const saved = await readStoredValue(TABVAULT_SYNC_STATUS_KEY);
  if (typeof saved === "string") {
    try {
      return JSON.parse(saved) as SyncStatus;
    } catch {
      return undefined;
    }
  }
  if (saved && typeof saved === "object") return saved as SyncStatus;
  return undefined;
}

/**
 * Persist the last local/server synchronization outcome.
 *
 * @param {SyncStatus} status - Sync status to persist.
 * @returns {Promise<void>} Resolves once sync status is stored.
 */
export async function writeSyncStatus(status: SyncStatus) {
  await writeStoredValue(TABVAULT_SYNC_STATUS_KEY, status);
}

/**
 * Select local mode unless the user explicitly configured the backend.
 *
 * @returns {Promise<StorageMode>} Configured storage mode, defaulting to browser-local storage.
 */
export async function readStorageMode(): Promise<StorageMode> {
  const configured = await readStoredValue(TABVAULT_STORAGE_MODE_KEY);
  return configured === "backend" ? "backend" : "local";
}

/**
 * Persist the selected library storage mode.
 *
 * @param {StorageMode} mode - Storage mode to persist.
 * @returns {Promise<void>} Resolves once the storage mode is saved.
 */
export async function writeStorageMode(mode: StorageMode) {
  await writeStoredValue(TABVAULT_STORAGE_MODE_KEY, mode);
}

/**
 * Resolve the configured server URL, removing trailing slashes.
 *
 * @returns {Promise<string>} Configured local-server URL or its default.
 */
export async function readLocalServerUrl() {
  const configured = await readStoredValue(TABVAULT_SERVER_URL_KEY);
  return typeof configured === "string" && configured.trim()
    ? configured.replace(/\/+$/, "")
    : DEFAULT_TABVAULT_SERVER_URL;
}

/**
 * Persist a server URL without trailing slashes.
 *
 * @param {string} url - Absolute HTTP(S) server or page URL.
 * @returns {Promise<void>} Resolves once the server URL is saved.
 */
export async function writeLocalServerUrl(url: string) {
  const value = url.replace(/\/+$/, "");
  await writeStoredValue(TABVAULT_SERVER_URL_KEY, value);
}

/**
 * Resolve the configured local API key.
 *
 * @returns {Promise<string>} Configured API key or its local default.
 */
export async function readApiKey() {
  const configured = await readStoredValue(TABVAULT_API_KEY_KEY);
  return typeof configured === "string" && configured.trim()
    ? configured
    : DEFAULT_TABVAULT_API_KEY;
}

/**
 * Persist the local API key, using the local default for empty input.
 *
 * @param {string} key - Browser storage key.
 * @returns {Promise<void>} Resolves once the API key is saved.
 */
export async function writeApiKey(key: string) {
  const value = key || DEFAULT_TABVAULT_API_KEY;
  await writeStoredValue(TABVAULT_API_KEY_KEY, value);
}

/**
 * Return zero when automatic refresh is disabled or misconfigured.
 *
 * @returns {Promise<number>} Saved automatic refresh interval in seconds.
 */
export async function readLibraryRefreshInterval(): Promise<number> {
  const configured = await readStoredValue(
    TABVAULT_LIBRARY_REFRESH_INTERVAL_KEY
  );
  const seconds = Number(configured);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

/**
 * Round and clamp the automatic library refresh interval.
 *
 * @param {number} seconds - Refresh interval in seconds.
 * @returns {Promise<void>} Resolves once the interval is stored.
 */
export async function writeLibraryRefreshInterval(seconds: number) {
  const value = Math.max(0, Math.round(seconds));
  await writeStoredValue(TABVAULT_LIBRARY_REFRESH_INTERVAL_KEY, value);
}

/**
 * Clear every vault version, then create an empty recoverable library.
 *
 * @returns {Promise<void>} Resolves after browser-local library data is cleared.
 */
export async function clearBrowserLibrary() {
  if (window.chrome?.storage?.local) {
    await window.chrome.storage.local.remove([
      TABVAULT_STORAGE_KEY,
      PREVIOUS_TABVAULT_STORAGE_KEY,
      LEGACY_TABVAULT_STORAGE_KEY,
    ]);
  } else {
    window.localStorage.removeItem(TABVAULT_STORAGE_KEY);
    window.localStorage.removeItem(PREVIOUS_TABVAULT_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_TABVAULT_STORAGE_KEY);
  }
  await writeBrowserVault(emptyBrowserVault());
  await writeSyncStatus({
    state: "local_only",
    localSavedAt: Date.now(),
  });
}
