import { Clock, Hand } from "lucide-react";
import { IconButton } from "@/components/shared/IconButton";
import { categoryColor } from "@/domain/library/categoryColor";

/**
 * Show a hand for curated manual collections and a clock for captured sessions.
 * The tooltip explains the current category and the change performed on click.
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
        className="flex size-8 shrink-0 items-center justify-center"
        title={`Category: ${category}`}
      >
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: categoryColor(category) }}
        />
      </span>
    );
  const manual = category === "manual";
  const Icon = manual ? Hand : Clock;
  return (
    <IconButton
      label={`Change ${name} to ${manual ? "Session" : "Manual"}`}
      title={
        manual
          ? "Manual collection: curated for reuse. Click to change to Session."
          : "Session collection: tabs captured together. Click to change to Manual."
      }
      aria-pressed={manual}
      onClick={onToggle}
      className="size-8 shrink-0 p-1"
      style={{ color: categoryColor(category) }}
    >
      <Icon className="h-3.5 w-3.5" />
    </IconButton>
  );
}
