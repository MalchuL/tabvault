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
 * Edit a collection name, description, and category.
 * Name or description edits turn the collection into a manual category.
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
      >
        <DialogHeading eyebrow="Collection" title="Edit shelf" />
        <DialogDescription className="sr-only">
          Update this collection’s name, description, and category.
        </DialogDescription>
        <Label className="mt-5 block">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
            Name
          </span>
          <Input
            value={collection.name}
            onChange={event =>
              onChange({
                ...collection,
                name: event.target.value,
                category: "manual",
              })
            }
            onKeyDown={event => event.key === "Enter" && onSave()}
            className="mt-2 w-full border-b border-[#bcb6a8] bg-[#f9f7f1] px-3 py-3 text-[13px] font-semibold outline-none focus:border-[#e95224]"
          />
        </Label>
        <Label className="mt-4 block">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
            Description
          </span>
          <Textarea
            value={collection.description}
            onChange={event =>
              onChange({
                ...collection,
                description: event.target.value,
                category: "manual",
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
            value={collection.category}
            onChange={event =>
              onChange({ ...collection, category: event.target.value })
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
      ariaLabel={`Delete ${collection.name} collection`}
      eyebrow="Remove collection"
      title={`Delete “${collection.name}”?`}
      description="The collection will be removed. Its saved tabs will be archived and moved to [Unassigned]."
      confirmLabel="Delete collection"
      onClose={onClose}
      onConfirm={onDelete}
    />
  );
}
