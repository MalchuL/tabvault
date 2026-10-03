import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useLibrary } from "@/domain/library/library-context";
import { resolveProperty } from "@/domain/library/properties";
import type { VaultTab } from "@/domain/library/types";
/** Show a favicon with the existing local icon fallback. @param {{tab:VaultTab;size:"compact"|"standard"}} props - Tab and row density. @returns {React.ReactElement} Favicon. */
export function TabFavicon({
  tab,
  size,
}: {
  tab: VaultTab;
  size: "compact" | "standard";
}) {
  const [failed, setFailed] = useState(false);
  const dimensions = size === "compact" ? "h-6 w-6" : "h-8 w-8";
  return failed ? (
    <span
      className={`${dimensions} shrink-0 rounded bg-[#6b8c7e] text-center text-white`}
      aria-hidden="true"
    >
      {tab.content.icon}
    </span>
  ) : (
    <img
      className={`${dimensions} shrink-0 rounded`}
      src={`https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(tab.content.url)}&sz=64`}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}
/** Render the optional reading-status client convention. @param {{tab:VaultTab;hidden:boolean;onChange:(id:string,viewed:boolean)=>void}} props - Tab, lifecycle, and owner callback. @returns {React.ReactElement | null} Compatible status control. */
export function ViewedCheckbox({
  tab,
  hidden,
  onChange,
}: {
  tab: VaultTab;
  hidden: boolean;
  onChange: (id: string, viewed: boolean) => void;
}) {
  const { vault } = useLibrary();
  const definition = vault.propertySchema.viewed;
  if (hidden || (definition && definition.type !== "boolean")) return null;
  return (
    <Checkbox
      aria-label={`Mark ${tab.content.title} as viewed`}
      checked={
        resolveProperty(
          tab.annotations.customProperties,
          vault.propertySchema,
          "viewed"
        ) === true
      }
      onCheckedChange={value => onChange(tab.id, value === true)}
    />
  );
}
