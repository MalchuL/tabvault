import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog";
import { DialogHeading } from "@/domain/library/components/shared/DialogParts";

type TagManagerDialogProps = {
  tags: Record<string, string>;
  newTagName: string;
  onNewTagNameChange: (name: string) => void;
  onDescriptionChange: (name: string, description: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onRemove: (name: string) => void;
  onAdd: () => void;
  onClose: () => void;
};

/**
 * Manage tag names and descriptions in one dialog.
 * Changes are sent through owner callbacks rather than written here.
 * @param {TagManagerDialogProps} props - Tag catalog, draft name, and owner callbacks for tag mutations.
 * @returns {React.ReactElement} Tag management dialog.
 */
export function TagManagerDialog({
  tags,
  newTagName,
  onNewTagNameChange,
  onDescriptionChange,
  onRename,
  onRemove,
  onAdd,
  onClose,
}: TagManagerDialogProps) {
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent
        aria-labelledby={undefined}
        aria-label="Manage tags"
        className="max-h-[calc(100vh-24px)] w-[calc(100%-24px)] max-w-[700px] gap-0 overflow-y-auto rounded-none border-[#ded9cd] bg-[#fffdf8] p-0 shadow-[0_24px_70px_rgba(24,38,31,0.25)]"
      >
        <div className="border-b border-[#ded9cd] px-5 py-4 sm:px-6">
          <DialogHeading
            eyebrow="Tag directory"
            title="Edit your index vocabulary"
          />
        </div>
        <div className="border-b border-[#ded9cd] bg-[#f9f7f1] p-5 sm:p-6">
          <DialogDescription className="text-[11px] leading-5 text-[#697068]">
            Changing a tag name updates every linked tab. Add an optional
            description so an agent can understand the index without asking for
            context.
          </DialogDescription>
          <div className="mt-4 flex gap-2">
            <Input
              value={newTagName}
              onChange={event => onNewTagNameChange(event.target.value)}
              onKeyDown={event => event.key === "Enter" && onAdd()}
              placeholder="New tag"
              className="min-w-0 flex-1 border-b border-[#bcb6a8] bg-[#fffdf8] px-3 py-2 text-[12px] font-semibold outline-none focus:border-[#e95224]"
            />
            <Button
              onClick={onAdd}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#e95224] px-3 py-2 text-[10px] font-bold text-white hover:bg-[#d94a1e]"
            >
              <Plus className="h-3.5 w-3.5" /> Add tag
            </Button>
          </div>
        </div>
        <div className="thin-scrollbar max-h-[380px] overflow-y-auto p-5 sm:p-6">
          {Object.entries(tags)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, description]) => (
              <div
                key={name}
                className="grid gap-2 border-b border-[#e6e1d7] py-3 sm:grid-cols-[170px_1fr_auto]"
              >
                <Input
                  defaultValue={name}
                  onBlur={event => onRename(name, event.target.value)}
                  aria-label={`Tag name ${name}`}
                  className="min-w-0 bg-transparent font-mono text-[11px] font-medium text-[#334438] outline-none focus:text-[#e95224]"
                />
                <Input
                  value={description}
                  onChange={event =>
                    onDescriptionChange(name, event.target.value)
                  }
                  placeholder="No description"
                  aria-label={`Description for ${name}`}
                  className="min-w-0 bg-transparent text-[11px] text-[#697068] outline-none placeholder:text-[#aaa9a1] focus:text-[#18261f]"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onRemove(name)}
                  className="justify-self-start rounded p-1 text-[#9a9b94] hover:bg-[#fff0ea] hover:text-[#c84725]"
                  aria-label={`Remove ${name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
        </div>
        <div className="flex justify-between border-t border-[#ded9cd] bg-[#f9f7f1] px-5 py-4 sm:px-6">
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#858980]">
            {Object.keys(tags).length} indexed tags
          </span>
          <Button
            variant="link"
            onClick={onClose}
            className="text-[11px] font-bold text-[#e95224] hover:underline"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
