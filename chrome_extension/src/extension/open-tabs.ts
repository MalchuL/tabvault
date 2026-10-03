import {
  isGroupColor,
  type GroupColor,
} from "@/domain/library/collectionColor";

export type OpenTabGroup = { title: string; color: GroupColor };
export type OpenTabsResponse = {
  openedCount: number;
  requestedCount: number;
  openedUrls: string[];
  groupError?: string;
};

/** Open distinct supported URLs and optionally group the successful tabs. Group failures preserve opening results so callers can still record viewed state. @param {string[]} urls - Requested URLs. @param {OpenTabGroup | undefined} group - Optional collection name and Chrome color. @returns {Promise<OpenTabsResponse>} Successful URLs, counts, and any group failure. @throws {Error} Requested group color is incorrect. */
export async function openChromeTabs(
  urls: string[],
  group?: OpenTabGroup
): Promise<OpenTabsResponse> {
  if (group && !isGroupColor(group.color))
    throw new Error("Color is incorrect");
  const validUrls = [...new Set(urls)].filter(url => /^https?:\/\//i.test(url));
  const openedUrls: string[] = [];
  const tabIds: number[] = [];
  for (const url of validUrls) {
    try {
      const tab = await chrome.tabs.create({ url, active: false });
      openedUrls.push(url);
      if (typeof tab?.id === "number") tabIds.push(tab.id);
    } catch {
      // One failed navigation must not prevent the remaining collection from opening.
    }
  }
  const result: OpenTabsResponse = {
    openedUrls,
    openedCount: openedUrls.length,
    requestedCount: validUrls.length,
  };
  if (group && openedUrls.length) {
    try {
      if (!tabIds.length) throw new Error("Opened tabs have no Chrome tab IDs");
      const groupId = await chrome.tabs.group({
        tabIds: [tabIds[0], ...tabIds.slice(1)],
      });
      await chrome.tabGroups.update(groupId, group);
    } catch (error) {
      result.groupError =
        error instanceof Error ? error.message : String(error);
    }
  }
  return result;
}
