import { Eraser, Eye, EyeOff, RefreshCw, Server, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StorageMode } from "@/domain/server/browserStorage";
import { LIBRARY_REFRESH_INTERVALS } from "@/domain/library/codec";

/** Storage mode state for StorageConnectionPanelProps. */
type StorageConnectionPanelStorage = {
  storageMode: StorageMode;
  onStorageModeChange: (mode: StorageMode) => void;
};
/** Storage and server connection state for StorageConnectionPanelProps. */
type StorageConnectionPanelConnection = {
  online: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCheck: () => void;
};
/** Server credentials for StorageConnectionPanelProps. */
type StorageConnectionPanelCredentials = {
  serverUrl: string;
  apiKey: string;
  showApiKey: boolean;
  onServerUrlChange: (url: string) => void;
  onApiKeyChange: (key: string) => void;
  onToggleApiKey: () => void;
};
type StorageConnectionPanelProps = {
  storage: StorageConnectionPanelStorage;
  connection: StorageConnectionPanelConnection;
  credentials: StorageConnectionPanelCredentials;
};

/**
 * Show storage mode and the optional server connection form.
 * Credentials are displayed only in backend mode; saving and connectivity checks belong to Settings.
 * @param {StorageConnectionPanelProps} props - Display values and callbacks supplied by the owner.
 * @returns {React.ReactElement} Storage selection and optional connection form.
 */
export function StorageConnectionPanel({
  storage: { storageMode, onStorageModeChange },
  connection: { online, isSaving, onSave, onCheck },
  credentials: {
    serverUrl,
    apiKey,
    showApiKey,
    onServerUrlChange,
    onApiKeyChange,
    onToggleApiKey,
  },
}: StorageConnectionPanelProps) {
  const isBackendMode = storageMode === "backend";
  return (
    <section
      className={`border border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_8px_24px_rgba(24,38,31,0.035)]${isBackendMode ? "" : " lg:col-span-2"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
            <Server className="h-3.5 w-3.5" />{" "}
            {isBackendMode ? "API connection" : "Storage"}
          </p>
          <h2 className="mt-2 text-[16px] font-bold">
            {isBackendMode
              ? online
                ? "Backend preferred"
                : "Backend preferred · local fallback"
              : "Local only"}
          </h2>
        </div>
        {isBackendMode && (
          <span
            className={`mt-1 h-2.5 w-2.5 rounded-full ${online ? "bg-[#6e9870]" : "bg-[#c95f46]"}`}
          />
        )}
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
            <Button
              variant="ghost"
              key={mode}
              type="button"
              onClick={() => onStorageModeChange(mode)}
              aria-pressed={storageMode === mode}
              className={`border px-2 py-2 text-left font-mono text-[8px] uppercase tracking-[0.06em] ${storageMode === mode ? "border-[#e95224] bg-[#fff0ea] text-[#c84b26]" : "border-[#ded9cd] text-[#697068] hover:bg-[#f9f7f1]"}`}
            >
              {label}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-5 text-[#767b73]">
          {isBackendMode
            ? "Changes are saved locally first, then pushed when this server is reachable."
            : "Links stay only in this browser or extension profile."}
        </p>
      </fieldset>
      {isBackendMode && (
        <>
          <label className="mt-5 block">
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#858980]">
              API endpoint
            </span>
            <Input
              value={serverUrl}
              onChange={event => onServerUrlChange(event.target.value)}
              className="mt-1.5 w-full border-b border-[#cfc9bc] bg-[#f9f7f1] px-2 py-2 font-mono text-[11px] outline-none focus:border-[#e95224]"
            />
          </label>
          <label className="mt-4 block">
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#858980]">
              API key
            </span>
            <div className="relative mt-1.5">
              <Input
                value={apiKey}
                onChange={event => onApiKeyChange(event.target.value)}
                type={showApiKey ? "text" : "password"}
                autoComplete="off"
                className="w-full border-b border-[#cfc9bc] bg-[#f9f7f1] py-2 pl-2 pr-9 font-mono text-[11px] outline-none focus:border-[#e95224]"
              />
              <Button
                variant="ghost"
                type="button"
                onClick={onToggleApiKey}
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
                aria-pressed={showApiKey}
                className="absolute inset-y-0 right-0 flex items-center px-2 text-[#858980] hover:text-[#18261f]"
              >
                {showApiKey ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </label>
        </>
      )}
      <div className="mt-5 flex gap-3">
        <Button
          variant="ghost"
          onClick={onSave}
          disabled={isSaving}
          className="rounded bg-[#e95224] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-white hover:bg-[#d94a1e] disabled:bg-[#c8c1b6]"
        >
          {isSaving ? "Saving…" : isBackendMode ? "Save & check" : "Save"}
        </Button>
        {isBackendMode && (
          <Button
            variant="ghost"
            onClick={onCheck}
            className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#687067] hover:text-[#e95224]"
          >
            Check now
          </Button>
        )}
      </div>
    </section>
  );
}

type LibraryRefreshPanelProps = {
  refreshInterval: number;
  online: boolean;
  isRefreshingLibrary: boolean;
  onIntervalChange: (seconds: number) => void;
  onRefresh: () => void;
};

/**
 * Show automatic and manual library refresh controls.
 * Manual refresh stays disabled while offline or while a refresh is already running.
 * @param {LibraryRefreshPanelProps} props - Display values and callbacks supplied by the owner.
 * @returns {React.ReactElement} Automatic refresh choices and manual refresh action.
 */
export function LibraryRefreshPanel({
  refreshInterval,
  isRefreshingLibrary,
  onIntervalChange,
  onRefresh,
}: LibraryRefreshPanelProps) {
  return (
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
        Pull the server library and merge it with tabs and collections already
        stored in this browser or extension.
      </p>
      <div className="mt-5 grid grid-cols-5 gap-2">
        {LIBRARY_REFRESH_INTERVALS.map(({ seconds, label }) => (
          <Button
            variant="ghost"
            key={String(seconds)}
            onClick={() => onIntervalChange(seconds)}
            className={`border px-2 py-2 font-mono text-[9px] uppercase ${refreshInterval === seconds || (!seconds && !refreshInterval) ? "border-[#e95224] bg-[#fff0ea] text-[#c84b26]" : "border-[#ded9cd] text-[#767b73] hover:bg-[#f9f7f1]"}`}
          >
            {label}
          </Button>
        ))}
      </div>
      <Button
        variant="ghost"
        onClick={onRefresh}
        disabled={isRefreshingLibrary}
        className="mt-5 rounded bg-[#e95224] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-white hover:bg-[#d94a1e] disabled:bg-[#c8c1b6]"
      >
        {isRefreshingLibrary ? "Refreshing…" : "Refresh library now"}
      </Button>
    </section>
  );
}

type ClearDataPanelProps = {
  isBackendMode: boolean;
  pendingClear: "browser" | "server" | "both" | null;
  isClearing: boolean;
  onPendingClearChange: (target: "browser" | "server" | "both" | null) => void;
  onConfirmClear: () => void;
};

/**
 * Show library clearing choices and the required confirmation.
 * Selecting a store only requests confirmation; clearing runs through the confirmed parent callback.
 * @param {ClearDataPanelProps} props - Display values and callbacks supplied by the owner.
 * @returns {React.ReactElement} Store choices and any pending clear confirmation.
 */
export function ClearDataPanel({
  isBackendMode,
  pendingClear,
  isClearing,
  onPendingClearChange,
  onConfirmClear,
}: ClearDataPanelProps) {
  return (
    <section className="border border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_8px_24px_rgba(24,38,31,0.035)] lg:col-span-2">
      <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
        <Trash2 className="h-3.5 w-3.5" /> Clear data
      </p>
      <h2 className="mt-2 text-[16px] font-bold">
        Remove saved tabs and collections
      </h2>
      <p className="mt-4 max-w-2xl text-[12px] leading-5 text-[#697068]">
        {isBackendMode
          ? "Clearing the browser library empties this profile. Refreshing later can restore the server copy. Clearing the server writes an empty library after a backup; this browser can upload its copy again on the next sync. Use Clear both to wipe both copies. Connection settings are kept."
          : "Clearing the browser library empties this profile. Storage settings are kept."}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          variant="ghost"
          onClick={() => onPendingClearChange("browser")}
          className="inline-flex items-center gap-1.5 border border-[#ded9cd] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[#687067] hover:border-[#c95f46] hover:text-[#c95f46]"
        >
          <Eraser className="h-3.5 w-3.5" /> Clear browser library
        </Button>
        {isBackendMode && (
          <>
            <Button
              variant="ghost"
              onClick={() => onPendingClearChange("server")}
              className="inline-flex items-center gap-1.5 border border-[#ded9cd] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[#687067] hover:border-[#c95f46] hover:text-[#c95f46]"
            >
              <Server className="h-3.5 w-3.5" /> Clear server library
            </Button>
            <Button
              variant="ghost"
              onClick={() => onPendingClearChange("both")}
              className="inline-flex items-center gap-1.5 border border-[#c95f46] bg-[#fff0ea] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[#c84b26] hover:bg-[#ffe4d8]"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear both
            </Button>
          </>
        )}
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
            <Button
              variant="ghost"
              onClick={onConfirmClear}
              disabled={isClearing}
              className="rounded bg-[#c95f46] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-white hover:bg-[#b4533e] disabled:bg-[#c8c1b6]"
            >
              {isClearing ? "Clearing…" : "Confirm clear"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => onPendingClearChange(null)}
              className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#687067] hover:text-[#e95224]"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
