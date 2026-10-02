/** One durable synchronization protocol for every library resource. */
import { emptyBrowserVault, fromServerDocument } from "@/domain/library/codec";
import { overlayChanges, resourceKey } from "@/domain/library/operations";
import { publishLibrary, withLibraryLock } from "@/domain/library/store";
import type { PendingChange, PersistedVault } from "@/domain/library/types";
import {
  readApiKey,
  readBrowserVault,
  readLocalServerUrl,
  readStorageMode,
  writeBrowserVault,
  writeSyncStatus,
} from "./browserStorage";
import { createTabVaultApi } from "./client";
export type SyncResponse = {
  generation: string;
  document: Record<string, unknown>;
  acknowledged: string[];
  propertyTimes: Record<string, string>;
  tombstones: Array<{
    kind: PendingChange["kind"];
    id: string;
    updatedAt: string;
  }>;
};
/** Merge acknowledgements against latest local tokens, preserving in-flight edits. @param {PersistedVault} current - Latest persisted state. @param {SyncResponse} response - Committed server snapshot. @returns {PersistedVault} Reconciled library. */
export function reconcileSync(
  current: PersistedVault,
  response: SyncResponse
): PersistedVault {
  const acknowledged = new Set(response.acknowledged);
  const pending = Object.fromEntries(
    Object.entries(current.sync.pending).filter(
      ([, c]) => !acknowledged.has(c.token)
    )
  );
  const remote = fromServerDocument(response.document, {
    ...current,
    sync: {
      generation: response.generation,
      pending,
      propertyTimes: response.propertyTimes,
    },
  });
  // Permanent ID deletion wins over edits even if another context edited during the request.
  for (const t of response.tombstones) {
    const key = resourceKey(t.kind, t.id);
    if ((t.kind === "tab" || t.kind === "group") && pending[key]?.data !== null)
      delete pending[key];
  }
  const deletedGroups = new Map(
    response.tombstones
      .filter(t => t.kind === "group")
      .map(t => [t.id, t.updatedAt])
  );
  const deletedTags = new Set(
    response.tombstones
      .filter(t => t.kind === "tag")
      .map(t => t.id.toLowerCase())
  );
  const merged = overlayChanges(remote, Object.values(pending));
  return {
    ...merged,
    library: {
      ...merged.library,
      tabs: merged.library.tabs.map(tab => {
        const removed = deletedGroups.get(tab.placement.groupId ?? "");
        return {
          ...tab,
          annotations: {
            ...tab.annotations,
            tags: tab.annotations.tags.filter(
              name =>
                !deletedTags.has(name.toLowerCase()) ||
                pending[resourceKey("tag", name)]?.data != null
            ),
          },
          ...(removed
            ? {
                placement: { ...tab.placement, groupId: null },
                lifecycle: {
                  ...tab.lifecycle,
                  archived: true,
                  archivedAt: removed,
                },
              }
            : {}),
        };
      }),
    },
  };
}
/** Synchronize persisted data; failed attempts retain all pending changes. @returns {Promise<void>} Completes after durable acknowledgement. @throws {Error} Network, validation, generation, or storage failure. */
export async function synchronizeLibrary(): Promise<void> {
  if ((await readStorageMode()) !== "backend") {
    await writeSyncStatus({ state: "local_only", localSavedAt: Date.now() });
    return;
  }
  try {
    return await navigator.locks.request("tabvault-sync", async () => {
      const snapshot = await withLibraryLock(async () => {
        const stored = await readBrowserVault();
        if (stored) return stored;
        const fresh = emptyBrowserVault();
        await writeBrowserVault(fresh);
        return fresh;
      });
      await writeSyncStatus({ state: "pending", localSavedAt: Date.now() });
      const [baseUrl, apiKey] = await Promise.all([
        readLocalServerUrl(),
        readApiKey(),
      ]);
      const response = await createTabVaultApi({
        baseUrl,
        apiKey,
        signal: AbortSignal.timeout(30_000),
      }).request<SyncResponse>("/sync", {
        method: "POST",
        body: JSON.stringify({
          schemaVersion: 5,
          generation: snapshot.sync.generation,
          changes: Object.values(snapshot.sync.pending),
        }),
      });
      await withLibraryLock(async () => {
        const current = await readBrowserVault();
        if (!current) return;
        if (current.sync.generation !== snapshot.sync.generation)
          throw new Error("Library changed during synchronization");
        const result = reconcileSync(current, response);
        await writeBrowserVault(result);
        await writeSyncStatus({
          state: Object.keys(result.sync.pending).length ? "pending" : "synced",
          localSavedAt: Date.now(),
          serverSyncedAt: Date.now(),
        });
        publishLibrary();
      });
    });
  } catch (error) {
    await writeSyncStatus({
      state: "pending",
      localSavedAt: Date.now(),
      error: error instanceof Error ? error.message : "Synchronization failed",
    });
    publishLibrary();
    throw error;
  }
}
/** Request the single sync owner appropriate to this runtime. @returns {Promise<void>} Completion of the requested attempt. @throws {Error} Sync failure reported by the owner. */
export async function requestLibrarySync(): Promise<void> {
  if (globalThis.chrome?.runtime?.id && typeof window !== "undefined") {
    const result = await chrome.runtime.sendMessage({
      type: "TABVAULT_REFRESH_LIBRARY",
    });
    if (!result?.success)
      throw new Error(result?.error ?? "Synchronization failed");
    return;
  }
  return synchronizeLibrary();
}
/** Explicitly adopt the current server generation after user-controlled export/confirmation. @param {boolean} discardPending - Whether the caller explicitly approved discarding exported pending work. @returns {Promise<void>} Persisted replacement retaining local preferences. */
export async function loadServerLibrary(discardPending = true): Promise<void> {
  const [baseUrl, apiKey] = await Promise.all([
    readLocalServerUrl(),
    readApiKey(),
  ]);
  await navigator.locks.request("tabvault-sync", async () => {
    const baseline = await withLibraryLock(readBrowserVault);
    if (!discardPending && Object.keys(baseline?.sync.pending ?? {}).length)
      throw new Error(
        "Local edits are still pending. Export your local copy and use Settings to adopt the imported server library."
      );
    const response = await createTabVaultApi({
      baseUrl,
      apiKey,
    }).request<SyncResponse>("/sync", {
      method: "POST",
      body: JSON.stringify({ schemaVersion: 5, generation: null, changes: [] }),
    });
    await withLibraryLock(async () => {
      const local = await readBrowserVault();
      if (
        JSON.stringify(local?.library) !== JSON.stringify(baseline?.library) ||
        JSON.stringify(local?.propertySchema) !==
          JSON.stringify(baseline?.propertySchema)
      )
        throw new Error(
          "The local library changed while loading the server. Export the latest copy and retry."
        );
      const result = reconcileSync(
        {
          ...(local ?? emptyBrowserVault()),
          sync: { generation: null, pending: {}, propertyTimes: {} },
        },
        response
      );
      await writeBrowserVault(result);
      await writeSyncStatus({
        state: "synced",
        localSavedAt: Date.now(),
        serverSyncedAt: Date.now(),
      });
      publishLibrary();
    });
  });
}
