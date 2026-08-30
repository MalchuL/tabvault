import { createContext, useContext, useEffect, useRef } from "react";
import type { StorageMode } from "@/lib/extension";

/** Session flag that opens the tag manager after navigating back to All Tabs. */
export const LIBRARY_OPEN_TAGS_FLAG = "tabvault-open-tags";

/** Live library actions registered by the All Tabs workspace while it is mounted. */
export type LibrarySidebarBridge = {
  activeCount: number;
  archivedCount: number;
  hiddenCount: number;
  tagCount: number;
  storageMode: StorageMode;
  serverOnline: boolean;
  isRefreshing: boolean;
  onOpenTags: () => void;
  onRefreshLibrary: () => void;
  onCaptureTab?: () => void;
};

export type WorkspaceSidebarContextValue = {
  setBridge: (bridge: LibrarySidebarBridge | null) => void;
};

export const WorkspaceSidebarContext =
  createContext<WorkspaceSidebarContextValue | null>(null);

/**
 * Publishes live library counts and actions into the shared workspace sidebar.
 *
 * @param bridge - Counts and handlers owned by the mounted library page.
 */
export function useRegisterLibrarySidebar(bridge: LibrarySidebarBridge) {
  const context = useContext(WorkspaceSidebarContext);
  const bridgeRef = useRef(bridge);
  const canCapture = Boolean(bridge.onCaptureTab);
  useEffect(() => {
    bridgeRef.current = bridge;
  });
  useEffect(() => {
    if (!context) return;
    context.setBridge({
      activeCount: bridge.activeCount,
      archivedCount: bridge.archivedCount,
      hiddenCount: bridge.hiddenCount,
      tagCount: bridge.tagCount,
      storageMode: bridge.storageMode,
      serverOnline: bridge.serverOnline,
      isRefreshing: bridge.isRefreshing,
      onOpenTags: () => bridgeRef.current.onOpenTags(),
      onRefreshLibrary: () => bridgeRef.current.onRefreshLibrary(),
      onCaptureTab: canCapture
        ? () => bridgeRef.current.onCaptureTab?.()
        : undefined,
    });
  }, [
    context,
    bridge.activeCount,
    bridge.archivedCount,
    bridge.hiddenCount,
    bridge.tagCount,
    bridge.storageMode,
    bridge.serverOnline,
    bridge.isRefreshing,
    canCapture,
  ]);
  useEffect(() => {
    if (!context) return;
    return () => context.setBridge(null);
  }, [context]);
}
