import { Button } from "@/components/ui/button";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  ArrowDownToLine,
  Boxes,
  Eye,
  LayoutDashboard,
  LayoutList,
  Plus,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { emptyBrowserVault } from "@/domain/library/codec";
import { useLibrary } from "@/domain/library/library-context";
import { libraryStats } from "@/domain/library/selectors";
import { refreshLibraryFromServer } from "@/domain/server/libraryApi";
import { checkLocalServer } from "@/domain/server/search";
import { isExtensionContext } from "@/extension/bridge";
import {
  readApiKey,
  readBrowserVault,
  readLocalServerUrl,
  readStorageMode,
} from "@/domain/server/browserStorage";
import {
  LIBRARY_OPEN_TAGS_FLAG,
  WorkspaceSidebarContext,
  type LibrarySidebarBridge,
} from "@/components/shell/workspace-sidebar-context";

/**
 * Style a top-level browse route according to its active state.
 * Active routes keep the orange leading rule; inactive routes retain hover feedback.
 * @param {boolean} active - Whether the browse route matches the current path.
 * @returns {string} Classes for the browse navigation button.
 */
function browseClass(active: boolean) {
  return `flex w-full items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-left text-[13px] font-semibold transition ${
    active
      ? "border-[#e95224] bg-[#eeece4] text-[#18261f]"
      : "border-transparent text-[#666c65] hover:bg-[#efede6] hover:text-[#18261f]"
  }`;
}

/**
 * Style a nested library route according to its active state.
 * The nested style omits the top-level leading rule.
 * @param {boolean} active - Whether the nested library route is current.
 * @returns {string} Classes for the library navigation button.
 */
function libraryClass(active: boolean) {
  return `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[#666c65] hover:bg-[#efede6] hover:text-[#18261f] ${
    active ? "bg-[#eeece4] text-[#18261f]" : ""
  }`;
}

/**
 * Shared application rail used on every workspace route.
 *
 * @param {{ children: ReactNode }} props - Routed page content rendered beside the navigation rail.
 * @returns {JSX.Element} The shared application shell.
 */
export function WorkspaceSidebar({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { vault, dispatch } = useLibrary();
  const [open, setOpen] = useState(false);
  const [bridge, setBridge] = useState<LibrarySidebarBridge | null>(null);
  const [isRefreshingFallback, setIsRefreshingFallback] = useState(false);
  const extensionContext = isExtensionContext();
  const contextValue = useMemo(
    () => ({
      setBridge: (next: LibrarySidebarBridge | null) => {
        if (next) setBridge(next);
      },
    }),
    []
  );

  const stats = bridge ?? libraryStats(vault);
  const isRefreshing = bridge?.isRefreshing ?? isRefreshingFallback;
  const isAllTabsPage =
    location === "/" ||
    location === "/all-tabs" ||
    location.startsWith("/collections");
  const closeAndGo = useCallback(
    (href: string) => {
      setOpen(false);
      setLocation(href);
    },
    [setLocation]
  );

  /**
   * Open the library tag manager.
   *
   * Navigate to the library and request its tag dialog through the sidebar context.
   */
  const openTags = () => {
    setOpen(false);
    if (bridge) {
      bridge.onOpenTags();
      return;
    }
    sessionStorage.setItem(LIBRARY_OPEN_TAGS_FLAG, "1");
    setLocation("/");
  };

  /**
   * Refresh the library from the connected server.
   *
   * Request a refresh through the sidebar context and show the resulting status.
   * @returns {Promise<void>} Resolves after the refresh attempt.
   */
  const refreshLibrary = async () => {
    if (bridge) {
      if (bridge.storageMode !== "backend" || !bridge.serverOnline) {
        toast.error(
          "Connect the TabVault server before refreshing the library"
        );
        return;
      }
      bridge.onRefreshLibrary();
      return;
    }
    setIsRefreshingFallback(true);
    try {
      const [mode, url, key] = await Promise.all([
        readStorageMode(),
        readLocalServerUrl(),
        readApiKey(),
      ]);
      if (mode !== "backend") {
        toast.error(
          "Connect the TabVault server before refreshing the library"
        );
        return;
      }
      const health = await checkLocalServer(url, key);
      if (health.status !== "ok") {
        toast.error(
          "Connect the TabVault server before refreshing the library"
        );
        return;
      }
      const current = (await readBrowserVault()) ?? emptyBrowserVault();
      const { vault } = await refreshLibraryFromServer(url, key, current);
      dispatch({ type: "replace", vault });
      toast.success("Library refreshed", {
        description: `${vault.tabs.length} tabs merged with the server.`,
      });
    } catch {
      toast.error("Could not refresh tabs and collections");
    } finally {
      setIsRefreshingFallback(false);
    }
  };

  return (
    <WorkspaceSidebarContext.Provider value={contextValue}>
      <div className="min-h-dvh bg-[#f6f3ec] text-[#18261f] lg:pl-[224px]">
        <a
          href="#workspace-content"
          onClick={event => {
            event.preventDefault();
            document.getElementById("workspace-content")?.focus();
          }}
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-card focus:p-3"
        >
          Skip to content
        </a>
        <Button
          variant="ghost"
          type="button"
          onClick={() => setOpen(true)}
          className="fixed left-4 top-4 z-40 rounded-md border border-[#ded9cd] bg-[#fffdf8] p-2 shadow-sm lg:hidden"
          aria-label="Open navigation"
        >
          <Boxes className="h-4 w-4" />
        </Button>
        <aside
          data-testid="workspace-sidebar"
          className={`fixed inset-y-0 left-0 z-50 flex w-[224px] flex-col border-r border-[#ded9cd] bg-[#f9f7f1]/95 px-3 py-4 backdrop-blur-xl transition-transform duration-200 lg:translate-x-0 ${open ? "translate-x-0 shadow-[16px_0_50px_rgba(24,38,31,0.14)]" : "-translate-x-full"}`}
        >
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2.5">
              <img
                src="/icon-128.png"
                alt="TabVault"
                className="h-9 w-9 object-contain"
              />
              <div>
                <span className="block font-['DM_Sans'] text-[19px] font-bold leading-none tracking-[-0.055em]">
                  tabvault
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-2 text-[#777b74] hover:bg-[#ebe8df] lg:hidden"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {extensionContext && (
            <div className="mt-5 px-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (bridge?.onCaptureTab) {
                    void bridge.onCaptureTab();
                    return;
                  }
                  setLocation("/");
                  toast.message("Opened All Tabs", {
                    description: "Save the active tab from the library.",
                  });
                }}
                className="flex w-full items-center justify-between rounded-lg bg-[#e95224] px-3.5 py-3 text-left text-[#fffaf2] shadow-[0_7px_16px_rgba(233,82,36,0.19)] transition hover:-translate-y-0.5 hover:bg-[#d94a1e] active:scale-[0.98]"
              >
                <span className="flex items-center gap-2.5 text-[13px] font-bold">
                  <Plus className="h-4 w-4" /> Save active tab
                </span>
                <span className="rounded border border-white/25 px-1.5 py-0.5 font-mono text-[9px]">
                  ⌘ S
                </span>
              </Button>
            </div>
          )}

          <nav
            className="thin-scrollbar mt-5 flex-1 overflow-y-auto px-1"
            aria-label="Workspace"
          >
            <div className="space-y-1">
              <Button
                variant="ghost"
                type="button"
                onClick={() => closeAndGo("/")}
                aria-current={isAllTabsPage ? "page" : undefined}
                className={browseClass(isAllTabsPage)}
              >
                <LayoutList className="h-3.5 w-3.5" /> All Tabs{" "}
                <span className="ml-auto font-mono text-[10px] text-[#a2a49c]">
                  {stats.activeCount}
                </span>
              </Button>
              {(stats.archivedCount > 0 || location === "/archive") && (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => closeAndGo("/archive")}
                  aria-current={location === "/archive" ? "page" : undefined}
                  className={browseClass(location === "/archive")}
                >
                  <Archive className="h-3.5 w-3.5" /> Archive{" "}
                  <span className="ml-auto font-mono text-[10px] text-[#a2a49c]">
                    {stats.archivedCount}
                  </span>
                </Button>
              )}
              {(stats.hiddenCount > 0 || location === "/hidden") && (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => closeAndGo("/hidden")}
                  aria-current={location === "/hidden" ? "page" : undefined}
                  className={browseClass(location === "/hidden")}
                >
                  <Eye className="h-3.5 w-3.5" /> Hidden{" "}
                  <span className="ml-auto font-mono text-[10px] text-[#a2a49c]">
                    {stats.hiddenCount}
                  </span>
                </Button>
              )}
              <Button
                variant="ghost"
                type="button"
                onClick={() => closeAndGo("/dashboard")}
                aria-current={location === "/dashboard" ? "page" : undefined}
                className={browseClass(location === "/dashboard")}
              >
                <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => closeAndGo("/deduplicate")}
                aria-current={location === "/deduplicate" ? "page" : undefined}
                className={browseClass(location === "/deduplicate")}
              >
                <Sparkles className="h-3.5 w-3.5" /> Deduplicate
              </Button>
            </div>
            <div className="mt-4">
              <Button
                variant="ghost"
                type="button"
                onClick={openTags}
                className={libraryClass(false)}
              >
                <Tag className="h-3.5 w-3.5" />
                <span className="text-[13px] font-semibold">Tags</span>
                <span className="ml-auto font-mono text-[10px] text-[#a2a49c]">
                  {stats.tagCount}
                </span>
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => closeAndGo("/transfer")}
                aria-current={location === "/transfer" ? "page" : undefined}
                className={libraryClass(location === "/transfer")}
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                <span className="text-[13px] font-semibold">
                  Import & Export
                </span>
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => closeAndGo("/custom-properties")}
                aria-current={
                  location === "/custom-properties" ? "page" : undefined
                }
                className={libraryClass(location === "/custom-properties")}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="text-[13px] font-semibold">
                  Custom Properties
                </span>
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => closeAndGo("/settings")}
                aria-current={location === "/settings" ? "page" : undefined}
                className={libraryClass(location === "/settings")}
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span className="text-[13px] font-semibold">Settings</span>
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => void refreshLibrary()}
                disabled={isRefreshing}
                className={`${libraryClass(false)} disabled:opacity-60`}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                />
                <span className="text-[13px] font-semibold">
                  {isRefreshing ? "Refreshing…" : "Refresh library"}
                </span>
              </Button>
            </div>
          </nav>
        </aside>
        {open ? (
          <Button
            variant="ghost"
            type="button"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 h-auto w-auto rounded-none bg-[#18261f]/20 p-0 hover:bg-[#18261f]/20 lg:hidden"
            aria-label="Close navigation overlay"
          />
        ) : null}
        <div
          id="workspace-content"
          tabIndex={-1}
          className="min-h-dvh pt-14 lg:pt-0"
        >
          {children}
        </div>
      </div>
    </WorkspaceSidebarContext.Provider>
  );
}
