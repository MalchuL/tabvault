export function tabsForSelection(allTabs, activeTab, mode) {
  const activeIndex = allTabs.findIndex(tab => tab.id === activeTab?.id);
  if (mode === "left") return allTabs.slice(0, Math.max(activeIndex, 0));
  if (mode === "all") return [...allTabs];
  if (mode === "right") return allTabs.slice(activeIndex + 1);

  const highlighted = allTabs.filter(tab => tab.highlighted);
  return highlighted.length ? highlighted : activeTab ? [activeTab] : [];
}
