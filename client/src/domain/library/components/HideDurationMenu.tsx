import { useState } from "react";
import { Clock3, EyeOff } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const HIDE_DURATIONS = [
  ["10 min", 10 * 60 * 1000],
  ["1 hour", 60 * 60 * 1000],
  ["1 day", 24 * 60 * 60 * 1000],
  ["1 year", 365 * 24 * 60 * 60 * 1000],
] as const;

export function HideDurationMenu({
  mode,
  target,
  onSelect,
}: {
  mode: "hide" | "prolong";
  target: string;
  onSelect: (durationMs: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const action = mode === "hide" ? "Hide" : "Prolong";
  const Icon = mode === "hide" ? EyeOff : Clock3;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded p-1 text-[#7b8078] hover:bg-[#fff0ea] hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e95224]"
          aria-label={`${action} ${target}`}
          title={`${action} ${target}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-48 border-[#d9d3c6] bg-[#fffdf8] p-3 text-[#26342c] shadow-xl"
      >
        <p className="mb-2 truncate font-mono text-[9px] uppercase tracking-[0.09em] text-[#737970]">
          {action} {target} for
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {HIDE_DURATIONS.map(([label, duration]) => (
            <button
              key={duration}
              type="button"
              onClick={() => {
                onSelect(duration);
                setOpen(false);
              }}
              className="rounded border border-[#ddd7ca] bg-[#f9f7f1] px-2 py-1.5 text-left font-mono text-[9px] uppercase text-[#617066] hover:border-[#e95224] hover:bg-[#fff0ea] hover:text-[#c84b26]"
            >
              {label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
