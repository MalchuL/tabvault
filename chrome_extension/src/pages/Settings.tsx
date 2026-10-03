import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  StorageConnectionPanel,
  LibraryRefreshPanel,
  ClearDataPanel,
} from "@/components/settings/SettingsPanels";
import { Button } from "@/components/ui/button";
import { useLibrary } from "@/domain/library/library-context";
import { clearLibraryOnServer } from "@/domain/server/libraryApi";
import { checkLocalServer } from "@/domain/server/search";
import { loadServerLibrary } from "@/domain/server/sync";
import {
  clearBrowserLibrary,
  readApiKey,
  readLocalServerUrl,
  readStorageMode,
  readLibraryRefreshInterval,
  writeApiKey,
  writeLocalServerUrl,
  writeStorageMode,
  writeLibraryRefreshInterval,
  type StorageMode,
} from "@/domain/server/browserStorage";
/** Configure local storage, connection, refresh, and explicit library replacement. @returns {React.ReactElement} Settings page. */
export default function Settings() {
  const { vault, synchronize } = useLibrary();
  const [mode, setMode] = useState<StorageMode>("local");
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [interval, setIntervalValue] = useState(0);
  const [pendingClear, setPendingClear] = useState<
    "browser" | "server" | "both" | null
  >(null);
  useEffect(() => {
    void Promise.all([
      readStorageMode(),
      readLocalServerUrl(),
      readApiKey(),
      readLibraryRefreshInterval(),
    ]).then(([m, u, k, i]) => {
      setMode(m);
      setUrl(u);
      setKey(k);
      setIntervalValue(i);
    });
  }, []);
  const work = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const check = async () => {
    setOnline(false);
    const health = await checkLocalServer(url, key);
    if (health.schemaVersion !== 5)
      throw new Error("Server schema is incompatible; expected v5");
    setOnline(health.status === "ok");
    toast.success("Server connected");
  };
  const save = () =>
    work(async () => {
      await writeLocalServerUrl(url);
      await writeApiKey(key);
      await writeStorageMode(mode);
      if (mode === "backend") {
        await check();
        await synchronize();
      }
      toast.success("Settings saved");
    });
  const clear = () =>
    work(async () => {
      if (pendingClear !== "browser") await clearLibraryOnServer(url, key);
      if (pendingClear !== "server") {
        await clearBrowserLibrary();
        window.location.reload();
      }
      setPendingClear(null);
    });
  const adopt = () =>
    work(async () => {
      if (
        !window.confirm(
          "Download your local copy, then replace this browser's library with the current server library?"
        )
      )
        return;
      const blob = URL.createObjectURL(
        new Blob([JSON.stringify(vault, null, 2)], { type: "application/json" })
      );
      const a = document.createElement("a");
      a.href = blob;
      a.download = "tabvault-before-replacement.json";
      a.click();
      URL.revokeObjectURL(blob);
      await loadServerLibrary();
      toast.success("Server library loaded");
    });
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="grid gap-5 lg:grid-cols-2">
        <StorageConnectionPanel
          storage={{
            storageMode: mode,
            onStorageModeChange: next => {
              setMode(next);
              setPendingClear(null);
              setOnline(false);
            },
          }}
          connection={{
            online,
            isSaving: busy,
            onSave: () => void save(),
            onCheck: () => void work(check),
          }}
          credentials={{
            serverUrl: url,
            apiKey: key,
            showApiKey: showKey,
            onServerUrlChange: setUrl,
            onApiKeyChange: setKey,
            onToggleApiKey: () => setShowKey(!showKey),
          }}
        />
        {mode === "backend" && (
          <>
            <LibraryRefreshPanel
              refreshInterval={interval}
              online={online}
              isRefreshingLibrary={busy}
              onIntervalChange={seconds =>
                void work(async () => {
                  await writeLibraryRefreshInterval(seconds);
                  setIntervalValue(seconds);
                })
              }
              onRefresh={() => void work(synchronize)}
            />
            <section className="border bg-[#fffdf8] p-5">
              <h2 className="font-semibold">Replaced server library</h2>
              <p className="my-3 text-sm">
                After a server restore or reset, export your local copy and
                explicitly load the new library.
              </p>
              <Button onClick={() => void adopt()} disabled={busy}>
                Export local copy and load server library
              </Button>
            </section>
          </>
        )}
        <ClearDataPanel
          isBackendMode={mode === "backend"}
          pendingClear={pendingClear}
          isClearing={busy}
          onPendingClearChange={setPendingClear}
          onConfirmClear={() => void clear()}
        />
      </div>
    </main>
  );
}
