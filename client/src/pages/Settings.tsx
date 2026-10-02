/**
 * Product UX redesign reminder: Settings is configuration-only. Operational
 * readiness and maintenance belong to Dashboard, leaving this page calm.
 */
import {
  StorageConnectionPanel,
  SemanticStatusPanel,
  IndexHealthPanel,
  LocalAlertsPanel,
  LibraryRefreshPanel,
  ClearDataPanel,
} from "@/components/settings/SettingsPanels";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useLibrary } from "@/domain/library/library-context";
import {
  clearLibraryOnServer,
  refreshLibraryFromServer,
} from "@/domain/server/libraryApi";
import {
  configureIndexHealthCheck,
  loadServerSearchState,
  type SemanticIndexStatus,
  type ServerCapabilities,
} from "@/domain/server/search";
import {
  configureExtensionHealthAlerts,
  configureExtensionLibraryRefresh,
} from "@/extension/bridge";
import {
  clearBrowserLibrary,
  DEFAULT_TABVAULT_API_KEY,
  DEFAULT_TABVAULT_SERVER_URL,
  readApiKey,
  readLibraryRefreshInterval,
  readLocalServerUrl,
  readStorageMode,
  writeApiKey,
  writeLibraryRefreshInterval,
  writeLocalServerUrl,
  writeStorageMode,
  type StorageMode,
} from "@/domain/server/browserStorage";
import { emptyBrowserVault } from "@/domain/library/codec";

/**
 * Configure storage, local-server access, refresh, and index health alerts.
 * Keeps maintenance actions separate from normal library browsing.
 * @returns {JSX.Element} Settings controls and their current status.
 */
export default function Settings() {
  const [, setLocation] = useLocation();
  const { vault, dispatch } = useLibrary();
  const [serverUrl, setServerUrl] = useState(DEFAULT_TABVAULT_SERVER_URL);
  const [apiKey, setApiKey] = useState(DEFAULT_TABVAULT_API_KEY);
  const [storageMode, setStorageMode] = useState<StorageMode>("local");
  const [online, setOnline] = useState(false);
  const [indexStatus, setIndexStatus] = useState<SemanticIndexStatus | null>(
    null
  );
  const [capabilities, setCapabilities] = useState<ServerCapabilities | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshingLibrary, setIsRefreshingLibrary] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [pendingClear, setPendingClear] = useState<
    "browser" | "server" | "both" | null
  >(null);
  const [isClearing, setIsClearing] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const isBackendMode = storageMode === "backend";

  /**
   * Apply a server search-status snapshot.
   *
   * Update online, capability, and index-health state together.
   * @param {{ online: boolean; schemaVersion?: number; capabilities: ServerCapabilities | null; indexStatus: SemanticIndexStatus | null; }} state - Server connectivity and search state to display.
   */
  const applySearchState = (state: {
    online: boolean;
    schemaVersion?: number;
    capabilities: ServerCapabilities | null;
    indexStatus: SemanticIndexStatus | null;
  }) => {
    setOnline(state.online);
    setCapabilities(state.capabilities);
    setIndexStatus(state.indexStatus);
  };

  /**
   * Reload connectivity and search status.
   *
   * Optionally announce whether the configured server is reachable; clear stale status on failure.
   * @param {string} url - Server URL to check.
   * @param {string} key - API key for the request.
   * @param {boolean} announce - Whether to show a status toast.
   * @returns {Promise<void>} Resolves after the connectivity check.
   */
  const refresh = async (url = serverUrl, key = apiKey, announce = true) => {
    try {
      const state = await loadServerSearchState(url, key);
      applySearchState(state);
      if (!announce) return;
      if (state.online) {
        toast.success("TabVault server is connected", {
          description: `Schema v${state.schemaVersion} is ready at ${url}.`,
        });
      } else {
        toast.error("The TabVault server is unavailable");
      }
    } catch {
      setOnline(false);
      setCapabilities(null);
      setIndexStatus(null);
      if (announce) toast.error("The TabVault server is unavailable");
    }
  };

  useEffect(() => {
    void Promise.all([
      readLocalServerUrl(),
      readApiKey(),
      readStorageMode(),
      readLibraryRefreshInterval(),
    ]).then(async ([url, key, mode, interval]) => {
      setServerUrl(url);
      setApiKey(key);
      setStorageMode(mode);
      setRefreshInterval(interval);
      if (mode !== "backend") {
        setOnline(false);
        setCapabilities(null);
        setIndexStatus(null);
        return;
      }
      try {
        applySearchState(await loadServerSearchState(url, key));
      } catch {
        setOnline(false);
        setCapabilities(null);
        setIndexStatus(null);
      }
    });
  }, []);

  /**
   * Persist storage and connection settings.
   *
   * Save the selected mode, and test the server credentials when backend mode is selected.
   * @returns {Promise<void>} Resolves after settings are saved and checked.
   */
  const saveConnection = async () => {
    setIsSaving(true);
    try {
      await writeStorageMode(storageMode);
      if (storageMode !== "backend") {
        setOnline(false);
        setCapabilities(null);
        setIndexStatus(null);
        toast.success("Storage settings saved");
        return;
      }
      await writeLocalServerUrl(serverUrl);
      await writeApiKey(apiKey);
      await refresh(serverUrl, apiKey, false);
      toast.success("Connection settings saved");
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Set the server index-health schedule.
   *
   * Mirror the resulting schedule to extension alerts when the server is online.
   * @param {number} intervalSeconds - Seconds between checks, or zero to disable them.
   * @returns {Promise<void>} Resolves after the schedule attempt.
   */
  const scheduleHealthCheck = async (intervalSeconds: number) => {
    if (!online) {
      toast.error("Connect the TabVault server before scheduling checks");
      return;
    }
    try {
      const healthCheck = await configureIndexHealthCheck(
        serverUrl,
        intervalSeconds,
        Boolean(indexStatus?.diagnostics.healthCheck?.notifyOnNeedsAttention),
        apiKey
      );
      setIndexStatus(current =>
        current ? { ...current, healthCheck } : current
      );
      void configureExtensionHealthAlerts(serverUrl, healthCheck, apiKey).catch(
        () => toast.error("Could not update Chrome health alerts")
      );
      toast.success(
        intervalSeconds ? "Index check scheduled" : "Index check disabled"
      );
    } catch {
      toast.error("Could not update the health-check schedule");
    }
  };

  /**
   * Enable or disable index-health alerts.
   *
   * Keep the server schedule and extension alarm configuration in sync.
   * @param {boolean} enabled - Whether Chrome should notify when the index needs attention.
   * @returns {Promise<void>} Resolves after the alert update attempt.
   */
  const updateAlerts = async (enabled: boolean) => {
    if (!online) return;
    try {
      const healthCheck = await configureIndexHealthCheck(
        serverUrl,
        indexStatus?.diagnostics.healthCheck?.intervalSeconds ?? 0,
        enabled,
        apiKey
      );
      setIndexStatus(current =>
        current ? { ...current, healthCheck } : current
      );
      void configureExtensionHealthAlerts(serverUrl, healthCheck, apiKey).catch(
        () => toast.error("Could not update Chrome health alerts")
      );
    } catch {
      toast.error("Could not update local alerts");
    }
  };

  /**
   * Merge the browser library with the server.
   *
   * Replace displayed state with the refreshed vault and report errors to the user.
   * @returns {Promise<void>} Resolves after the refresh attempt.
   */
  const refreshLibrary = async () => {
    if (!online) {
      toast.error("Connect the TabVault server before refreshing the library");
      return;
    }
    setIsRefreshingLibrary(true);
    try {
      const { vault: refreshedVault } = await refreshLibraryFromServer(
        serverUrl,
        apiKey,
        vault
      );
      dispatch({ type: "replace", vault: refreshedVault });
      toast.success("Library refreshed", {
        description: `${refreshedVault.library.tabs.length} tabs and ${refreshedVault.library.vaultGroups.length} collections are merged with the server.`,
      });
    } catch {
      toast.error("Could not refresh tabs and collections");
    } finally {
      setIsRefreshingLibrary(false);
    }
  };

  /**
   * Persist the automatic library refresh interval.
   *
   * Update browser storage and the extension alarm to use the same value.
   * @param {number} seconds - Seconds between refreshes, or zero to disable them.
   * @returns {Promise<void>} Resolves after both settings are written.
   */
  const saveRefreshInterval = async (seconds: number) => {
    setRefreshInterval(seconds);
    await writeLibraryRefreshInterval(seconds);
    await configureExtensionLibraryRefresh(seconds);
    toast.success(
      seconds
        ? `Automatic refresh every ${seconds >= 3600 ? `${seconds / 3600}h` : `${seconds / 60}m`}`
        : "Automatic library refresh disabled"
    );
  };

  /**
   * Clear the selected library stores.
   *
   * Clear browser data, server data, or both according to the confirmed selection; preserve browser clearing when the server is offline.
   * @returns {Promise<void>} Resolves after the requested stores are cleared or an error is reported.
   */
  const clearData = async () => {
    if (!pendingClear) return;
    setIsClearing(true);
    try {
      const shouldClearServer =
        pendingClear === "server" || pendingClear === "both";
      const shouldClearBrowser =
        pendingClear === "browser" || pendingClear === "both";
      if (shouldClearServer) {
        if (!online) {
          toast.error("Connect the TabVault server before clearing it");
          if (!shouldClearBrowser) return;
        } else {
          await clearLibraryOnServer(serverUrl, apiKey);
        }
      }
      if (shouldClearBrowser) {
        await clearBrowserLibrary();
        dispatch({ type: "replace", vault: emptyBrowserVault() });
      }
      toast.success(
        pendingClear === "both"
          ? online
            ? "Browser and server libraries were cleared"
            : "Browser library was cleared; the server was unavailable"
          : pendingClear === "server"
            ? "Server library was cleared"
            : "Browser library was cleared"
      );
      setPendingClear(null);
    } catch {
      toast.error("Could not clear the selected library");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <main className="min-h-dvh bg-[#f6f3ec] px-5 py-6 text-[#18261f] sm:px-8 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <section className="max-w-2xl">
          <h1 className="font-['DM_Sans'] text-2xl font-bold tracking-[-0.04em]">
            Settings
          </h1>
        </section>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <StorageConnectionPanel
            storage={{
              storageMode: storageMode,
              onStorageModeChange: mode => {
                setStorageMode(mode);
                if (
                  mode === "local" &&
                  pendingClear &&
                  pendingClear !== "browser"
                )
                  setPendingClear(null);
              },
            }}
            connection={{
              online: online,
              isSaving: isSaving,
              onSave: () => void saveConnection(),
              onCheck: () => void refresh(),
            }}
            credentials={{
              serverUrl: serverUrl,
              apiKey: apiKey,
              showApiKey: showApiKey,
              onServerUrlChange: setServerUrl,
              onApiKeyChange: setApiKey,
              onToggleApiKey: () => setShowApiKey(visible => !visible),
            }}
          />

          {isBackendMode && (
            <>
              <SemanticStatusPanel
                indexStatus={indexStatus}
                capabilities={capabilities}
                onReviewIndex={() => setLocation("/dashboard")}
              />

              <IndexHealthPanel
                indexStatus={indexStatus}
                onSchedule={seconds => void scheduleHealthCheck(seconds)}
              />

              <LocalAlertsPanel
                indexStatus={indexStatus}
                online={online}
                onAlertsChange={enabled => void updateAlerts(enabled)}
              />

              <LibraryRefreshPanel
                refreshInterval={refreshInterval}
                online={online}
                isRefreshingLibrary={isRefreshingLibrary}
                onIntervalChange={seconds => void saveRefreshInterval(seconds)}
                onRefresh={() => void refreshLibrary()}
              />
            </>
          )}

          <ClearDataPanel
            isBackendMode={isBackendMode}
            pendingClear={pendingClear}
            isClearing={isClearing}
            onPendingClearChange={setPendingClear}
            onConfirmClear={() => void clearData()}
          />
        </div>

        <div className="mt-8 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#718076]">
          <CheckCircle2 className="h-3.5 w-3.5 text-[#6e9870]" />{" "}
          {isBackendMode
            ? "Browser storage remains available when the server is offline."
            : "This library stays in this browser until you enable a backend."}
        </div>
      </div>
    </main>
  );
}
