import { IconButton } from "@/components/shared/IconButton";
/**
 * Product UX redesign reminder: Dashboard is the calm operational companion to
 * the Library. It explains data safety and search readiness without inserting
 * maintenance controls into daily tab work.
 */
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  Check,
  CloudOff,
  Database,
  FolderTree,
  HardDrive,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  Tags,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CapabilityIssue } from "@/components/shared/CapabilityIssue";
import { useLibrary } from "@/domain/library/library-context";
import {
  blockingSearchCapability,
  loadServerSearchState,
  rebuildSemanticIndex,
  runIndexHealthCheck,
  type SemanticIndexStatus,
  type ServerCapabilities,
} from "@/domain/server/search";
import {
  DEFAULT_TABVAULT_API_KEY,
  DEFAULT_TABVAULT_SERVER_URL,
  readApiKey,
  readLocalServerUrl,
  readSyncStatus,
  type SyncStatus,
} from "@/domain/server/browserStorage";

/**
 * Describe the last local save in coarse human-readable time units.
 * Future clock skew is clamped to zero elapsed time.
 * @param {number | undefined} timestamp - Save time in epoch milliseconds.
 * @returns {string} Relative time or a missing-save label.
 */
function formatTime(timestamp?: number) {
  if (!timestamp) return "No local save recorded yet";
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 1000)
  );
  if (elapsedSeconds < 60) return "Saved just now";
  if (elapsedSeconds < 3600)
    return `Saved ${Math.floor(elapsedSeconds / 60)} min ago`;
  if (elapsedSeconds < 86400)
    return `Saved ${Math.floor(elapsedSeconds / 3600)} hr ago`;
  return `Saved ${Math.floor(elapsedSeconds / 86400)} days ago`;
}

/**
 * Show library safety, local-server connectivity, and search readiness.
 * Operational controls stay outside the daily tab workspace.
 * @returns {JSX.Element} Dashboard status and actions.
 */
export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { vault } = useLibrary();
  const [sync, setSync] = useState<SyncStatus>();
  const [serverUrl, setServerUrl] = useState(DEFAULT_TABVAULT_SERVER_URL);
  const [apiKey, setApiKey] = useState(DEFAULT_TABVAULT_API_KEY);
  const [online, setOnline] = useState(false);
  const [indexStatus, setIndexStatus] = useState<SemanticIndexStatus | null>(
    null
  );
  const [capabilities, setCapabilities] = useState<ServerCapabilities | null>(
    null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);

  const applySearchState = useCallback(
    (state: {
      online: boolean;
      capabilities: ServerCapabilities | null;
      indexStatus: SemanticIndexStatus | null;
    }) => {
      setOnline(state.online);
      setCapabilities(state.capabilities);
      setIndexStatus(state.indexStatus);
    },
    []
  );

  const loadStatus = useCallback(
    async (announce = false) => {
      setIsRefreshing(true);
      try {
        const [savedSync, url, key] = await Promise.all([
          readSyncStatus(),
          readLocalServerUrl(),
          readApiKey(),
        ]);
        setSync(savedSync);
        setServerUrl(url);
        setApiKey(key);
        try {
          applySearchState(await loadServerSearchState(url, key));
          if (announce) toast.success("Dashboard refreshed");
        } catch {
          setOnline(false);
          setCapabilities(null);
          setIndexStatus(null);
          if (announce)
            toast.message("Working from local storage", {
              description: "The configured server is not currently available.",
            });
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [applySearchState]
  );

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
      void loadStatus();
    }, 0);
    return () => window.clearTimeout(refreshTimer);
  }, [loadStatus]);

  useEffect(() => {
    if (!online) return;
    const timer = window.setInterval(() => {
      void loadServerSearchState(serverUrl, apiKey)
        .then(applySearchState)
        .catch(() => {
          setOnline(false);
          setCapabilities(null);
          setIndexStatus(null);
        });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [online, serverUrl, apiKey, applySearchState]);

  /**
   * Start or inspect a semantic-index rebuild.
   *
   * Refresh server capabilities afterward and report whether indexing is ready or still running.
   * @returns {Promise<void>} Resolves after the rebuild request and status refresh.
   */
  const rebuild = async () => {
    if (!online) {
      toast.error("Connect the server before rebuilding the index");
      return;
    }
    setIsRebuilding(true);
    try {
      const status = await rebuildSemanticIndex(serverUrl, apiKey);
      const state = await loadServerSearchState(serverUrl, apiKey);
      applySearchState(state);
      const blocked = blockingSearchCapability(state.capabilities);
      if (blocked) {
        toast.error(blocked.error ?? "Semantic search is not ready", {
          description: blocked.fix ?? undefined,
        });
        return;
      }
      if (status.status === "ready" || state.indexStatus?.status === "ready") {
        toast.success("Semantic index rebuilt", {
          description: `${state.indexStatus?.indexedTabs ?? status.indexedTabs} tabs are ready for ranked search.`,
        });
        return;
      }
      toast.success("Index rebuild started", {
        description:
          "The first rebuild downloads the embedding model and can take several minutes.",
      });
    } catch {
      try {
        const state = await loadServerSearchState(serverUrl, apiKey);
        applySearchState(state);
        const blocked = blockingSearchCapability(state.capabilities);
        toast.error(blocked?.error ?? "Could not start the index rebuild", {
          description: blocked?.fix ?? undefined,
        });
      } catch {
        toast.error("Could not start the index rebuild");
      }
    } finally {
      setIsRebuilding(false);
    }
  };

  /**
   * Run a semantic-index health check.
   *
   * Update the displayed health status and report whether the index needs attention.
   * @returns {Promise<void>} Resolves after the health-check request.
   */
  const checkHealth = async () => {
    if (!online) {
      toast.error("Connect the server before running a health check");
      return;
    }
    try {
      const healthCheck = await runIndexHealthCheck(serverUrl, apiKey);
      setIndexStatus(current =>
        current ? { ...current, healthCheck } : current
      );
      toast.success(
        healthCheck.lastResult === "ready"
          ? "Index is ready"
          : "Index needs attention"
      );
    } catch {
      toast.error("Could not run an index health check");
    }
  };

  const syncState = sync?.state ?? "local_only";
  const syncCopy =
    syncState === "synced"
      ? "Synced to your configured server"
      : syncState === "pending"
        ? "Stored locally; server sync is pending"
        : "Stored in this browser profile";
  const SyncIcon = syncState === "synced" ? Check : CloudOff;
  const indexReady = indexStatus?.status === "ready";
  const blockedCapability = blockingSearchCapability(capabilities);
  const healthNeedsAttention =
    indexStatus?.healthCheck?.lastResult === "needs_attention";
  const libraryMetrics = [
    { Icon: Database, value: vault.tabs.length, label: "Saved tabs" },
    {
      Icon: FolderTree,
      value: vault.vaultGroups.length,
      label: "Collections",
    },
    {
      Icon: Tags,
      value: Object.keys(vault.tagCatalog).length,
      label: "Tags",
    },
  ];

  return (
    <main className="min-h-dvh bg-[#f6f3ec] px-5 py-6 text-[#18261f] sm:px-8 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="flex flex-wrap items-center justify-between gap-4 pb-5">
          <div className="max-w-2xl">
            <h1 className="font-['DM_Sans'] text-2xl font-bold tracking-[-0.04em]">
              Dashboard
            </h1>
          </div>
          <IconButton
            label={isRefreshing ? "Refreshing status" : "Refresh status"}
            onClick={() => void loadStatus(true)}
            disabled={isRefreshing}
          >
            <RefreshCw className={isRefreshing ? "animate-spin" : ""} />
          </IconButton>
        </section>

        <section className="grid gap-px border border-[#ded9cd] bg-[#ded9cd] sm:grid-cols-3">
          {libraryMetrics.map(({ Icon, value, label }) => {
            return (
              <div key={label} className="bg-[#fffdf8] px-4 py-3">
                <Icon className="h-4 w-4 text-[#e95224]" />
                <p className="mt-2 font-['DM_Sans'] text-3xl font-bold tracking-[-0.055em] tabular-nums">
                  {value}
                </p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#7c8179]">
                  {label}
                </p>
              </div>
            );
          })}
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="border border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_8px_24px_rgba(24,38,31,0.035)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
                  <HardDrive className="h-3.5 w-3.5" /> Storage and sync
                </p>
                <h2 className="mt-2 text-[18px] font-bold tracking-[-0.025em]">
                  {syncCopy}
                </h2>
              </div>
              <span
                className={`grid h-9 w-9 place-items-center rounded-md ${syncState === "synced" ? "bg-[#e9f1e7] text-[#47724d]" : syncState === "pending" ? "bg-[#fff0e8] text-[#c84b26]" : "bg-[#efede6] text-[#6f756d]"}`}
              >
                <SyncIcon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-4 max-w-xl text-[12px] leading-5 text-[#697068]">
              {syncState === "synced"
                ? "Your browser cache remains available as an offline copy."
                : syncState === "pending"
                  ? "Your changes are safe in local storage. Reconnect the server, then refresh or make your next library update to try syncing again."
                  : "This library is available locally in this browser or extension profile. Connect a server when you want a shared copy."}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e8e3d8] pt-4">
              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#7c8179]">
                {sync?.localSavedAt
                  ? formatTime(sync.localSavedAt)
                  : vault.tabs.length > 0
                    ? "Library available locally"
                    : "No saved tabs yet"}
              </span>
              <Button
                variant="ghost"
                onClick={() => setLocation("/settings")}
                className="inline-flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#536057] hover:text-[#e95224]"
              >
                {online ? "Review connection" : "Connect server"}{" "}
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </article>

          <article className="border border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_8px_24px_rgba(24,38,31,0.035)]">
            <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
              <Wifi className="h-3.5 w-3.5" /> Server
            </p>
            <h2 className="mt-2 text-[18px] font-bold tracking-[-0.025em]">
              {online ? "Connected" : "Not connected"}
            </h2>
            <p className="mt-3 text-[12px] leading-5 text-[#697068]">
              {online
                ? "The server is reachable and can accept library updates."
                : "The library still works locally. Server-backed sync is unavailable until the endpoint responds."}
            </p>
            <p className="mt-5 truncate border-t border-[#e8e3d8] pt-4 font-mono text-[9px] text-[#7c8179]">
              {serverUrl.replace(/^https?:\/\//, "")}
            </p>
          </article>

          <article className="border border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_8px_24px_rgba(24,38,31,0.035)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
                  <SearchCheck className="h-3.5 w-3.5" /> Semantic search
                </p>
                <h2 className="mt-2 text-[18px] font-bold tracking-[-0.025em]">
                  {indexReady
                    ? `${indexStatus?.indexedTabs ?? 0} tabs ready for meaning-based search`
                    : "Keyword search is available"}
                </h2>
              </div>
              <span
                className={`mt-1 h-2.5 w-2.5 rounded-full ${indexReady ? "bg-[#6e9870]" : "bg-[#b5b5ad]"}`}
              />
            </div>
            <p className="mt-3 text-[12px] leading-5 text-[#697068]">
              {indexReady
                ? `${indexStatus?.model ?? "Local embedding model"} is ready. Keyword and tag search remain available too.`
                : "Set up or rebuild the index only if you want search to match related concepts, not just words."}
            </p>
            {indexStatus?.lastError && !blockedCapability?.error && (
              <p className="mt-3 text-[12px] leading-5 text-[#8a4a38]">
                {indexStatus.lastError}
              </p>
            )}
            <CapabilityIssue capability={blockedCapability} />
            <Button
              variant="outline"
              onClick={() => void rebuild()}
              disabled={!online || isRebuilding}
              className="mt-5 inline-flex items-center gap-2 rounded-md border border-[#e7b09a] bg-[#fff4ee] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#c84b26] transition hover:bg-[#fff0ea] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRebuilding ? "animate-spin" : ""}`}
              />
              {isRebuilding ? "Rebuilding" : "Rebuild index"}
            </Button>
          </article>

          <article className="border border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_8px_24px_rgba(24,38,31,0.035)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
                  <ShieldCheck className="h-3.5 w-3.5" /> Index health
                </p>
                <h2 className="mt-2 text-[18px] font-bold tracking-[-0.025em]">
                  {healthNeedsAttention
                    ? "Action needed"
                    : indexStatus?.healthCheck?.lastResult === "ready"
                      ? "Last check passed"
                      : "No health check yet"}
                </h2>
              </div>
              <span
                className={`mt-1 h-2.5 w-2.5 rounded-full ${healthNeedsAttention ? "bg-[#c95f46]" : indexStatus?.healthCheck?.lastResult === "ready" ? "bg-[#6e9870]" : "bg-[#b5b5ad]"}`}
              />
            </div>
            <p className="mt-3 text-[12px] leading-5 text-[#697068]">
              {indexStatus?.healthCheck?.enabled
                ? `Automatic checks run every ${Math.round(indexStatus.healthCheck.intervalSeconds / 60)} minutes.`
                : "Health checks are manual. Turn on a schedule in Settings if you want local alerts."}
            </p>
            <Button
              variant="ghost"
              onClick={() => void checkHealth()}
              disabled={!online}
              className="mt-5 inline-flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#536057] transition hover:text-[#e95224] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Check now <ArrowRight className="h-3 w-3" />
            </Button>
          </article>
        </section>
      </div>
    </main>
  );
}
