/**
 * Product UX redesign reminder: Settings is configuration-only. Operational
 * readiness and maintenance belong to Dashboard, leaving this page calm.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  BellRing,
  BrainCircuit,
  CheckCircle2,
  Eraser,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  checkLocalServer,
  clearBrowserLibrary,
  clearLibraryOnServer,
  configureExtensionLibraryRefresh,
  configureIndexHealthCheck,
  DEFAULT_TABVAULT_API_KEY,
  DEFAULT_TABVAULT_SERVER_URL,
  readApiKey,
  readLibraryRefreshInterval,
  readLocalServerUrl,
  readStorageMode,
  refreshLibraryFromServer,
  writeApiKey,
  writeLibraryRefreshInterval,
  writeLocalServerUrl,
  writeStorageMode,
  type SemanticIndexStatus,
  type StorageMode,
} from "@/lib/extension";
import {
  emptyBrowserVault,
  LIBRARY_REFRESH_INTERVALS,
  type PersistedVault,
} from "@/lib/library";
import { BrowserStorageAdapter } from "@/lib/persistence";

const logoUrl = "/icon-128.png";

export default function Settings() {
  const [, setLocation] = useLocation();
  const [serverUrl, setServerUrl] = useState(DEFAULT_TABVAULT_SERVER_URL);
  const [apiKey, setApiKey] = useState(DEFAULT_TABVAULT_API_KEY);
  const [storageMode, setStorageMode] = useState<StorageMode>("local");
  const [online, setOnline] = useState(false);
  const [indexStatus, setIndexStatus] = useState<SemanticIndexStatus | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshingLibrary, setIsRefreshingLibrary] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [pendingClear, setPendingClear] = useState<
    "browser" | "server" | "both" | null
  >(null);
  const [isClearing, setIsClearing] = useState(false);

  const refresh = async (url = serverUrl, key = apiKey, announce = true) => {
    try {
      const health = await checkLocalServer(url, key);
      setOnline(health.status === "ok");
      setIndexStatus(health.semanticIndex ?? null);
      if (!announce) return;
      if (health.status === "ok") {
        toast.success("TabVault server is connected", {
          description: `Schema v${health.schemaVersion} is ready at ${url}.`,
        });
      } else {
        toast.error("The TabVault server is unavailable");
      }
    } catch {
      setOnline(false);
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
      try {
        const health = await checkLocalServer(url, key);
        setOnline(health.status === "ok");
        setIndexStatus(health.semanticIndex ?? null);
      } catch {
        setOnline(false);
        setIndexStatus(null);
      }
    });
  }, []);

  const saveConnection = async () => {
    setIsSaving(true);
    try {
      await writeLocalServerUrl(serverUrl);
      await writeApiKey(apiKey);
      await writeStorageMode(storageMode);
      await refresh(serverUrl, apiKey, false);
      toast.success("Connection settings saved");
    } finally {
      setIsSaving(false);
    }
  };

  const scheduleHealthCheck = async (intervalSeconds: number) => {
    if (!online) {
      toast.error("Connect the TabVault server before scheduling checks");
      return;
    }
    try {
      const healthCheck = await configureIndexHealthCheck(
        serverUrl,
        intervalSeconds,
        Boolean(indexStatus?.healthCheck?.notifyOnNeedsAttention),
        apiKey
      );
      setIndexStatus(current =>
        current ? { ...current, healthCheck } : current
      );
      toast.success(
        intervalSeconds ? "Index check scheduled" : "Index check disabled"
      );
    } catch {
      toast.error("Could not update the health-check schedule");
    }
  };

  const updateAlerts = async (enabled: boolean) => {
    if (!online) return;
    try {
      const healthCheck = await configureIndexHealthCheck(
        serverUrl,
        indexStatus?.healthCheck?.intervalSeconds ?? 0,
        enabled,
        apiKey
      );
      setIndexStatus(current =>
        current ? { ...current, healthCheck } : current
      );
    } catch {
      toast.error("Could not update local alerts");
    }
  };

  const refreshLibrary = async () => {
    if (!online) {
      toast.error("Connect the TabVault server before refreshing the library");
      return;
    }
    setIsRefreshingLibrary(true);
    try {
      const local =
        (await new BrowserStorageAdapter<PersistedVault>().load()) ??
        emptyBrowserVault();
      const { vault } = await refreshLibraryFromServer(
        serverUrl,
        apiKey,
        local
      );
      await new BrowserStorageAdapter<PersistedVault>().save(vault);
      toast.success("Library refreshed", {
        description: `${vault.tabs.length} tabs and ${vault.vaultGroups.length} collections are merged with the server.`,
      });
    } catch {
      toast.error("Could not refresh tabs and collections");
    } finally {
      setIsRefreshingLibrary(false);
    }
  };

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
    <main className="min-h-screen bg-[#f6f3ec] px-5 py-6 text-[#18261f] paper-grain sm:px-8 lg:px-12">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between border-b border-[#dcd7cc] pb-5">
          <button
            onClick={() => setLocation("/")}
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#687067] hover:text-[#e95224]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to library
          </button>
          <div className="flex items-center gap-2">
            <img src={logoUrl} alt="TabVault" className="h-7 w-7" />
            <span className="font-['DM_Sans'] text-[15px] font-bold tracking-[-0.05em] text-[#29342d]">
              tabvault
            </span>
          </div>
        </header>

        <section className="mt-10 max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#8e9189]">
            Configuration
          </p>
          <h1 className="mt-2 font-['DM_Sans'] text-4xl font-bold tracking-[-0.06em] sm:text-5xl">
            Settings
          </h1>
          <p className="mt-3 max-w-xl text-[13px] leading-6 text-[#697068]">
            Configure the server and background preferences. Review library
            readiness and maintenance in Dashboard.
          </p>
        </section>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <section className="border border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_8px_24px_rgba(24,38,31,0.035)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
                  <Server className="h-3.5 w-3.5" /> API connection
                </p>
                <h2 className="mt-2 text-[16px] font-bold">
                  {storageMode === "backend"
                    ? online
                      ? "Backend preferred"
                      : "Backend preferred · local fallback"
                    : "Local only"}
                </h2>
              </div>
              <span
                className={`mt-1 h-2.5 w-2.5 rounded-full ${online ? "bg-[#6e9870]" : "bg-[#c95f46]"}`}
              />
            </div>
            <fieldset className="mt-5 border-t border-[#e8e3d8] pt-4">
              <legend className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#858980]">
                Storage mode
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ["local", "Local only"],
                    ["backend", "Backend preferred"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setStorageMode(mode)}
                    aria-pressed={storageMode === mode}
                    className={`border px-2 py-2 text-left font-mono text-[8px] uppercase tracking-[0.06em] ${storageMode === mode ? "border-[#e95224] bg-[#fff0ea] text-[#c84b26]" : "border-[#ded9cd] text-[#697068] hover:bg-[#f9f7f1]"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-5 text-[#767b73]">
                {storageMode === "backend"
                  ? "Changes are saved locally first, then pushed when this server is reachable."
                  : "Links stay only in this browser or extension profile."}
              </p>
            </fieldset>
            <label className="mt-5 block">
              <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#858980]">
                API endpoint
              </span>
              <input
                value={serverUrl}
                onChange={event => setServerUrl(event.target.value)}
                className="mt-1.5 w-full border-b border-[#cfc9bc] bg-[#f9f7f1] px-2 py-2 font-mono text-[11px] outline-none focus:border-[#e95224]"
              />
            </label>
            <label className="mt-4 block">
              <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#858980]">
                API key
              </span>
              <input
                value={apiKey}
                onChange={event => setApiKey(event.target.value)}
                type="password"
                className="mt-1.5 w-full border-b border-[#cfc9bc] bg-[#f9f7f1] px-2 py-2 font-mono text-[11px] outline-none focus:border-[#e95224]"
              />
            </label>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => void saveConnection()}
                disabled={isSaving}
                className="rounded bg-[#e95224] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-white hover:bg-[#d94a1e] disabled:bg-[#c8c1b6]"
              >
                {isSaving ? "Saving…" : "Save & check"}
              </button>
              <button
                onClick={() => void refresh()}
                className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#687067] hover:text-[#e95224]"
              >
                Check now
              </button>
            </div>
          </section>

          <section className="border border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_8px_24px_rgba(24,38,31,0.035)]">
            <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
              <BrainCircuit className="h-3.5 w-3.5" /> Semantic mode
            </p>
            <h2 className="mt-2 text-[16px] font-bold">
              {indexStatus?.status === "ready"
                ? "Meaning-based search is enabled"
                : "Keyword search is active"}
            </h2>
            <p className="mt-4 text-[12px] leading-5 text-[#697068]">
              Semantic search uses a local embedding model when the configured
              server has a ready index. Otherwise, TabVault searches titles,
              notes, and tags.
            </p>
            <button
              onClick={() => setLocation("/dashboard")}
              className="mt-5 inline-flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#536057] hover:text-[#e95224]"
            >
              Review index status →
            </button>
          </section>

          <section className="border border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_8px_24px_rgba(24,38,31,0.035)]">
            <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
              <ShieldCheck className="h-3.5 w-3.5" /> Index health
            </p>
            <h2 className="mt-2 text-[16px] font-bold">
              {indexStatus?.healthCheck?.enabled
                ? `Every ${Math.round(indexStatus.healthCheck.intervalSeconds / 60)} minutes`
                : "Manual checks"}
            </h2>
            <div className="mt-5 grid grid-cols-4 gap-2">
              {[
                [0, "Off"],
                [900, "15m"],
                [3600, "1h"],
                [14400, "4h"],
              ].map(([seconds, label]) => (
                <button
                  key={String(seconds)}
                  onClick={() => void scheduleHealthCheck(Number(seconds))}
                  className={`border px-2 py-2 font-mono text-[9px] uppercase ${indexStatus?.healthCheck?.intervalSeconds === seconds || (!seconds && !indexStatus?.healthCheck?.enabled) ? "border-[#e95224] bg-[#fff0ea] text-[#c84b26]" : "border-[#ded9cd] text-[#767b73] hover:bg-[#f9f7f1]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-5 text-[11px] leading-5 text-[#767b73]">
              Run a manual check and view recovery steps in Dashboard.
            </p>
          </section>

          <section className="border border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_8px_24px_rgba(24,38,31,0.035)]">
            <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
              <BellRing className="h-3.5 w-3.5" /> Local alerts
            </p>
            <h2 className="mt-2 text-[16px] font-bold">
              {indexStatus?.healthCheck?.notifyOnNeedsAttention
                ? "Notify on attention"
                : "Quiet mode"}
            </h2>
            <label
              className={`mt-5 flex items-center gap-3 border-t border-[#e8e3d8] pt-4 text-[12px] ${indexStatus?.healthCheck?.enabled ? "text-[#4d5c51]" : "text-[#989b94]"}`}
            >
              <input
                type="checkbox"
                checked={Boolean(
                  indexStatus?.healthCheck?.notifyOnNeedsAttention
                )}
                disabled={!online || !indexStatus?.healthCheck?.enabled}
                onChange={event => void updateAlerts(event.target.checked)}
                className="h-4 w-4 accent-[#e95224]"
              />
              Alert when a scheduled check needs attention
            </label>
            <p className="mt-3 text-[11px] leading-5 text-[#767b73]">
              Alerts stay local to the configured TabVault service and browser
              context.
            </p>
          </section>

          <section className="border border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_8px_24px_rgba(24,38,31,0.035)]">
            <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
              <RefreshCw className="h-3.5 w-3.5" /> Library refresh
            </p>
            <h2 className="mt-2 text-[16px] font-bold">
              {refreshInterval
                ? `Every ${refreshInterval >= 3600 ? `${refreshInterval / 3600} hour` : `${refreshInterval / 60} min`}`
                : "Manual refresh"}
            </h2>
            <p className="mt-4 text-[12px] leading-5 text-[#697068]">
              Pull the server library and merge it with tabs and collections
              already stored in this browser or extension.
            </p>
            <div className="mt-5 grid grid-cols-5 gap-2">
              {LIBRARY_REFRESH_INTERVALS.map(({ seconds, label }) => (
                <button
                  key={String(seconds)}
                  onClick={() => void saveRefreshInterval(seconds)}
                  className={`border px-2 py-2 font-mono text-[9px] uppercase ${refreshInterval === seconds || (!seconds && !refreshInterval) ? "border-[#e95224] bg-[#fff0ea] text-[#c84b26]" : "border-[#ded9cd] text-[#767b73] hover:bg-[#f9f7f1]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => void refreshLibrary()}
              disabled={isRefreshingLibrary || !online}
              className="mt-5 rounded bg-[#e95224] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-white hover:bg-[#d94a1e] disabled:bg-[#c8c1b6]"
            >
              {isRefreshingLibrary ? "Refreshing…" : "Refresh library now"}
            </button>
          </section>

          <section className="border border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_8px_24px_rgba(24,38,31,0.035)] lg:col-span-2">
            <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
              <Trash2 className="h-3.5 w-3.5" /> Clear data
            </p>
            <h2 className="mt-2 text-[16px] font-bold">
              Remove saved tabs and collections
            </h2>
            <p className="mt-4 max-w-2xl text-[12px] leading-5 text-[#697068]">
              Clearing the browser library empties this profile. Refreshing
              later can restore the server copy. Clearing the server writes an
              empty library after a backup; this browser can upload its copy
              again on the next sync. Use Clear both to wipe both copies.
              Connection settings are kept.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={() => setPendingClear("browser")}
                className="inline-flex items-center gap-1.5 border border-[#ded9cd] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[#687067] hover:border-[#c95f46] hover:text-[#c95f46]"
              >
                <Eraser className="h-3.5 w-3.5" /> Clear browser library
              </button>
              <button
                onClick={() => setPendingClear("server")}
                className="inline-flex items-center gap-1.5 border border-[#ded9cd] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[#687067] hover:border-[#c95f46] hover:text-[#c95f46]"
              >
                <Server className="h-3.5 w-3.5" /> Clear server library
              </button>
              <button
                onClick={() => setPendingClear("both")}
                className="inline-flex items-center gap-1.5 border border-[#c95f46] bg-[#fff0ea] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[#c84b26] hover:bg-[#ffe4d8]"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear both
              </button>
            </div>
            {pendingClear && (
              <div className="mt-5 border border-[#e8cfc4] bg-[#fff7f3] p-4">
                <p className="text-[13px] font-bold text-[#8a3a28]">
                  {pendingClear === "both"
                    ? "Clear this browser and the server library?"
                    : pendingClear === "server"
                      ? "Clear every tab and collection on the server?"
                      : "Clear every tab and collection in this browser?"}
                </p>
                <p className="mt-2 text-[12px] leading-5 text-[#7a5348]">
                  This cannot be undone from Settings
                  {pendingClear !== "browser"
                    ? ", though the server keeps a timestamped backup."
                    : "."}
                </p>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => void clearData()}
                    disabled={isClearing}
                    className="rounded bg-[#c95f46] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-white hover:bg-[#b4533e] disabled:bg-[#c8c1b6]"
                  >
                    {isClearing ? "Clearing…" : "Confirm clear"}
                  </button>
                  <button
                    onClick={() => setPendingClear(null)}
                    className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#687067] hover:text-[#e95224]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="mt-8 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#718076]">
          <CheckCircle2 className="h-3.5 w-3.5 text-[#6e9870]" /> Browser
          storage remains available when the server is offline.
        </div>
      </div>
    </main>
  );
}
