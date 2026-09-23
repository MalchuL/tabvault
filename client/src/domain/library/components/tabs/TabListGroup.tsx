import { Button } from "@/components/ui/button";
import { useDroppable } from "@dnd-kit/core";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FolderOpen,
  Pencil,
  Share2,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { categoryColor } from "@/domain/library/categoryColor";
import { HideDurationMenu } from "@/domain/library/components/shared/HideDurationMenu";

/**
 * Register a list group as a tab drop destination.
 * The drop gap reserves space for the dragged tab unless dropping is disabled.
 * @param {{ groupId: string; groupName: string; dropGapHeight: number; disabled: boolean; children: ReactNode; }} props - Group identity, reserved drop height, disabled state, and contents.
 * @returns {React.ReactElement} Droppable list section.
 */
export function DroppableGroup({
  groupId,
  groupName,
  dropGapHeight,
  disabled,
  children,
}: {
  groupId: string;
  groupName: string;
  dropGapHeight: number;
  disabled: boolean;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `group-container:${groupId}`,
    data: { groupId },
    disabled,
  });

  return (
    <section
      ref={setNodeRef}
      style={{ paddingBottom: dropGapHeight }}
      data-testid={`tab-group-${groupId}`}
      data-drop-active={isOver ? "true" : "false"}
      data-drop-gap-height={dropGapHeight}
      aria-label={`Drop a tab into ${groupName}`}
    >
      {children}
    </section>
  );
}

/**
 * Show a group heading with view-specific lifecycle actions.
 * Collapse, archive, hide, and group actions are delegated to the owning workspace.
 * @param {{ groupId: string; groupName: string; groupCategory?: string; tabCount: number; collapsible: boolean; collapsed: boolean; onToggle?: (groupId: string) => void; onOpen?: (groupId: string) => void; onShare?: (groupId: string) => void; onDelete?: (groupId: string) => void; onEdit?: (groupId: string) => void; lifecycleMode: "visible" | "hidden" | "archived"; onHide?: (groupId: string, durationMs: number) => void; onUnhide?: (groupId: string) => void; onProlong?: (groupId: string, durationMs: number) => void; }} props - Group metadata, collapse state, lifecycle mode, and owner actions.
 * @returns {React.ReactElement} Group heading and action controls.
 */
export function GroupSeparator({
  groupId,
  groupName,
  groupCategory,
  tabCount,
  collapsible,
  collapsed,
  onToggle,
  onOpen,
  onShare,
  onDelete,
  onEdit,
  lifecycleMode,
  onHide,
  onUnhide,
  onProlong,
}: {
  groupId: string;
  groupName: string;
  groupCategory?: string;
  tabCount: number;
  collapsible: boolean;
  collapsed: boolean;
  onToggle?: (groupId: string) => void;
  onOpen?: (groupId: string) => void;
  onShare?: (groupId: string) => void;
  onDelete?: (groupId: string) => void;
  onEdit?: (groupId: string) => void;
  lifecycleMode: "visible" | "hidden" | "archived";
  onHide?: (groupId: string, durationMs: number) => void;
  onUnhide?: (groupId: string) => void;
  onProlong?: (groupId: string, durationMs: number) => void;
}) {
  return (
    <div
      data-testid={`group-separator-${groupId}`}
      className="flex min-h-10 items-center justify-between gap-3 border-y border-[#dfdbd0] bg-[#f9f7f1] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#777d75]"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {groupCategory && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor(groupCategory) }}
            title={`Category: ${groupCategory}`}
          />
        )}
        {collapsible ? (
          <Button
            variant="ghost"
            onClick={() => onToggle?.(groupId)}
            className="h-auto min-w-0 shrink items-center gap-1.5 truncate px-0 py-0 hover:text-[#e95224]"
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronRight className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronDown className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate">{groupName}</span>
          </Button>
        ) : (
          <span>{groupName}</span>
        )}
        {collapsible && (
          <div
            className="flex shrink-0 items-center gap-0.5 border-l border-[#d9d3c6] pl-1.5"
            aria-label={`${groupName} collection actions`}
          >
            {lifecycleMode === "hidden" && (
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                onClick={() => onUnhide?.(groupId)}
                className="size-6 rounded p-1 text-[#56815d] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#56815d]"
                aria-label={`Unhide ${groupName}`}
                title={`Unhide ${groupName}`}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            )}
            {lifecycleMode !== "archived" && (
              <HideDurationMenu
                mode={lifecycleMode === "hidden" ? "prolong" : "hide"}
                target={groupName}
                onSelect={duration =>
                  lifecycleMode === "hidden"
                    ? onProlong?.(groupId, duration)
                    : onHide?.(groupId, duration)
                }
              />
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              onClick={() => onOpen?.(groupId)}
              className="size-6 rounded p-1 text-[#7b8078] hover:bg-white hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
              aria-label={`Open all tabs in ${groupName}`}
              title="Open all tabs"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              onClick={() => onShare?.(groupId)}
              className="size-6 rounded p-1 text-[#7b8078] hover:bg-white hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
              aria-label={`Copy ${groupName} as Markdown`}
              title="Copy as Markdown"
            >
              <Share2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              onClick={() => onEdit?.(groupId)}
              className="size-6 rounded p-1 text-[#7b8078] hover:bg-white hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
              aria-label={`Edit ${groupName}`}
              title="Edit collection"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              onClick={() => onDelete?.(groupId)}
              disabled={groupId === "unassigned"}
              className="size-6 rounded p-1 text-[#7b8078] hover:bg-white hover:text-[#c84b26] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224] disabled:cursor-not-allowed disabled:opacity-35"
              aria-label={
                groupId === "unassigned"
                  ? "Unassigned is virtual"
                  : `Delete ${groupName}`
              }
              title={
                groupId === "unassigned"
                  ? "Unassigned is virtual"
                  : "Delete collection"
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
      <span className="shrink-0">{tabCount} tabs</span>
    </div>
  );
}
