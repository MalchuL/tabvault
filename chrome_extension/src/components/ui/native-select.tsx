import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Style a native select while retaining browser keyboard and mobile behavior.
 * @param {React.ComponentProps<"select">} props - Native select attributes and optional styles.
 * @returns {React.JSX.Element} The styled dropdown control.
 */
const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select">
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    data-slot="native-select"
    className={cn(
      "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
      className
    )}
    {...props}
  />
));
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
