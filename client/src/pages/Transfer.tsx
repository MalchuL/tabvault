/**
 * Signal Library design reminder: transfer is a deliberate archival desk, not a transient dialog.
 * Warm paper, precise rules, and TabVault Orange distinguish write actions from local evidence.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  FileJson2,
  FileText,
  RefreshCw,
  Server,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  checkLocalServer,
  DEFAULT_TABVAULT_API_KEY,
  DEFAULT_TABVAULT_SERVER_URL,
  readApiKey,
  readLibraryFromServer,
  readLocalServerUrl,
} from "@/lib/extension";
import {
  emptyBrowserVault,
  fromServerDocument,
  isPersistedVault,
  type PersistedVault,
} from "@/lib/library";
import { BrowserStorageAdapter } from "@/lib/persistence";

type ValidationError = {
  code?: string;
  path?: string;
  expected?: string;
  received?: unknown;
  suggestion?: string;
  message?: string;
};

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export default function Transfer() {
  const storage = useMemo(
    () => new BrowserStorageAdapter<PersistedVault>(),
    []
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const [vault, setVault] = useState<PersistedVault | null>(null);
  const [serverUrl, setServerUrl] = useState(DEFAULT_TABVAULT_SERVER_URL);
  const [apiKey, setApiKey] = useState(DEFAULT_TABVAULT_API_KEY);
  const [serverOnline, setServerOnline] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [issues, setIssues] = useState<ValidationError[]>([]);

  useEffect(() => {
    void storage
      .load()
      .then(saved => setVault(saved ?? null))
      .catch(() => setVault(null));
    void Promise.all([readLocalServerUrl(), readApiKey()]).then(
      ([configuredUrl, configuredKey]) => {
        setServerUrl(configuredUrl);
        setApiKey(configuredKey);
        void checkLocalServer(configuredUrl, configuredKey)
          .then(health => setServerOnline(health.status === "ok"))
          .catch(() => setServerOnline(false));
      }
    );
  }, [storage]);

  const exportBrowserJson = () => {
    if (!vault) {
      toast.error("Your browser library is still loading");
      return;
    }
    downloadFile(
      `tabvault-browser-${timestamp()}.json`,
      JSON.stringify(vault, null, 2),
      "application/json"
    );
    toast.success("Browser library downloaded");
  };

  const exportServer = async (format: "json" | "markdown") => {
    if (!serverOnline) {
      toast.error("Connect the TabVault API before exporting server data");
      return;
    }
    setIsWorking(true);
    try {
      const response = await fetch(
        `${serverUrl.replace(/\/+$/, "")}/api/v1/export?format=${format}`,
        { headers: { "X-API-Key": apiKey } }
      );
      if (!response.ok)
        throw new Error(`Server export returned ${response.status}`);
      const content =
        format === "markdown"
          ? await response.text()
          : JSON.stringify(await response.json(), null, 2);
      downloadFile(
        `tabvault-server-${timestamp()}.${format === "markdown" ? "md" : "json"}`,
        content,
        format === "markdown" ? "text/markdown" : "application/json"
      );
      toast.success(`Server ${format} exported`);
    } catch (error) {
      toast.error("Could not export server data", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsWorking(false);
    }
  };

  const importFile = async (file: File) => {
    setIssues([]);
    setIsWorking(true);
    try {
      const source = await file.text();
      const markdown = /\.md(?:own)?$/i.test(file.name);
      if (markdown && !serverOnline) {
        throw new Error("Markdown import requires a connected TabVault API.");
      }
      const parsedJson = markdown
        ? null
        : (JSON.parse(source) as Record<string, unknown>);

      if (!serverOnline) {
        if (markdown) throw new Error("Markdown import requires the API.");
        if (!parsedJson)
          throw new Error("The JSON document could not be read.");
        const nextVault = isPersistedVault(parsedJson)
          ? parsedJson
          : fromServerDocument(parsedJson, emptyBrowserVault());
        if (!nextVault.tabs?.length && !nextVault.vaultGroups?.length) {
          throw new Error(
            "This file does not contain a recognizable TabVault library."
          );
        }
        await storage.save(nextVault);
        setVault(nextVault);
        toast.success("Browser library imported", {
          description: "Open My library to organize the imported tabs.",
        });
        return;
      }

      const response = await fetch(
        `${serverUrl.replace(/\/+$/, "")}/api/v1/import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
          body: JSON.stringify({
            format: markdown ? "markdown" : "json",
            content: markdown ? source : parsedJson,
            mode: importMode,
          }),
        }
      );
      if (!response.ok)
        throw new Error(`Server import returned ${response.status}`);
      const result = (await response.json()) as {
        success?: boolean;
        errors?: ValidationError[];
        warnings?: ValidationError[];
        document?: Record<string, unknown>;
      };
      if (!result.success) {
        setIssues(result.errors ?? []);
        toast.error("Import needs attention", {
          description: "Review the field-level validation report below.",
        });
        return;
      }
      const document = await readLibraryFromServer(serverUrl, apiKey);
      const nextVault = fromServerDocument(
        document,
        vault ?? emptyBrowserVault()
      );
      await storage.save(nextVault);
      setVault(nextVault);
      setIssues(result.warnings ?? []);
      toast.success(
        importMode === "replace" ? "Library replaced" : "Library merged",
        {
          description:
            "The browser cache now matches the returned server document.",
        }
      );
    } catch (error) {
      toast.error("Import could not be completed", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsWorking(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="min-h-dvh bg-[#f6f3ec] text-[#18261f]">
      <main className="mx-auto max-w-[1160px] px-5 py-6 sm:px-8">
        <section className="pb-5">
          <h1 className="font-['DM_Sans'] text-2xl font-bold tracking-[-0.04em]">
            Import & Export
          </h1>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="border border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_9px_25px_rgba(24,38,31,0.035)] sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-[#edf2ea] p-2 text-[#638569]">
                <ArrowDownToLine className="h-4 w-4" />
              </div>
              <div>
                <h2 className="mt-1 font-['DM_Sans'] text-[21px] font-bold tracking-[-0.045em]">
                  Export
                </h2>
              </div>
            </div>
            <p className="mt-4 text-[11px] leading-5 text-[#6f756d]">
              Download this browser’s library, or export from the connected
              server.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                onClick={exportBrowserJson}
                className="flex items-center justify-between border border-[#d7d1c4] bg-[#f9f7f1] px-3 py-3 text-left transition hover:border-[#e95224]"
              >
                <span className="flex items-center gap-2 text-[11px] font-bold">
                  <FileJson2 className="h-4 w-4 text-[#e95224]" /> Browser JSON
                </span>
                <ArrowDownToLine className="h-3.5 w-3.5 text-[#858980]" />
              </button>
              <button
                onClick={() => void exportServer("json")}
                disabled={!serverOnline || isWorking}
                className="flex items-center justify-between border border-[#d7d1c4] bg-[#f9f7f1] px-3 py-3 text-left transition hover:border-[#e95224] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span className="flex items-center gap-2 text-[11px] font-bold">
                  <Server className="h-4 w-4 text-[#e95224]" /> Server JSON
                </span>
                <ArrowDownToLine className="h-3.5 w-3.5 text-[#858980]" />
              </button>
              <button
                onClick={() => void exportServer("markdown")}
                disabled={!serverOnline || isWorking}
                className="flex items-center justify-between border border-[#d7d1c4] bg-[#f9f7f1] px-3 py-3 text-left transition hover:border-[#e95224] disabled:cursor-not-allowed disabled:opacity-45 sm:col-span-2"
              >
                <span className="flex items-center gap-2 text-[11px] font-bold">
                  <FileText className="h-4 w-4 text-[#e95224]" /> Server
                  Markdown
                </span>
                <ArrowDownToLine className="h-3.5 w-3.5 text-[#858980]" />
              </button>
            </div>
          </section>

          <section className="border border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_9px_25px_rgba(24,38,31,0.035)] sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-[#fff0ea] p-2 text-[#e95224]">
                <ArrowUpFromLine className="h-4 w-4" />
              </div>
              <div>
                <h2 className="mt-1 font-['DM_Sans'] text-[21px] font-bold tracking-[-0.045em]">
                  Import
                </h2>
              </div>
            </div>
            <p className="mt-4 text-[11px] leading-5 text-[#6f756d]">
              Browser imports replace this device’s library. Server imports can
              merge or replace.
            </p>
            <div className="mt-5 flex overflow-hidden border border-[#d7d1c4]">
              {(["merge", "replace"] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setImportMode(mode)}
                  disabled={!serverOnline}
                  className={`flex-1 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.08em] transition ${importMode === mode ? "bg-[#fff0ea] text-[#c84b26]" : "bg-[#f9f7f1] text-[#747970] hover:bg-[#fffdf8]"} disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json,text/markdown,.md,.markdown"
              className="sr-only"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
              }}
            />
            <button
              onClick={() => fileInput.current?.click()}
              disabled={isWorking}
              className="mt-3 flex w-full items-center justify-center gap-2 bg-[#e95224] px-3 py-3 text-[11px] font-bold text-white transition hover:bg-[#d94a1e] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#c8c1b6]"
            >
              {isWorking ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {isWorking ? "Working…" : "Choose a transfer file"}
            </button>
          </section>
        </div>

        {issues.length > 0 && (
          <section className="mt-5 border border-[#ded9cd] bg-[#fffdf8] p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#c84b26]" />
              <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
                Validation report
              </p>
            </div>
            <div className="mt-4 space-y-3">
              {issues.map((issue, index) => (
                <article
                  key={`${issue.code}-${issue.path}-${index}`}
                  className="border-l-2 border-[#e95224] bg-[#f9f7f1] px-4 py-3"
                >
                  <p className="font-mono text-[10px] font-medium text-[#c74722]">
                    {issue.code ?? "TRANSFER_NOTICE"}
                    {issue.path ? (
                      <span className="ml-3 text-[#6e746c]">{issue.path}</span>
                    ) : null}
                  </p>
                  <p className="mt-2 text-[11px] leading-5 text-[#4e574f]">
                    {issue.message ??
                      issue.expected ??
                      "The transfer needs review."}
                  </p>
                  {issue.suggestion && (
                    <p className="mt-2 text-[10px] leading-4 text-[#727870]">
                      Suggested fix: {issue.suggestion}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
