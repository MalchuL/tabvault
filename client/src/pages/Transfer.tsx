/**
 * Signal Library design reminder: transfer is a deliberate archival desk, not a transient dialog.
 * Warm paper, precise rules, and TabVault Orange distinguish write actions from local evidence.
 */
import { useEffect, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { readLibraryFromServer } from "@/domain/server/libraryApi";
import { checkLocalServer } from "@/domain/server/search";
import {
  DEFAULT_TABVAULT_API_KEY,
  DEFAULT_TABVAULT_SERVER_URL,
  readApiKey,
  readLocalServerUrl,
} from "@/domain/server/browserStorage";
import {
  emptyBrowserVault,
  fromServerDocument,
  isPersistedVault,
} from "@/domain/library/codec";
import { useLibrary } from "@/domain/library/library-context";
import { createTabVaultApi } from "@/domain/server/client";

type ValidationError = {
  code?: string;
  path?: string;
  expected?: string;
  received?: unknown;
  suggestion?: string;
  message?: string;
};

/**
 * Download generated text through a temporary browser object URL.
 * Releases the URL after triggering the download to avoid retaining the Blob.
 * @param {string} name - Suggested filename.
 * @param {string} content - File body to download.
 * @param {string} type - MIME type assigned to the Blob.
 * @returns {void} Triggers a browser download.
 */
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

/**
 * Create a filename-safe UTC timestamp for exports.
 * @returns {string} ISO timestamp with colon and period characters replaced.
 */
function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Present browser and server export, validation, and import controls.
 * Destructive replacement is a separate explicit action from merging.
 * @returns {JSX.Element} Transfer workspace and its status messages.
 */
export default function Transfer() {
  const { vault, dispatch } = useLibrary();
  const fileInput = useRef<HTMLInputElement>(null);
  const [serverUrl, setServerUrl] = useState(DEFAULT_TABVAULT_SERVER_URL);
  const [apiKey, setApiKey] = useState(DEFAULT_TABVAULT_API_KEY);
  const [serverOnline, setServerOnline] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [issues, setIssues] = useState<ValidationError[]>([]);
  const api = createTabVaultApi({ baseUrl: serverUrl, apiKey });

  useEffect(() => {
    void Promise.all([readLocalServerUrl(), readApiKey()]).then(
      ([configuredUrl, configuredKey]) => {
        setServerUrl(configuredUrl);
        setApiKey(configuredKey);
        void checkLocalServer(configuredUrl, configuredKey)
          .then(health => setServerOnline(health.status === "ok"))
          .catch(() => setServerOnline(false));
      }
    );
  }, []);

  /**
   * Download the browser library as JSON.
   *
   * Serialize the current vault for a local backup file.
   */
  const exportBrowserJson = () => {
    downloadFile(
      `tabvault-browser-${timestamp()}.json`,
      JSON.stringify(vault, null, 2),
      "application/json"
    );
    toast.success("Browser library downloaded");
  };

  /**
   * Download a server library export.
   *
   * Request JSON or Markdown from the connected API and report failures to the user.
   * @param {"json" | "markdown"} format - Export format to request.
   * @returns {Promise<void>} Resolves after the download attempt.
   */
  const exportServer = async (format: "json" | "markdown") => {
    if (!serverOnline) {
      toast.error("Connect the TabVault API before exporting server data");
      return;
    }
    setIsWorking(true);
    try {
      const response = await api.transfer.export(format);
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

  /**
   * Import a browser or server library file.
   *
   * Validate JSON or Markdown and merge or replace according to the selected mode; report contract errors.
   * @param {File} file - User-selected file containing a library export.
   * @returns {Promise<void>} Resolves after the import attempt.
   */
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
        dispatch({ type: "replace", vault: nextVault });
        toast.success("Browser library imported", {
          description: "Open My library to organize the imported tabs.",
        });
        return;
      }

      const result = await api.transfer.import<{
        success?: boolean;
        errors?: ValidationError[];
        warnings?: ValidationError[];
        document?: Record<string, unknown>;
      }>({
        format: markdown ? "markdown" : "json",
        content: markdown ? source : parsedJson,
        mode: importMode,
      });
      if (!result.success) {
        setIssues(result.errors ?? []);
        toast.error("Import needs attention", {
          description: "Review the field-level validation report below.",
        });
        return;
      }
      const document = await readLibraryFromServer(serverUrl, apiKey);
      const nextVault = fromServerDocument(document, vault);
      dispatch({ type: "replace", vault: nextVault });
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
          <Card className="gap-0 rounded-none border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_9px_25px_rgba(24,38,31,0.035)] sm:p-6">
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
              <Button
                variant="outline"
                onClick={exportBrowserJson}
                className="flex items-center justify-between border border-[#d7d1c4] bg-[#f9f7f1] px-3 py-3 text-left transition hover:border-[#e95224]"
              >
                <span className="flex items-center gap-2 text-[11px] font-bold">
                  <FileJson2 className="h-4 w-4 text-[#e95224]" /> Browser JSON
                </span>
                <ArrowDownToLine className="h-3.5 w-3.5 text-[#858980]" />
              </Button>
              <Button
                variant="outline"
                onClick={() => void exportServer("json")}
                disabled={!serverOnline || isWorking}
                className="flex items-center justify-between border border-[#d7d1c4] bg-[#f9f7f1] px-3 py-3 text-left transition hover:border-[#e95224] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span className="flex items-center gap-2 text-[11px] font-bold">
                  <Server className="h-4 w-4 text-[#e95224]" /> Server JSON
                </span>
                <ArrowDownToLine className="h-3.5 w-3.5 text-[#858980]" />
              </Button>
              <Button
                variant="outline"
                onClick={() => void exportServer("markdown")}
                disabled={!serverOnline || isWorking}
                className="flex items-center justify-between border border-[#d7d1c4] bg-[#f9f7f1] px-3 py-3 text-left transition hover:border-[#e95224] disabled:cursor-not-allowed disabled:opacity-45 sm:col-span-2"
              >
                <span className="flex items-center gap-2 text-[11px] font-bold">
                  <FileText className="h-4 w-4 text-[#e95224]" /> Server
                  Markdown
                </span>
                <ArrowDownToLine className="h-3.5 w-3.5 text-[#858980]" />
              </Button>
            </div>
          </Card>

          <Card className="gap-0 rounded-none border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_9px_25px_rgba(24,38,31,0.035)] sm:p-6">
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
                <Button
                  variant="ghost"
                  key={mode}
                  onClick={() => setImportMode(mode)}
                  disabled={!serverOnline}
                  className={`flex-1 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.08em] transition ${importMode === mode ? "bg-[#fff0ea] text-[#c84b26]" : "bg-[#f9f7f1] text-[#747970] hover:bg-[#fffdf8]"} disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  {mode}
                </Button>
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
            <Button
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
            </Button>
          </Card>
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
