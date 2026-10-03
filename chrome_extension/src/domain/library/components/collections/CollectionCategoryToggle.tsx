import { Pin, PinOff } from "lucide-react";
import { IconButton } from "@/components/shared/IconButton";
import { categoryColor } from "@/domain/library/categoryColor";

/**
 * Switch manual and session collections using their existing category colors.
 * Custom categories retain their colored marker and require an explicit edit.
 * @param {{name: string; category: string; onToggle: () => void}} props - Collection name, current category, and persistence callback.
 * @returns {React.ReactElement} Accessible category toggle or custom-category marker.
 */
export function CollectionCategoryToggle({
  name,
  category,
  onToggle,
}: {
  name: string;
  category: string;
  onToggle: () => void;
}) {
  if (category !== "manual" && category !== "session")
    return (
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: categoryColor(category) }}
        title={`Category: ${category}`}
      />
    );
  const pinned = category === "manual";
  const Icon = pinned ? Pin : PinOff;
  return (
    <IconButton
      label={pinned ? `Unpin ${name} to session` : `Pin ${name} as manual`}
      title={`Category: ${category}`}
      aria-pressed={pinned}
      onClick={onToggle}
      className="size-6 shrink-0 p-1"
      style={{ color: categoryColor(category) }}
    >
      <Icon className="h-3.5 w-3.5" />
    </IconButton>
  );
}
