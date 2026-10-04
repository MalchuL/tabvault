import { createContext, useContext, useEffect, useRef } from "react";
import type { StorageMode } from "@/domain/server/browserStorage";

/** Session flag that opens the tag manager after navigating back to All Tabs. */
export const LIBRARY_OPEN_TAGS_FLAG = "tabvault-open-tags";

/** Live library actions registered by the All Tabs workspace while it is mounted. */
/** Counts for LibrarySidebarBridge. */
type LibrarySidebarBridgeCounts = {
  activeCount: number;
  archivedCount: number;
  hiddenCount: number;
  tagCount: number;
};
/** Storage and server connection state for LibrarySidebarBridge. */
type LibrarySidebarBridgeConnection = {
  storageMode: StorageMode;
  serverOnline: boolean;
  isRefreshing: boolean;
};
/** Interaction handlers for LibrarySidebarBridge. */
type LibrarySidebarBridgeActions = {
  onResetSearch: () => void;
  onOpenTags: () => void;
  onRefreshLibrary: () => void;
  onCaptureTab?: () => void;
};
export type LibrarySidebarBridge = {
  counts: LibrarySidebarBridgeCounts;
  connection: LibrarySidebarBridgeConnection;
  actions: LibrarySidebarBridgeActions;
};

export type WorkspaceSidebarContextValue = {
  setBridge: (bridge: LibrarySidebarBridge | null) => void;
};

export const WorkspaceSidebarContext =
  createContext<WorkspaceSidebarContextValue | null>(null);

/**
 * Publishes live library counts and actions into the shared workspace sidebar.
 *
 * @param {LibrarySidebarBridge} bridge - Counts and handlers owned by the mounted library page.
 */
export function useRegisterLibrarySidebar(bridge: LibrarySidebarBridge) {
  const context = useContext(WorkspaceSidebarContext);
  const bridgeRef = useRef(bridge);
  const canCapture = Boolean(bridge.actions.onCaptureTab);
  useEffect(() => {
    bridgeRef.current = bridge;
  });
  useEffect(() => {
    if (!context) return;
    context.setBridge({
      counts: {
        activeCount: bridge.counts.activeCount,
        archivedCount: bridge.counts.archivedCount,
        hiddenCount: bridge.counts.hiddenCount,
        tagCount: bridge.counts.tagCount,
      },
      connection: {
        storageMode: bridge.connection.storageMode,
        serverOnline: bridge.connection.serverOnline,
        isRefreshing: bridge.connection.isRefreshing,
      },
      actions: {
        onResetSearch: () => bridgeRef.current.actions.onResetSearch(),
        onOpenTags: () => bridgeRef.current.actions.onOpenTags(),
        onRefreshLibrary: () => bridgeRef.current.actions.onRefreshLibrary(),
        onCaptureTab: canCapture
          ? () => bridgeRef.current.actions.onCaptureTab?.()
          : undefined,
      },
    });
  }, [
    context,
    bridge.counts.activeCount,
    bridge.counts.archivedCount,
    bridge.counts.hiddenCount,
    bridge.counts.tagCount,
    bridge.connection.storageMode,
    bridge.connection.serverOnline,
    bridge.connection.isRefreshing,
    canCapture,
  ]);
  useEffect(() => {
    if (!context) return;
    return () => context.setBridge(null);
  }, [context]);
}
