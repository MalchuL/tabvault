import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { openSavedLink } from "@/domain/library/components/tabs/tabLinkEvents";
import type { TabListItem } from "@/domain/library/components/tabs/TabList";

/**
 * Display a saved tab favicon or its stored icon fallback.
 * The chosen size matches compact or standard row density.
 * @param {{ tab: TabListItem; size: "compact" | "standard"; }} props - Tab metadata and requested display size.
 * @returns {React.ReactElement} Favicon or stored fallback icon.
 */
export function TabFavicon({
  tab,
  size,
}: {
  tab: TabListItem;
  size: "compact" | "standard";
}) {
  const [failed, setFailed] = useState(false);
  const dimensions = size === "compact" ? "h-6 w-6" : "h-8 w-8";
  if (failed) {
    return (
      <span
        className={`flex ${dimensions} shrink-0 items-center justify-center rounded-[7px] text-[9px] font-bold text-white shadow-sm`}
        style={{ backgroundColor: tab.color }}
        aria-hidden="true"
      >
        {tab.icon}
      </span>
    );
  }
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(tab.url)}&sz=64`}
      alt=""
      className={`${dimensions} shrink-0 rounded-[7px] bg-[#ece7dc] object-cover`}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Render title, metadata, tags, and search evidence for a tab.
 * Opening links and changing viewed state remain delegated to the workspace.
 * @param {{ tab: TabListItem; query: string; score?: number; fallbackMode?: "text_fallback" | "semantic"; hidden: boolean; onOpenTagManager: () => void; onOpen: (tab: TabListItem, url?: string) => void; onViewedChange: (id: string, viewed: boolean) => void; }} props - Tab metadata, search context, and open/viewed handlers.
 * @returns {React.ReactElement} Standard tab content and search evidence.
 */
export function StandardTabContent({
  tab,
  query,
  score,
  fallbackMode,
  hidden,
  onOpenTagManager,
  onOpen,
  onViewedChange,
}: {
  tab: TabListItem;
  query: string;
  score?: number;
  fallbackMode?: "text_fallback" | "semantic";
  hidden: boolean;
  onOpenTagManager: () => void;
  onOpen: (tab: TabListItem, url?: string) => void;
  onViewedChange: (id: string, viewed: boolean) => void;
}) {
  return (
    <>
      <TabFavicon tab={tab} size="standard" />
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 items-start gap-2">
          <a
            href={tab.url}
            target="_blank"
            rel="noreferrer"
            onClick={event => openSavedLink(event, tab, onOpen)}
            onAuxClick={event => openSavedLink(event, tab, onOpen)}
            className="block min-w-0 truncate text-[13px] font-bold leading-5 tracking-[-0.015em] text-[#26342c] hover:text-[#e95224] hover:underline"
            title={tab.title}
          >
            {tab.title}
          </a>
          <ViewedCheckbox tab={tab} hidden={hidden} onChange={onViewedChange} />
          <ArrowUpRight className="mt-1 hidden h-3.5 w-3.5 shrink-0 text-[#9a9c95] group-hover:block" />
        </div>
        <p
          className="mt-1 truncate text-[10px] font-medium text-[#84877f]"
          title={`${tab.domain} · updated ${tab.updatedAt}`}
        >
          {tab.domain} <span className="mx-1.5 text-[#c4c1b9]">·</span> updated{" "}
          {tab.updatedAt}
        </p>
        <p
          className="mt-1.5 max-w-2xl truncate text-[11px] leading-5 text-[#666d65]"
          title={tab.note}
        >
          {tab.note}
        </p>
        <div className="mt-2 flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
          {tab.tags.slice(0, 3).map(tag => (
            <Button
              variant="ghost"
              key={tag}
              onClick={onOpenTagManager}
              title={tag}
              className="max-w-28 shrink truncate rounded border border-[#ded9cd] bg-[#f9f7f1] px-1.5 py-[3px] font-mono text-[9px] text-[#747a72] transition hover:border-[#e95224] hover:text-[#e95224]"
            >
              {tag}
            </Button>
          ))}
          {tab.tags.length > 3 && (
            <Button
              variant="ghost"
              onClick={onOpenTagManager}
              title={tab.tags.slice(3).join(", ")}
              className="shrink-0 rounded border border-[#ded9cd] bg-[#f9f7f1] px-1.5 py-[3px] font-mono text-[9px] text-[#747a72] transition hover:border-[#e95224] hover:text-[#e95224]"
            >
              +{tab.tags.length - 3}
            </Button>
          )}
          {query && score === undefined && (
            <span className="ml-1 font-mono text-[9px] text-[#be742e]">
              {fallbackMode === "text_fallback" ? "text match" : "local match"}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Toggle viewed state without triggering the surrounding tab row.
 * Hidden tabs also show their valid future restore time.
 * @param {{ tab: TabListItem; hidden?: boolean; onChange: (id: string, viewed: boolean) => void; }} props - Tab, optional hidden state, and viewed change handler.
 * @returns {React.ReactElement} Viewed toggle with optional hide deadline.
 */
export function ViewedCheckbox({
  tab,
  hidden = false,
  onChange,
}: {
  tab: TabListItem;
  hidden?: boolean;
  onChange: (id: string, viewed: boolean) => void;
}) {
  const hiddenUntil = tab.hiddenUntil ? new Date(tab.hiddenUntil) : null;
  return (
    <>
      <Checkbox
        checked={tab.viewed}
        onCheckedChange={checked => onChange(tab.id, checked === true)}
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
        className="mt-1 h-3.5 w-3.5 shrink-0 accent-[#e95224]"
        aria-label={`Mark ${tab.title} as viewed`}
        title="Viewed"
      />
      {hidden && hiddenUntil && !Number.isNaN(hiddenUntil.getTime()) && (
        <span
          className="mt-0.5 max-w-48 shrink-0 truncate font-mono text-[8px] uppercase tracking-[0.06em] text-[#8a704f]"
          title={`Resting until ${hiddenUntil.toLocaleString()}`}
        >
          Resting until{" "}
          {hiddenUntil.toLocaleString([], {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
      )}
    </>
  );
}
