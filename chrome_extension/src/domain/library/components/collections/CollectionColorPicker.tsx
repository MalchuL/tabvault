import { useState } from "react";
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

/** Show a collection's color swatch and offer presets or a native custom picker. Preset selection closes the palette; custom selection keeps it open for adjustment. Persistence belongs to the owner. @param {{name: string; color: string; onChange: (color: string) => void}} props - Collection name, persisted color, and owner update callback. @returns {React.ReactElement} Accessible swatch and palette control. */
export function CollectionColorPicker({
  name,
  color,
  onChange,
}: {
  name: string;
  color: string;
  onChange: (color: string) => void;
}) {
  const valid = isCollectionColor(color);
  const [open, setOpen] = useState(false);
  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Choose color for ${name}`}
          title={valid ? `Color: ${color}` : "Color is incorrect"}
        >
          <span
            aria-hidden="true"
            className="h-5 w-5 shrink-0 rounded-sm border border-black/15"
            style={{ backgroundColor: groupColorSwatch(color) }}
          />
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
            value={groupColorSwatch(color)}
            onChange={event => onChange(event.target.value)}
            className="w-14 cursor-pointer p-1"
          />
        </Label>
      </PopoverContent>
    </Popover>
  );
}
