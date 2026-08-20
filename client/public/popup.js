import { tabsForSelection } from "./popup-selection.js";

const state = {
  allTabs: [],
  activeTab: null,
  selectedTabs: [],
  mode: "all",
};

const tabCount = document.querySelector("#tab-count");
const selectionCopy = document.querySelector("#selection-copy");
const result = document.querySelector("#result");
const directionButtons = [...document.querySelectorAll(".direction-button")];
const selectionControls = [
  ...directionButtons,
  document.querySelector("#use-chrome-selection"),
];

function setSelection(mode) {
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
      : "Saving this tab set to Inbox and closing those tabs.";
}

function updateSelectionCounts() {
  document.querySelectorAll("[data-selection-count]").forEach(element => {
    const count = tabsForSelection(
      state.allTabs,
      state.activeTab,
      element.dataset.selectionCount
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

async function saveAndClose() {
  if (!state.selectedTabs.length) return;
  selectionControls.forEach(button => (button.disabled = true));
  result.classList.remove("is-error");
  result.textContent = "Saving selected tabs…";
  result.hidden = false;

  let response;
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
  result.textContent = `${response.savedCount} saved and ${response.closedCount} closed.${skipped}`;
  window.setTimeout(() => window.close(), 550);
}

directionButtons.forEach(button => {
  button.addEventListener("click", () => {
    setSelection(button.dataset.selection);
    void saveAndClose();
  });
});
document
  .querySelector("#use-chrome-selection")
  .addEventListener("click", () => {
    setSelection("chrome");
    void saveAndClose();
  });
document
  .querySelector("#open-workspace")
  .addEventListener("click", () => void openWorkspace());
void loadTabs().catch(() => {
  tabCount.textContent = "Tabs unavailable";
  result.classList.add("is-error");
  result.textContent = "Open a normal browser window, then try again.";
  result.hidden = false;
  selectionControls.forEach(button => (button.disabled = true));
});
