import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog";
import type { VaultGroup } from "@/domain/library/types";
import { CollectionColorPicker } from "./CollectionColorPicker";
import {
  isCollectionColor,
  regenerateGroupColor,
} from "@/domain/library/collectionColor";
import { Button } from "@/components/ui/button";
import {
  ConfirmDeleteDialog,
  DialogActions,
  DialogHeading,
} from "@/domain/library/components/shared/DialogParts";

type EditCollectionDialogProps = {
  collection: VaultGroup;
  categories: string[];
  onChange: (collection: VaultGroup) => void;
  onClose: () => void;
  onSave: () => void;
};

/**
 * Edit a collection name, description, category, and preset or custom color.
 * Categories change only when explicitly selected.
 * @param {EditCollectionDialogProps} props - Current collection, category choices, and edit/save/close callbacks.
 * @returns {React.ReactElement} Collection editor dialog.
 */
export function EditCollectionDialog({
  collection,
  categories,
  onChange,
  onClose,
  onSave,
}: EditCollectionDialogProps) {
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent
        aria-labelledby={undefined}
        aria-label="Edit collection"
        className="max-w-sm gap-0 rounded-none border-[#ded9cd] bg-[#fffdf8] p-5 shadow-[0_24px_70px_rgba(24,38,31,0.25)]"
        onEscapeKeyDown={event => {
          // Dialog and popover use separate Radix layers; closing the palette must preserve the draft.
          if (
            document.querySelector(
              '[data-slot="popover-content"][data-state="open"]'
            )
          )
            event.preventDefault();
        }}
      >
        <DialogHeading eyebrow="Collection" title="Edit shelf" />
        <DialogDescription className="sr-only">
          Update this collection’s name, description, category, and color.
        </DialogDescription>
        <div className="mt-5">
          <Label
            htmlFor="collection-name"
            className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]"
          >
            Name
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="collection-name"
              value={collection.details.name}
              onChange={event =>
                onChange({
                  ...collection,
                  details: {
                    ...collection.details,
                    name: event.target.value,
                  },
                })
              }
              onKeyDown={event => event.key === "Enter" && onSave()}
              className="mt-2 w-full border-b border-[#bcb6a8] bg-[#f9f7f1] px-3 py-3 text-[13px] font-semibold outline-none focus:border-[#e95224]"
            />
            <CollectionColorPicker
              name={collection.details.name}
              color={collection.details.accent}
              onChange={accent =>
                onChange({
                  ...collection,
                  details: { ...collection.details, accent },
                })
              }
            />
          </div>
        </div>
        {!isCollectionColor(collection.details.accent) && (
          <div className="mt-3">
            <p role="alert" className="text-sm text-[#a33b21]">
              Color is incorrect.
            </p>
            <Button
              variant="outline"
              className="mt-2"
              onClick={() =>
                onChange({
                  ...collection,
                  details: {
                    ...collection.details,
                    accent: regenerateGroupColor(),
                  },
                })
              }
            >
              Regenerate color
            </Button>
          </div>
        )}
        <Label className="mt-4 block">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
            Description
          </span>
          <Textarea
            value={collection.details.description}
            onChange={event =>
              onChange({
                ...collection,
                details: {
                  ...collection.details,
                  description: event.target.value,
                },
              })
            }
            rows={4}
            placeholder="Context that helps agents file tabs correctly"
            className="mt-2 w-full resize-none border border-[#ded9cd] bg-[#f9f7f1] px-3 py-3 text-[12px] leading-5 outline-none focus:border-[#e95224]"
          />
        </Label>
        <Label className="mt-4 block">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
            Category
          </span>
          <NativeSelect
            value={collection.details.category}
            onChange={event =>
              onChange({
                ...collection,
                details: {
                  ...collection.details,
                  category: event.target.value,
                },
              })
            }
            className="mt-2 w-full border border-[#ded9cd] bg-[#f9f7f1] px-3 py-2.5 text-[12px] outline-none focus:border-[#e95224]"
          >
            {categories.map(category => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </NativeSelect>
        </Label>
        <DialogActions
          onCancel={onClose}
          onConfirm={onSave}
          confirmLabel="Save collection"
          icon
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Confirm deletion of one collection.
 * The owner supplies the deletion action so persistence stays outside the dialog.
 * @param {{ collection: VaultGroup; onClose: () => void; onDelete: () => void; }} props - Collection to describe and callbacks for cancellation or deletion.
 * @returns {React.ReactElement} Collection deletion confirmation.
 */
export function DeleteCollectionDialog({
  collection,
  onClose,
  onDelete,
}: {
  collection: VaultGroup;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <ConfirmDeleteDialog
      ariaLabel={`Delete ${collection.details.name} collection`}
      eyebrow="Remove collection"
      title={`Delete “${collection.details.name}”?`}
      description="The collection will be removed. Its saved tabs will be archived and moved to [Unassigned]."
      confirmLabel="Delete collection"
      onClose={onClose}
      onConfirm={onDelete}
    />
  );
}
