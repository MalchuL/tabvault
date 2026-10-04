import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Edit a collection name in place without changing its collapse or browse state.
 * Enter or blur saves a trimmed, nonempty change; Escape and empty names restore
 * the current name. Collections without a rename callback remain plain text.
 * @param {{ name: string; onRename?: (name: string) => void; className?: string }} props - Current name, owner persistence callback, and presentation classes.
 * @returns {React.ReactElement} Collection name or focused rename input.
 */
export function CollectionNameEditor({
  name,
  onRename,
  className = "",
}: {
  name: string;
  onRename?: (name: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  if (!onRename) return <span className={className}>{name}</span>;
  if (editing)
    return (
      <Input
        autoFocus
        defaultValue={name}
        aria-label={`Rename ${name}`}
        className={`h-7 w-48 min-w-0 max-w-full border-[#bcb6a8] bg-[#fffdf8] px-1 py-0 ${className}`}
        onFocus={event => event.currentTarget.select()}
        onBlur={event => {
          const nextName = event.currentTarget.value.trim();
          setEditing(false);
          if (nextName && nextName !== name) onRename(nextName);
        }}
        onKeyDown={event => {
          if (event.key !== "Enter" && event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Escape") event.currentTarget.value = name;
          event.currentTarget.blur();
        }}
      />
    );
  return (
    <Button
      type="button"
      variant="ghost"
      title="Click to rename collection"
      className={`h-auto min-w-0 shrink truncate px-0 py-0 text-left hover:text-[#e95224] ${className}`}
      onClick={() => setEditing(true)}
    >
      <span className="truncate">{name}</span>
    </Button>
  );
}
