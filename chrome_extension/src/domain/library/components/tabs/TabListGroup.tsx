import { Button } from "@/components/ui/button";
import { useDragOperation, useDroppable } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { pointerIntersection } from "@dnd-kit/collision";
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
import { groupColorBackground } from "@/domain/library/collectionColor";
import { CollectionCategoryToggle } from "../collections/CollectionCategoryToggle";
import { CollectionColorPicker } from "../collections/CollectionColorPicker";
import { CollectionNameEditor } from "../collections/CollectionNameEditor";
import { HideDurationMenu } from "@/domain/library/components/shared/HideDurationMenu";

/**
 * Register a list group as a tab drop destination.
 * The drop gap reserves space for the dragged tab unless dropping is disabled.
 * @param {{ groupId: string; groupName: string; groupColor?: string; dropGapHeight: number; disabled: boolean; children: ReactNode; }} props - Group identity and color, reserved drop height, disabled state, and contents.
 * @returns {React.ReactElement} Droppable list section.
 */
export function DroppableGroup({
  groupId,
  groupName,
  groupColor,
  dropGapHeight,
  disabled,
  children,
}: {
  groupId: string;
  groupName: string;
  groupColor?: string;
  dropGapHeight: number;
  disabled: boolean;
  children: ReactNode;
}) {
  const { isDropTarget, ref } = useDroppable({
    id: `group-container:${groupId}`,
    data: { groupId },
    collisionDetector: pointerIntersection,
    // Pointer hits on tabs (3) take priority over this collection background.
    collisionPriority: 2,
    disabled,
  });

  const { target } = useDragOperation();
  // A tab wins collision detection over its parent, but both belong to the same destination.
  const active =
    !disabled &&
    (isDropTarget ||
      (target && isSortable(target) && target.group === groupId));

  return (
    <section
      ref={ref}
      style={{
        paddingBottom: dropGapHeight,
        backgroundColor:
          groupColor !== undefined && !active
            ? groupColorBackground(groupColor, 8)
            : undefined,
      }}
      data-testid={`tab-group-${groupId}`}
      data-drop-active={active ? "true" : "false"}
      data-drop-gap-height={dropGapHeight}
      className="data-[drop-active=true]:bg-[#fff7f1] data-[drop-active=true]:ring-1 data-[drop-active=true]:ring-inset data-[drop-active=true]:ring-[#e95224]"
      aria-label={`Drop a tab into ${groupName}`}
    >
      {children}
    </section>
  );
}

/** Group for GroupSeparatorProps. */
type GroupSeparatorGroup = {
  groupId: string;
  groupName: string;
  groupCategory?: string;
  groupColor?: string;
  tabCount: number;
};
/** Collapse for GroupSeparatorProps. */
type GroupSeparatorCollapse = {
  collapsible: boolean;
  collapsed: boolean;
  onToggle?: (groupId: string) => void;
};
/** Interaction handlers for GroupSeparatorProps. */
type GroupSeparatorActions = {
  onRename?: (groupId: string, name: string) => void;
  onOpen?: (groupId: string) => void;
  onShare?: (groupId: string) => void;
  onDelete?: (groupId: string) => void;
  onEdit?: (groupId: string) => void;
  onColorChange?: (groupId: string, color: string | undefined) => void;
  onCategoryToggle?: (groupId: string) => void;
};
/** Archive and hidden state for GroupSeparatorProps. */
type GroupSeparatorLifecycle = {
  lifecycleMode: "visible" | "hidden" | "archived";
  onHide?: (groupId: string, durationMs: number) => void;
  onUnhide?: (groupId: string) => void;
  onProlong?: (groupId: string, durationMs: number) => void;
};
/** Properties supplied to GroupSeparator. */
type GroupSeparatorProps = {
  group: GroupSeparatorGroup;
  collapse: GroupSeparatorCollapse;
  actions: GroupSeparatorActions;
  lifecycle: GroupSeparatorLifecycle;
};
/**
 * Show a group heading with view-specific lifecycle actions.
 * Collapse, archive, hide, and group actions are delegated to the owning workspace.
 * @param {GroupSeparatorProps} props - Group metadata, collapse state, lifecycle mode, and owner actions.
 * @returns {React.ReactElement} Group heading and action controls.
 */
export function GroupSeparator({
  group: { groupId, groupName, groupCategory, groupColor, tabCount },
  collapse: { collapsible, collapsed, onToggle },
  actions: {
    onRename,
    onOpen,
    onShare,
    onDelete,
    onEdit,
    onColorChange,
    onCategoryToggle,
  },
  lifecycle: { lifecycleMode, onHide, onUnhide, onProlong },
}: GroupSeparatorProps) {
  return (
    <div
      data-testid={`group-separator-${groupId}`}
      style={{
        backgroundColor:
          groupColor !== undefined
            ? groupColorBackground(groupColor, 18)
            : undefined,
      }}
      className="flex min-h-10 items-start justify-between gap-3 border-y border-[#dfdbd0] bg-[#f9f7f1] px-3 py-2 text-xs text-[#626a60]"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <div className="grid min-w-0 flex-1 grid-cols-[24px_32px_minmax(0,1fr)_32px] items-center gap-1.5">
          {collapsible ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onToggle?.(groupId)}
              className="size-6 p-0 hover:text-[#e95224]"
              aria-label={`${collapsed ? "Expand" : "Collapse"} ${groupName}`}
              aria-expanded={!collapsed}
            >
              {collapsed ? (
                <ChevronRight className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
          {groupId !== "unassigned" && onColorChange ? (
            <CollectionColorPicker
              name={groupName}
              color={groupColor}
              onChange={color => onColorChange(groupId, color)}
            />
          ) : (
            <span
              className="flex size-8 items-center justify-center"
              aria-hidden="true"
            >
              <FolderOpen className="size-4" />
            </span>
          )}
          <CollectionNameEditor
            name={groupName}
            className="text-sm font-semibold leading-5"
            onRename={
              groupId !== "unassigned" && onRename
                ? name => onRename(groupId, name)
                : undefined
            }
          />
          {groupCategory ? (
            <CollectionCategoryToggle
              name={groupName}
              category={groupCategory}
              onToggle={() => onCategoryToggle?.(groupId)}
            />
          ) : (
            <span aria-hidden="true" />
          )}
        </div>
        {collapsible && (
          <div
            className="flex w-full shrink-0 items-center gap-0.5 sm:w-auto sm:border-l sm:border-[#d9d3c6] sm:pl-1.5"
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
              className="size-6 rounded p-1 text-[#626a60] hover:bg-white hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
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
              className="size-6 rounded p-1 text-[#626a60] hover:bg-white hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
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
              disabled={groupId === "unassigned"}
              className="size-6 rounded p-1 text-[#626a60] hover:bg-white hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
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
              className="size-6 rounded p-1 text-[#626a60] hover:bg-white hover:text-[#c84b26] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224] disabled:cursor-not-allowed disabled:opacity-35"
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
      <span className="shrink-0 pt-2">{tabCount} tabs</span>
    </div>
  );
}
