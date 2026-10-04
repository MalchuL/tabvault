import type { VaultGroup } from "@/domain/library/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Archive, Eye, FolderInput, Pencil, Trash2 } from "lucide-react";
import { HideDurationMenu } from "@/domain/library/components/shared/HideDurationMenu";
import type { TabListItem } from "@/domain/library/components/tabs/TabList";
import type { TabViewMode } from "@/domain/library/types";

/** Interaction handlers for TabRowActionsProps. */
type TabRowActionsActions = {
  onMove: (id: string, groupId: string | null) => void;
  onEdit: (tab: TabListItem) => void;
  onDelete: (tab: TabListItem) => void;
};
/** Archive and hidden state for TabRowActionsProps. */
type TabRowActionsLifecycle = {
  lifecycleMode: "visible" | "hidden" | "archived";
  onRestore?: (tab: TabListItem) => void;
  onHide?: (tab: TabListItem, durationMs: number) => void;
  onUnhide?: (tab: TabListItem) => void;
  onProlong?: (tab: TabListItem, durationMs: number) => void;
};
type TabRowActionsProps = {
  tab: TabListItem;
  viewMode: TabViewMode;
  groups: Array<Pick<VaultGroup, "id" | "details">>;
  actions: TabRowActionsActions;
  lifecycle: TabRowActionsLifecycle;
};

/**
 * Render move, edit, and lifecycle controls in the current tab layout.
 * A fragment preserves each parent's flex layout; compact controls stop events
 * from reaching the row while all mutations remain owned by the workspace.
 * @param {TabRowActionsProps} props - Tab, display mode, destinations, and action callbacks.
 * @returns {React.ReactElement} Tab actions without an additional layout wrapper.
 */
export function TabRowActions({
  tab,
  viewMode,
  groups,
  actions: { onMove, onEdit, onDelete },
  lifecycle: { lifecycleMode, onRestore, onHide, onUnhide, onProlong },
}: TabRowActionsProps) {
  const compact = viewMode === "compact";
  const standard = viewMode === "standard";
  const destructiveAction =
    lifecycleMode === "archived" ? "Permanently delete" : "Archive";
  const actionClassName = `size-8 shrink-0 rounded p-1 text-[#626a60]${standard ? " mt-0.5" : ""}`;
  const ArchiveIcon = lifecycleMode === "archived" ? Trash2 : Archive;
  const compactFocusClassName = compact
    ? " focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e95224]"
    : "";
  return (
    <>
      <ManualGroupMoveMenu
        tab={tab}
        groups={groups}
        onMove={onMove}
        className={`${actionClassName} hover:bg-[#fff0ea] hover:text-[#e95224]${compactFocusClassName}`}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        type={compact ? "button" : undefined}
        onClick={event => {
          if (compact) event.stopPropagation();
          onEdit(tab);
        }}
        onPointerDown={compact ? event => event.stopPropagation() : undefined}
        className={`${actionClassName} ${compact ? "hover:bg-[#fff0ea]" : "hover:bg-[#efede6]"} hover:text-[#e95224]${compactFocusClassName}`}
        aria-label={`Edit ${tab.content.title}`}
        title={`Edit ${tab.content.title}`}
      >
        <Pencil className="size-4" />
      </Button>
      <TabLifecycleActions
        tab={tab}
        mode={lifecycleMode}
        onRestore={onRestore}
        onHide={onHide}
        onUnhide={onUnhide}
        onProlong={onProlong}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        type={compact ? "button" : undefined}
        onClick={event => {
          if (compact) event.stopPropagation();
          onDelete(tab);
        }}
        onPointerDown={compact ? event => event.stopPropagation() : undefined}
        className={`${actionClassName} hover:bg-[#fff0ea] hover:text-[#c84b26]${compactFocusClassName}`}
        aria-label={`${destructiveAction} ${tab.content.title}`}
        title={`${destructiveAction} ${tab.content.title}`}
      >
        <ArchiveIcon className="size-4" />
      </Button>
    </>
  );
}

/**
 * Offer manual groups as destinations for a saved tab.
 * Session and automatic groups are not user-selected move targets.
 * @param {{ tab: TabListItem; groups: Array<Pick<VaultGroup, "id" | "details">>; onMove: (id: string, groupId: string | null) => void; className: string; }} props - Tab, available groups, move handler, and button classes.
 * @returns {React.ReactElement | null} Icon button and destination menu, or null when no manual group exists.
 */
function ManualGroupMoveMenu({
  tab,
  groups,
  onMove,
  className,
}: {
  tab: TabListItem;
  groups: Array<Pick<VaultGroup, "id" | "details">>;
  onMove: (id: string, groupId: string | null) => void;
  className: string;
}) {
  const manualGroups = groups.filter(
    group => group.details.category === "manual"
  );
  if (!manualGroups.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          aria-label={`Move ${tab.content.title}`}
          title="Move to…"
          className={className}
          onClick={event => event.stopPropagation()}
          onPointerDown={event => event.stopPropagation()}
        >
          <FolderInput className="size-3.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="border-[#d9d3c6] bg-[#fffdf8] text-[#26342c]"
        onClick={event => event.stopPropagation()}
      >
        {manualGroups.map(group => (
          <DropdownMenuItem
            key={group.id}
            disabled={group.id === tab.placement.groupId}
            onSelect={() => onMove(tab.id, group.id)}
            className="text-sm focus:bg-[#fff0ea] focus:text-[#c1431b]"
          >
            {group.details.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Show restore, hide, or prolong controls for a tab.
 * Available actions follow the tab’s current visible, hidden, or archived view.
 * @param {{ tab: TabListItem; mode: "visible" | "hidden" | "archived"; onRestore?: (tab: TabListItem) => void; onHide?: (tab: TabListItem, durationMs: number) => void; onUnhide?: (tab: TabListItem) => void; onProlong?: (tab: TabListItem, durationMs: number) => void; }} props - Tab, lifecycle view, and available transition callbacks.
 * @returns {React.ReactElement} Controls allowed in the current lifecycle view.
 */
function TabLifecycleActions({
  tab,
  mode,
  onRestore,
  onHide,
  onUnhide,
  onProlong,
}: {
  tab: TabListItem;
  mode: "visible" | "hidden" | "archived";
  onRestore?: (tab: TabListItem) => void;
  onHide?: (tab: TabListItem, durationMs: number) => void;
  onUnhide?: (tab: TabListItem) => void;
  onProlong?: (tab: TabListItem, durationMs: number) => void;
}) {
  if (mode === "archived")
    return (
      <Button
        variant="ghost"
        type="button"
        onClick={() => onRestore?.(tab)}
        className="rounded px-2 py-1 text-sm text-[#365e3d] hover:bg-[#edf2ea]"
      >
        Restore
      </Button>
    );
  return (
    <div className="flex items-center gap-1">
      {mode === "hidden" && (
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          onClick={() => onUnhide?.(tab)}
          className="size-6 rounded p-1 text-[#56815d] hover:bg-[#edf2ea] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#56815d]"
          aria-label={`Unhide ${tab.content.title}`}
          title={`Unhide ${tab.content.title}`}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
      )}
      <HideDurationMenu
        mode={mode === "hidden" ? "prolong" : "hide"}
        target={tab.content.title}
        onSelect={duration =>
          mode === "hidden"
            ? onProlong?.(tab, duration)
            : onHide?.(tab, duration)
        }
      />
    </div>
  );
}
