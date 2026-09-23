import { tabsForSelection, type TabSelectionMode } from "./popup-selection";

const state: {
  allTabs: chrome.tabs.Tab[];
  activeTab: chrome.tabs.Tab | null;
  selectedTabs: chrome.tabs.Tab[];
  mode: TabSelectionMode;
} = {
  allTabs: [],
  activeTab: null,
  selectedTabs: [],
  mode: "all",
};

const tabCount = document.querySelector<HTMLElement>("#tab-count")!;
const selectionCopy = document.querySelector<HTMLElement>("#selection-copy")!;
const result = document.querySelector<HTMLElement>("#result")!;
const directionButtons = [
  ...document.querySelectorAll<HTMLButtonElement>(".direction-button"),
];
const selectionControls = [
  ...directionButtons,
  document.querySelector<HTMLButtonElement>("#use-chrome-selection")!,
];

function setSelection(mode: TabSelectionMode) {
  state.mode = mode;
  state.selectedTabs = tabsForSelection(state.allTabs, state.activeTab, mode);

  directionButtons.forEach(button => {
    const active = button.dataset.selection === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  selectionCopy.textContent =
    mode === "chrome"
      ? "Using tabs highlighted in Chrome. If none are highlighted, the active tab is used."
      : "Saving this tab set to a new Session group and closing those tabs.";
}

function updateSelectionCounts() {
  document
    .querySelectorAll<HTMLElement>("[data-selection-count]")
    .forEach(element => {
      const count = tabsForSelection(
        state.allTabs,
        state.activeTab,
        element.dataset.selectionCount as TabSelectionMode
      ).length;
      element.textContent = `{${count}}`;
    });
}

async function loadTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  state.allTabs = tabs.filter(tab => Boolean(tab.id));
  state.activeTab = state.allTabs.find(tab => tab.active) || null;
  tabCount.textContent = `${state.allTabs.length} open`;
  updateSelectionCounts();
  setSelection("all");
}

async function openWorkspace() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!activeTab?.windowId) return;
  await chrome.sidePanel.open({ windowId: activeTab.windowId });
  window.close();
}

async function openWorkspacePage() {
  await chrome.tabs.create({
    url: chrome.runtime.getURL("index.html?view=tab"),
    active: true,
  });
  window.close();
}

async function saveAndClose() {
  if (!state.selectedTabs.length) return;
  selectionControls.forEach(button => (button.disabled = true));
  result.classList.remove("is-error");
  result.textContent = "Saving selected tabs…";
  result.hidden = false;

  let response: {
    error?: boolean;
    savedCount?: number;
    closedCount?: number;
    skippedCount?: number;
    failedCount?: number;
  };
  try {
    response = await chrome.runtime.sendMessage({
      type: "TABVAULT_FAST_SAVE_AND_CLOSE",
      tabs: state.selectedTabs.map(tab => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
      })),
    });
  } catch {
    response = { error: true };
  }

  if (response?.error) {
    result.classList.add("is-error");
    result.textContent = "Could not save those tabs. They were left open.";
    selectionControls.forEach(button => (button.disabled = false));
    return;
  }
  result.classList.remove("is-error");
  const skipped = response.skippedCount
    ? ` ${response.skippedCount} internal tab(s) stayed open.`
    : "";
  const failed = response.failedCount
    ? ` ${response.failedCount} tab(s) failed locally and stayed open.`
    : "";
  result.textContent = `${response.savedCount} saved and ${response.closedCount} closed.${skipped}${failed}`;
  window.setTimeout(() => window.close(), 550);
}

directionButtons.forEach(button => {
  button.addEventListener("click", () => {
    setSelection(button.dataset.selection as TabSelectionMode);
    void saveAndClose();
  });
});
document
  .querySelector<HTMLButtonElement>("#use-chrome-selection")!
  .addEventListener("click", () => {
    setSelection("chrome");
    void saveAndClose();
  });
document
  .querySelector<HTMLButtonElement>("#open-workspace")!
  .addEventListener("click", () => void openWorkspace());
document
  .querySelector<HTMLButtonElement>("#open-workspace-page")!
  .addEventListener("click", () => void openWorkspacePage());
void loadTabs().catch(() => {
  tabCount.textContent = "Tabs unavailable";
  result.classList.add("is-error");
  result.textContent = "Open a normal browser window, then try again.";
  result.hidden = false;
  selectionControls.forEach(button => (button.disabled = true));
});
