/**
 * Signal Library design reminder: transfer is a deliberate archival desk, not a transient dialog.
 * Warm paper, precise rules, and TabVault Orange distinguish write actions from local evidence.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  ChevronLeft,
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
  readLocalServerUrl,
} from "@/lib/extension";
import { BrowserStorageAdapter } from "@/lib/persistence";

const logoUrl = "/manus-storage/tabvault-logo_133db831.png";

type TransferVault = {
  tabs?: Array<Record<string, unknown>>;
  vaultGroups?: Array<Record<string, unknown>>;
  tagCatalog?: Record<string, string>;
  tabOrders?: Record<string, string[]>;
  savedSearches?: Array<Record<string, unknown>>;
  tabView?: string;
};

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

function serverDocumentToVault(
  document: Record<string, unknown>
): TransferVault {
  const groups = Array.isArray(document.groups)
    ? (document.groups as Array<Record<string, unknown>>).map(group => ({
        id: String(group.id),
        name: String(group.name),
        ...(typeof group.parentId === "string"
          ? { parent: group.parentId }
          : {}),
        accent: typeof group.color === "string" ? group.color : "#829b65",
      }))
    : [];
  const tabs = Array.isArray(document.tabs)
    ? (document.tabs as Array<Record<string, unknown>>).map(tab => ({
        id: String(tab.id),
        groupId: typeof tab.groupId === "string" ? tab.groupId : "inbox",
        title: String(tab.title ?? "Untitled tab"),
        url: String(tab.url ?? ""),
        domain: (() => {
          try {
            return new URL(String(tab.url)).hostname.replace(/^www\./, "");
          } catch {
            return String(tab.url ?? "");
          }
        })(),
        note: typeof tab.note === "string" ? tab.note : "",
        tags: Array.isArray(tab.tags) ? tab.tags.map(String) : [],
        color: "#6b8c7e",
        icon:
          String(tab.title ?? "T")
            .slice(0, 1)
            .toUpperCase() || "T",
        updated: "imported",
      }))
    : [];
  const tagCatalog = Array.isArray(document.tags)
    ? (document.tags as Array<Record<string, unknown>>).reduce<
        Record<string, string>
      >(
        (catalog, tag) => ({
          ...catalog,
          [String(tag.name)]:
            typeof tag.description === "string" ? tag.description : "",
        }),
        {}
      )
    : {};
  const tabOrders = tabs.reduce<Record<string, string[]>>(
    (orders, tab) => ({
      ...orders,
      [String(tab.groupId)]: [
        ...(orders[String(tab.groupId)] ?? []),
        String(tab.id),
      ],
    }),
    {}
  );
  return {
    tabs,
    vaultGroups: groups,
    tagCatalog,
    tabOrders,
    savedSearches: [],
    tabView: "standard",
  };
}

function isWorkspaceVault(value: unknown): value is TransferVault {
  const candidate = value as Record<string, unknown>;
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray(candidate.tabs) &&
    Array.isArray(candidate.vaultGroups) &&
    typeof candidate.tagCatalog === "object" &&
    typeof candidate.tabOrders === "object"
  );
}

export default function Transfer() {
  const [, setLocation] = useLocation();
  const storage = useMemo(() => new BrowserStorageAdapter<TransferVault>(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [vault, setVault] = useState<TransferVault | null>(null);
  const [serverUrl, setServerUrl] = useState(DEFAULT_TABVAULT_SERVER_URL);
  const [apiKey, setApiKey] = useState(DEFAULT_TABVAULT_API_KEY);
  const [serverOnline, setServerOnline] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [issues, setIssues] = useState<ValidationError[]>([]);

  const refresh = async () => {
    try {
      const health = await checkLocalServer(serverUrl, apiKey);
      setServerOnline(health.status === "ok");
    } catch {
      setServerOnline(false);
    }
  };

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
        `${serverUrl.replace(/\/+$/, "")}/v1/export?format=${format}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      if (!response.ok)
        throw new Error(`Server export returned ${response.status}`);
      const payload = (await response.json()) as {
        format: "json" | "markdown";
        content: unknown;
      };
      const content =
        payload.format === "markdown"
          ? String(payload.content)
          : JSON.stringify(payload.content, null, 2);
      downloadFile(
        `tabvault-server-${timestamp()}.${payload.format === "markdown" ? "md" : "json"}`,
        content,
        payload.format === "markdown" ? "text/markdown" : "application/json"
      );
      toast.success(`Server ${payload.format} exported`);
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
        const nextVault = isWorkspaceVault(parsedJson)
          ? parsedJson
          : serverDocumentToVault(parsedJson);
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
        `${serverUrl.replace(/\/+$/, "")}/v1/import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
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
      if (result.document) {
        const nextVault = serverDocumentToVault(result.document);
        await storage.save(nextVault);
        setVault(nextVault);
      }
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
    <div className="min-h-screen bg-[#f6f3ec] text-[#18261f] lg:pl-[274px]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[274px] flex-col border-r border-[#ded9cd] bg-[#f3f1ea] px-4 py-5 lg:flex">
        <div className="flex items-center gap-3 px-2">
          <img
            src={logoUrl}
            alt="TabVault"
            className="h-8 w-8 object-contain"
          />
          <div>
            <span className="block font-['DM_Sans'] text-[19px] font-bold leading-none tracking-[-0.055em]">
              tabvault
            </span>
            <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-[#83867e]">
              local link library
            </span>
          </div>
        </div>
        <nav className="mt-10">
          <p className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8e9189]">
            Workspace
          </p>
          <button
            onClick={() => setLocation("/")}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[#666c65] transition hover:bg-[#efede6] hover:text-[#18261f]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="text-[13px] font-semibold">My library</span>
          </button>
          <div className="mt-8 border-t border-[#e3ded3] pt-6">
            <p className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8e9189]">
              Data
            </p>
            <button
              aria-current="page"
              className="flex w-full items-center gap-2.5 rounded-lg border-l-2 border-[#e95224] bg-[#eeece4] px-3 py-2 text-left text-[#18261f]"
            >
              <ArrowDownToLine className="h-3.5 w-3.5 text-[#e95224]" />
              <span className="text-[13px] font-semibold">Import & Export</span>
            </button>
          </div>
        </nav>
        <div className="mt-auto rounded-xl border border-[#ded9cd] bg-[#fffdf8] p-3.5 shadow-[0_8px_24px_rgba(24,38,31,0.04)]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
              API connection
            </span>
            <span
              className={`h-2 w-2 rounded-full ${serverOnline ? "bg-[#6e9870]" : "bg-[#c95f46]"}`}
            />
          </div>
          <p className="mt-2 text-[12px] font-bold">
            {serverOnline ? "Server available" : "Browser storage active"}
          </p>
          <p className="mt-1 truncate font-mono text-[9px] text-[#8c9088]">
            {serverUrl.replace(/^https?:\/\//, "")}
          </p>
          <button
            onClick={() => void refresh()}
            className="mt-3 border-t border-[#e8e3d8] pt-2.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#687067] hover:text-[#e95224]"
          >
            Check connection
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-[#ded9cd]/85 bg-[#f6f3ec]/88 px-5 backdrop-blur-xl sm:px-7 lg:px-9">
        <button
          onClick={() => setLocation("/")}
          className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#536057] hover:text-[#e95224]"
        >
          <ChevronLeft className="h-4 w-4" /> My library
        </button>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#858980]">
          Transfer desk / v1
        </span>
      </header>

      <main className="mx-auto max-w-[1160px] px-5 py-8 sm:px-7 lg:px-9 lg:py-11">
        <section className="border-b border-[#dcd7cc] pb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#e95224]">
            Data transfer
          </p>
          <h1 className="mt-3 max-w-2xl font-['DM_Sans'] text-[38px] font-bold leading-[0.96] tracking-[-0.065em] sm:text-[54px]">
            Move your library with intent.
          </h1>
          <p className="mt-4 max-w-2xl text-[13px] leading-6 text-[#697068]">
            Download a portable copy from browser storage or the connected API.
            Import JSON locally, or use the authenticated server for validation,
            merge, replace, and Markdown transfer.
          </p>
        </section>

        <div className="mt-8 grid gap-7 lg:grid-cols-2">
          <section className="border border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_9px_25px_rgba(24,38,31,0.035)] sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-[#edf2ea] p-2 text-[#638569]">
                <ArrowDownToLine className="h-4 w-4" />
              </div>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
                  Export
                </p>
                <h2 className="mt-1 font-['DM_Sans'] text-[21px] font-bold tracking-[-0.045em]">
                  Keep a portable copy.
                </h2>
              </div>
            </div>
            <p className="mt-4 text-[11px] leading-5 text-[#6f756d]">
              Browser JSON preserves the library held on this device. Server
              exports use the versioned transfer contract and can also produce
              Markdown for reading and review.
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
                <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
                  Import
                </p>
                <h2 className="mt-1 font-['DM_Sans'] text-[21px] font-bold tracking-[-0.045em]">
                  Bring records in carefully.
                </h2>
              </div>
            </div>
            <p className="mt-4 text-[11px] leading-5 text-[#6f756d]">
              Local JSON import replaces this browser copy. With the API
              connected, choose merge or replace; the server returns field-level
              issues before it writes invalid data.
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

        <section className="mt-7 border border-[#ded9cd] bg-[#fffdf8] p-5 sm:p-6">
          <div className="flex items-center gap-2">
            {issues.length ? (
              <AlertTriangle className="h-4 w-4 text-[#c84b26]" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-[#6e9870]" />
            )}
            <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#858980]">
              Validation report
            </p>
          </div>
          {issues.length ? (
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
          ) : (
            <p className="mt-3 text-[11px] leading-5 text-[#6f756d]">
              Choose a file to see import validation here. A connected server
              validates its complete versioned document before writing it.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
