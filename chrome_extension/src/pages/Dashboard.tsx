import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLibrary } from "@/domain/library/library-context";
import { libraryStats } from "@/domain/library/selectors";
import {
  readApiKey,
  readLocalServerUrl,
  readStorageMode,
} from "@/domain/server/browserStorage";
import { createTabVaultApi } from "@/domain/server/client";
import { checkLocalServer } from "@/domain/server/search";
type Backup = {
  id: string;
  createdAt: string;
  reason: string;
  sizeBytes: number;
};
/** Show library storage and direct backup restoration without background jobs. @returns {React.ReactElement} Operational dashboard. */
export default function Dashboard() {
  const { vault, syncStatus, synchronize } = useLibrary();
  const counts = libraryStats(vault);
  const [online, setOnline] = useState(false);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [busy, setBusy] = useState(false);
  const api = async () =>
    createTabVaultApi({
      baseUrl: await readLocalServerUrl(),
      apiKey: await readApiKey(),
    });
  const refresh = useCallback(async () => {
    if ((await readStorageMode()) !== "backend") return;
    try {
      const health = await checkLocalServer(
        await readLocalServerUrl(),
        await readApiKey()
      );
      setOnline(health.status === "ok" && health.schemaVersion === 5);
      const response = await (
        await api()
      ).request<{ data: { backups: Backup[] } }>("/backups");
      setBackups(response.data.backups);
    } catch {
      setOnline(false);
    }
  }, []);
  useEffect(() => {
    // Refresh sets state only after the asynchronous health and backup requests.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);
  const download = async (id: string) => {
    setBusy(true);
    try {
      const snapshot = await (
        await api()
      ).request(`/backups/${encodeURIComponent(id)}/download`);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(snapshot, null, 2)], {
          type: "application/json",
        })
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `tabvault-backup-${id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };
  const restore = async (id: string) => {
    if (
      !window.confirm(
        "Restore this backup on the server? A backup of the current server library will be created first."
      )
    )
      return;
    setBusy(true);
    try {
      const result = await (
        await api()
      ).request<{ success: boolean; errors?: Array<{ message: string }> }>(
        `/backups/${encodeURIComponent(id)}/restore`,
        { method: "POST" }
      );
      if (!result.success)
        throw new Error(
          result.errors?.map(e => e.message).join("; ") || "Restore failed"
        );
      toast.success(
        "Backup restored. Load the new server library from Settings."
      );
      await refresh();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Object.entries(counts).map(([label, count]) => (
          <div key={label} className="border bg-[#fffdf8] p-5">
            <p className="text-2xl font-bold">{count}</p>
            <p>{label.replace("Count", "")}</p>
          </div>
        ))}
      </div>
      <section className="border bg-[#fffdf8] p-5">
        <h2 className="font-semibold">Library storage</h2>
        <p className="my-3">
          {online ? "Server connected" : "Browser library available locally"} ·{" "}
          {syncStatus?.state ?? "local_only"}
        </p>
        <Button
          onClick={() =>
            void synchronize()
              .then(refresh)
              .catch(error => toast.error(String(error)))
          }
        >
          Sync now
        </Button>
        <Link className="ml-4 underline" href="/settings">
          Connection settings
        </Link>
        <Link className="ml-4 underline" href="/transfer">
          Import and export
        </Link>
      </section>
      <section className="border bg-[#fffdf8] p-5">
        <h2 className="font-semibold">Server backups</h2>
        {!backups.length && (
          <p className="mt-3 text-sm">No server backups loaded.</p>
        )}
        {backups.map(backup => (
          <div
            key={backup.id}
            className="flex items-center justify-between border-b py-3"
          >
            <span>
              {new Date(backup.createdAt).toLocaleString()} · {backup.reason}
            </span>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => void download(backup.id)}
            >
              Download backup
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => void restore(backup.id)}
            >
              Restore backup
            </Button>
          </div>
        ))}
      </section>
    </main>
  );
}
