import { useState } from "react";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  GROUP_COLORS,
  groupColorSwatch,
  isCollectionColor,
  regenerateGroupColor,
} from "@/domain/library/collectionColor";

/** Show an uncolored palette icon or collection swatch, with no color, presets, and a custom picker. Clearing the color passes undefined to the owner; presets close the palette and custom selection keeps it open. @param {{name: string; color?: string; onChange: (color: string | undefined) => void}} props - Collection name, optional color, and owner update callback. @returns {React.ReactElement} Accessible palette control. */
export function CollectionColorPicker({
  name,
  color,
  onChange,
}: {
  name: string;
  color?: string;
  onChange: (color: string | undefined) => void;
}) {
  const valid = isCollectionColor(color);
  const swatch = groupColorSwatch(color);
  const [open, setOpen] = useState(false);
  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Choose color for ${name}`}
          title={
            !valid
              ? "Color is incorrect"
              : color === undefined
                ? "No color"
                : `Color: ${color}`
          }
        >
          {swatch === "transparent" ? (
            <Palette className="size-5 text-[#7b8078]" aria-hidden="true" />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-black/15"
              style={{ backgroundColor: swatch }}
            ></span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[60] w-64 bg-[#fffdf8]"
        aria-label={`Color for ${name}`}
        onEscapeKeyDown={event => {
          event.preventDefault();
          setOpen(false);
        }}
      >
        <p className="mb-3 text-sm font-semibold">Collection color</p>
        <Button
          variant="outline"
          className="mb-3 w-full"
          aria-pressed={color === undefined}
          onClick={() => {
            onChange(undefined);
            setOpen(false);
          }}
        >
          <Palette className="size-4" aria-hidden="true" />
          No color
        </Button>
        {!valid && (
          <div className="mb-3">
            <p role="alert" className="text-sm text-[#a33b21]">
              Color is incorrect.
            </p>
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => onChange(regenerateGroupColor())}
            >
              Regenerate color
            </Button>
          </div>
        )}
        <div
          className="grid grid-cols-3 gap-2"
          role="group"
          aria-label="Group colors"
        >
          {GROUP_COLORS.map(([value, swatch]) => (
            <Button
              key={value}
              variant="outline"
              aria-label={`Set color to ${value}`}
              aria-pressed={groupColorSwatch(color).toLowerCase() === swatch}
              onClick={() => {
                onChange(value);
                setOpen(false);
              }}
              className="gap-1.5 px-2 text-xs capitalize"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: swatch }}
              />
              {value}
            </Button>
          ))}
        </div>
        <Label className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
          <span className="text-sm">Custom color</span>
          <Input
            type="color"
            value={swatch === "transparent" ? GROUP_COLORS[0][1] : swatch}
            onChange={event => onChange(event.target.value)}
            className="w-14 cursor-pointer p-1"
          />
        </Label>
      </PopoverContent>
    </Popover>
  );
}
