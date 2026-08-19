/**
 * Signal Library design reminder: help is a small archival annotation, not a competing call to action.
 * Each marker opens an explicit, keyboard-accessible explanation and closes through standard popover behavior.
 */
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

type ContextHelpProps = {
  title: string;
  children: ReactNode;
  tip?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
};

export function ContextHelp({
  title,
  children,
  tip,
  side = "bottom",
  align = "start",
  className = "",
}: ContextHelpProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[#c8c2b6] bg-[#fffdf8] text-[#7e847b] transition hover:border-[#e95224] hover:bg-[#fff0ea] hover:text-[#e95224] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e95224] ${className}`}
          aria-label={`Learn about ${title}`}
          title={`Learn about ${title}`}
        >
          <CircleHelp className="h-2.5 w-2.5" strokeWidth={2.4} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="w-[min(278px,calc(100vw-32px))] rounded-none border-[#cfc8ba] bg-[#fffdf8] p-3.5 shadow-[0_14px_32px_rgba(24,38,31,0.16)]"
      >
        <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#e95224]">
          First-use note
        </p>
        <h3 className="mt-1.5 text-[13px] font-bold tracking-[-0.02em] text-[#26342c]">
          {title}
        </h3>
        <div className="mt-1.5 text-[11px] leading-5 text-[#667068]">
          {children}
        </div>
        {tip && (
          <p className="mt-3 border-l-2 border-[#e95224] bg-[#fff7f1] py-1 pl-2 text-[10px] leading-4 text-[#6c5b4d]">
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#c84b26]">
              Tip
            </span>{" "}
            {tip}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
