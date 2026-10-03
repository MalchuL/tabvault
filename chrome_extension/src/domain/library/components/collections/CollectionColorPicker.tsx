import { Palette } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  GROUP_COLORS,
  groupColorSwatch,
  isGroupColor,
  regenerateGroupColor,
} from "@/domain/library/collectionColor";

/** Pick a Chrome group color and explicitly repair incorrect stored values. The palette closes after selection; persistence belongs to the owner. @param {{name: string; color: string; onChange: (color: string) => void}} props - Collection name, persisted color, and owner update callback. @returns {React.ReactElement} Accessible palette control. */
export function CollectionColorPicker({
  name,
  color,
  onChange,
}: {
  name: string;
  color: string;
  onChange: (color: string) => void;
}) {
  const valid = isGroupColor(color);
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
          <Palette
            className="h-3.5 w-3.5"
            style={{ color: groupColorSwatch(color) }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[60] w-64 bg-[#fffdf8]"
        aria-label={`Color for ${name}`}
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
              aria-pressed={color === value}
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
      </PopoverContent>
    </Popover>
  );
}
