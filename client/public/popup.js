const state = {
  allTabs: [],
  activeTab: null,
  selectedTabs: [],
  mode: "all",
};

const tabCount = document.querySelector("#tab-count");
const selectionSummary = document.querySelector("#selection-summary");
const selectionCopy = document.querySelector("#selection-copy");
const saveButton = document.querySelector("#save-selected");
const result = document.querySelector("#result");
const directionButtons = [...document.querySelectorAll(".direction-button")];

function describeSelection() {
  const count = state.selectedTabs.length;
  const noun = count === 1 ? "tab" : "tabs";
  const label =
    state.mode === "chrome" ? "Chrome selection" : `${state.mode} selection`;
  selectionSummary.textContent = `${count} ${noun} in ${label}.`;
  saveButton.textContent = `Save ${count || "no"} selected & close`;
  saveButton.disabled = count === 0;
}

function setSelection(mode) {
  state.mode = mode;
  const activeIndex = state.allTabs.findIndex(
    tab => tab.id === state.activeTab?.id
  );
  if (mode === "left")
    state.selectedTabs = state.allTabs.slice(0, Math.max(activeIndex, 0));
  if (mode === "all") state.selectedTabs = [...state.allTabs];
  if (mode === "right")
    state.selectedTabs = state.allTabs.slice(activeIndex + 1);
  if (mode === "chrome") {
    const highlighted = state.allTabs.filter(tab => tab.highlighted);
    state.selectedTabs = highlighted.length
      ? highlighted
      : state.activeTab
        ? [state.activeTab]
        : [];
  }

  directionButtons.forEach(button => {
    const active = button.dataset.selection === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  selectionCopy.textContent =
    mode === "chrome"
      ? "Using tabs highlighted in Chrome. If none are highlighted, the active tab is used."
      : "Select a direction, then save it to Inbox and close those tabs.";
  describeSelection();
}

async function loadTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  state.allTabs = tabs.filter(tab => Boolean(tab.id));
  state.activeTab = state.allTabs.find(tab => tab.active) || null;
  tabCount.textContent = `${state.allTabs.length} open`;
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
  result.hidden = true;
  saveButton.disabled = true;
  saveButton.textContent = "Saving selected tabs…";
  const response = await chrome.runtime.sendMessage({
    type: "TABVAULT_FAST_SAVE_AND_CLOSE",
    tabs: state.selectedTabs.map(tab => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
    })),
  });

  result.hidden = false;
  if (response?.error) {
    result.classList.add("is-error");
    result.textContent = "Could not save those tabs. They were left open.";
    describeSelection();
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
  button.addEventListener("click", () =>
    setSelection(button.dataset.selection)
  );
});
document
  .querySelector("#use-chrome-selection")
  .addEventListener("click", () => setSelection("chrome"));
document
  .querySelector("#open-workspace")
  .addEventListener("click", () => void openWorkspace());
saveButton.addEventListener("click", () => void saveAndClose());

void loadTabs().catch(() => {
  tabCount.textContent = "Tabs unavailable";
  selectionSummary.textContent =
    "Open a normal browser window, then try again.";
  saveButton.disabled = true;
});
