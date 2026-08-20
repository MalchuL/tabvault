import assert from "node:assert/strict";
import test from "node:test";
import { tabsForSelection } from "../client/public/popup-selection.js";

test("popup resolves every immediate-save tab selection", () => {
  const tabs = [
    { id: 1 },
    { id: 2, active: true, highlighted: true },
    { id: 3, highlighted: true },
  ];
  const activeTab = tabs[1];

  assert.deepEqual(tabsForSelection(tabs, activeTab, "left"), [tabs[0]]);
  assert.deepEqual(tabsForSelection(tabs, activeTab, "all"), tabs);
  assert.deepEqual(tabsForSelection(tabs, activeTab, "right"), [tabs[2]]);
  assert.deepEqual(tabsForSelection(tabs, activeTab, "chrome"), tabs.slice(1));
});
