import { useDroppable } from "@dnd-kit/core";
import type { VaultGroup } from "@/domain/library/types";
import { categoryColor } from "@/domain/library/categoryColor";

/**
 * Offer manual groups as quick drop targets during tab dragging.
 * Automatic groups are excluded because they are not manual destinations.
 * @param {{ groups: VaultGroup[] }} props - Available vault groups.
 * @returns {JSX.Element | null} Drop shelf, or null without manual groups.
 */
export function CollectionDropShelf({ groups }: { groups: VaultGroup[] }) {
  const manualGroups = groups.filter(group => group.category === "manual");
  if (!manualGroups.length) return null;

  return (
    <div
      data-testid="collection-drop-shelf"
      className="flex flex-wrap items-center gap-1.5 border-b border-[#dfdbd0] bg-[#f9f7f1] px-3 py-1.5"
    >
      <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#9a9c95]">
        Quick move
      </span>
      {manualGroups.map(group => (
        <CollectionDropChip key={group.id} group={group} />
      ))}
    </div>
  );
}

/**
 * Register one group as a droppable tab destination.
 * @param {{ group: VaultGroup }} props - Manual group represented by the chip.
 * @returns {JSX.Element} Chip with active drop feedback.
 */
function CollectionDropChip({ group }: { group: VaultGroup }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `collection-drop:${group.id}`,
    data: { groupId: group.id },
  });

  return (
    <div
      ref={setNodeRef}
      data-testid={`collection-drop-${group.id}`}
      data-drop-active={isOver ? "true" : "false"}
      className={`flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.06em] transition ${isOver ? "border-[#e95224] bg-[#fff0ea] text-[#c84b26]" : "border-[#d9d3c6] bg-[#fffdf8] text-[#7a7e76]"}`}
      aria-label={`Drop a tab into ${group.name}`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: categoryColor(group.category) }}
      />
      {group.name}
    </div>
  );
}
