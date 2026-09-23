/** Local-server HTTP operations and browser-to-server synchronization. */

import {
  fromServerDocument,
  toServerDocument,
  type PersistedVault,
} from "@/domain/library/codec";
import { DEFAULT_TABVAULT_API_KEY } from "./browserStorage";
import { apiHeaders } from "./client";

export type LocalServerTab = {
  id: string;
  url: string;
  title: string;
  note?: string | null;
  agentReview?: string | null;
  customProperties?: Record<string, unknown>;
  tags: string[];
  groupId?: string | null;
  position?: number;
  updatedAt?: string;
};

/**
 * Read the complete sync document from the local server.
 * @param {string} url - Configured local-server base URL.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<Record<string, unknown>>} Portable library document.
 * @throws {Error} When the sync endpoint rejects the request.
 */
export async function readLibraryFromServer(
  url: string,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/v1/sync`, {
    headers: apiHeaders(apiKey),
  });
  if (!response.ok)
    throw new Error("TabVault API could not read the shared library");
  return response.json() as Promise<Record<string, unknown>>;
}

/**
 * Upload a portable document using the server's merge import mode.
 * The response may include warnings that callers should display after sync.
 * @param {string} url - Configured local-server base URL.
 * @param {Record<string, unknown>} document - Library document to merge.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<{ success: boolean; data?: Record<string, unknown>; warnings?: Array<{ code?: string; message?: string }> }>} Import result and optional warnings.
 * @throws {Error} When the import endpoint rejects the request.
 */
export async function mergeLibraryToServer(
  url: string,
  document: Record<string, unknown>,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/v1/import`, {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify({ mode: "upload", format: "json", content: document }),
  });
  if (!response.ok)
    throw new Error("TabVault API could not sync the shared library");
  return response.json() as Promise<{
    success: boolean;
    data?: Record<string, unknown>;
    warnings?: Array<{ code?: string; message?: string }>;
  }>;
}

/**
 * Reconcile local deletions, upload local state, then read the merged library.
 * Tombstones that fail to delete remotely stay pending in the returned vault.
 * @param {string} url - Configured local-server base URL.
 * @param {string} apiKey - Local-server API key.
 * @param {PersistedVault} localVault - Browser library and pending deletions.
 * @returns {Promise<{ vault: PersistedVault; warnings: Array<{ code?: string; message?: string }> }>} Refreshed vault and import warnings.
 * @throws {Error} When upload or readback fails.
 */
export async function refreshLibraryFromServer(
  url: string,
  apiKey: string,
  localVault: PersistedVault
) {
  const synchronizedVault = await flushDeletionTombstones(
    url,
    apiKey,
    localVault
  );
  const result = await mergeLibraryToServer(
    url,
    toServerDocument(synchronizedVault),
    apiKey
  );
  if (!result.success)
    throw new Error("TabVault API could not merge the shared library");
  const document = await readLibraryFromServer(url, apiKey);
  return {
    vault: fromServerDocument(document, synchronizedVault),
    warnings: result.warnings ?? [],
  };
}

/**
 * Replay browser deletions against the server before the next merge.
 * A missing remote record counts as deleted. A tab blocked from hard deletion
 * is archived and retried; failures remain tombstones for a later sync.
 * @param {string} url - Configured local-server base URL.
 * @param {string} apiKey - Local-server API key.
 * @param {PersistedVault} vault - Library containing pending tab and group deletions.
 * @returns {Promise<PersistedVault>} Library with only unresolved tombstones.
 */
async function flushDeletionTombstones(
  url: string,
  apiKey: string,
  vault: PersistedVault
) {
  const tombstones = vault.tombstones ?? { tabs: [], groups: [] };
  const root = url.replace(/\/+$/, "");
  const remainingGroups: string[] = [];
  for (const id of tombstones.groups) {
    const response = await fetch(
      `${root}/api/v1/groups/${encodeURIComponent(id)}`,
      { method: "DELETE", headers: apiHeaders(apiKey) }
    );
    if (!response.ok && response.status !== 404) remainingGroups.push(id);
  }
  const remainingTabs: string[] = [];
  for (const id of tombstones.tabs) {
    let response = await fetch(
      `${root}/api/v1/tabs/${encodeURIComponent(id)}?hard=true`,
      { method: "DELETE", headers: apiHeaders(apiKey) }
    );
    if (response.status === 409) {
      await fetch(`${root}/api/v1/tabs/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: apiHeaders(apiKey),
        body: JSON.stringify({ archived: true, groupId: null }),
      });
      response = await fetch(
        `${root}/api/v1/tabs/${encodeURIComponent(id)}?hard=true`,
        { method: "DELETE", headers: apiHeaders(apiKey) }
      );
    }
    if (!response.ok && response.status !== 404) remainingTabs.push(id);
  }
  return {
    ...vault,
    tombstones: { tabs: remainingTabs, groups: remainingGroups },
  };
}

/**
 * Ask the server to back up and clear the shared library.
 * @param {string} url - Configured local-server base URL.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<{ success: boolean; cleared: boolean; backup?: string | null }>} Clear result and optional backup path.
 * @throws {Error} When the clear request fails.
 */
export async function clearLibraryOnServer(
  url: string,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/v1/library`, {
    method: "DELETE",
    headers: apiHeaders(apiKey),
  });
  if (!response.ok)
    throw new Error("TabVault API could not clear the shared library");
  return response.json() as Promise<{
    success: boolean;
    cleared: boolean;
    backup?: string | null;
  }>;
}

/**
 * Create a tab on the local server, storing viewed state as a custom property.
 * @param {string} url - Configured local-server base URL.
 * @param {{ id?: string; url: string; title: string; note: string; agentReview?: string; viewed?: boolean; tags: string[]; groupId: string | null; favicon?: string | null }} tab - Saved tab fields and optional group assignment.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<{ success: boolean; data: LocalServerTab }>} Created tab response.
 * @throws {Error} When the server rejects the tab.
 */
export async function saveTabToLocalServer(
  url: string,
  tab: {
    id?: string;
    url: string;
    title: string;
    note: string;
    agentReview?: string;
    viewed?: boolean;
    tags: string[];
    groupId: string | null;
    favicon?: string | null;
  },
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/v1/tabs`, {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify({
      ...tab,
      viewed: undefined,
      customProperties: { viewed: tab.viewed ?? false },
    }),
  });
  if (!response.ok) throw new Error("TabVault local server rejected the tab");
  return response.json() as Promise<{
    success: boolean;
    data: LocalServerTab;
  }>;
}

/**
 * Create one group on the local server from browser group fields.
 * @param {string} url - Configured local-server base URL.
 * @param {{ id?: string; name: string; category: string; description?: string; color?: string; createdAt?: string; updatedAt?: string }} group - Group identity, name, category, and optional metadata.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<unknown>} Server creation response.
 * @throws {Error} When the server rejects the group.
 */
export async function createGroupOnLocalServer(
  url: string,
  group: {
    id?: string;
    name: string;
    category: string;
    description?: string;
    color?: string;
    createdAt?: string;
    updatedAt?: string;
  },
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/v1/groups`, {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify(group),
  });
  if (!response.ok) throw new Error("TabVault local server rejected the group");
  return response.json();
}

/**
 * Patch a saved tab, moving a viewed update into custom properties.
 * @param {string} url - Configured local-server base URL.
 * @param {string} id - Tab identifier to update.
 * @param {Record<string, unknown>} updates - Partial tab fields to persist.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<unknown>} Server update response.
 * @throws {Error} When the server rejects the patch.
 */
export async function updateTabOnLocalServer(
  url: string,
  id: string,
  updates: Record<string, unknown>,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const payload = { ...updates };
  if (typeof payload.viewed === "boolean") {
    payload.customProperties = {
      ...((payload.customProperties as Record<string, unknown> | undefined) ??
        {}),
      viewed: payload.viewed,
    };
    delete payload.viewed;
  }
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/api/v1/tabs/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: apiHeaders(apiKey),
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok)
    throw new Error("TabVault local server could not update the tab");
  return response.json();
}

/**
 * Persist one relative Saved Tab order with a single transactional API request.
 *
 * @param {string} url - Configured local-server base URL.
 * @param {string | null} groupId - Persisted group ID, or null for unassigned tabs.
 * @param {string[]} tabIds - Active saved tab IDs from first to last.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<unknown>} Server envelope confirming the accepted order.
 * @throws {Error} When the server rejects the requested order.
 */
export async function reorderTabsOnLocalServer(
  url: string,
  groupId: string | null,
  tabIds: string[],
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/v1/tabs/order`, {
    method: "PUT",
    headers: apiHeaders(apiKey),
    body: JSON.stringify({ groupId, tabIds }),
  });
  if (!response.ok)
    throw new Error("TabVault local server could not reorder the tabs");
  return response.json();
}

/**
 * Patch one saved group on the local server.
 * @param {string} url - Configured local-server base URL.
 * @param {string} id - Group identifier to update.
 * @param {Record<string, unknown>} updates - Partial group fields to persist.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<unknown>} Server update response.
 * @throws {Error} When the server rejects the patch.
 */
export async function updateGroupOnLocalServer(
  url: string,
  id: string,
  updates: Record<string, unknown>,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/api/v1/groups/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: apiHeaders(apiKey),
      body: JSON.stringify(updates),
    }
  );
  if (!response.ok)
    throw new Error("TabVault local server could not update the collection");
  return response.json();
}

/**
 * Archive a tab, or permanently delete it when hard deletion is requested.
 * @param {string} url - Configured local-server base URL.
 * @param {string} id - Tab identifier to remove.
 * @param {string} apiKey - Local-server API key.
 * @param {boolean} hard - Whether to request permanent deletion.
 * @returns {Promise<unknown>} Server deletion response.
 * @throws {Error} When the server rejects the deletion.
 */
export async function deleteTabOnLocalServer(
  url: string,
  id: string,
  apiKey = DEFAULT_TABVAULT_API_KEY,
  hard = false
) {
  const query = hard ? "?hard=true" : "";
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/api/v1/tabs/${encodeURIComponent(id)}${query}`,
    { method: "DELETE", headers: apiHeaders(apiKey) }
  );
  if (!response.ok)
    throw new Error("TabVault local server could not remove the tab");
  return response.json();
}

/**
 * Delete a group through the local server's archive-first lifecycle.
 * @param {string} url - Configured local-server base URL.
 * @param {string} id - Group identifier to delete.
 * @param {string} apiKey - Local-server API key.
 * @returns {Promise<unknown>} Server deletion response.
 * @throws {Error} When the server rejects the deletion.
 */
export async function deleteGroupOnLocalServer(
  url: string,
  id: string,
  apiKey = DEFAULT_TABVAULT_API_KEY
) {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/api/v1/groups/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: apiHeaders(apiKey) }
  );
  if (!response.ok)
    throw new Error("TabVault local server could not delete the collection");
  return response.json();
}
