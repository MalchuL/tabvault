import type { ReactNode } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import type { VaultGroup, VaultTab } from "../types";

type CreateCollectionDialogProps = {
  name: string;
  onNameChange: (name: string) => void;
  onClose: () => void;
  onCreate: () => void;
};

export function CreateCollectionDialog({
  name,
  onNameChange,
  onClose,
  onCreate,
}: CreateCollectionDialogProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#18261f]/30 p-5 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Create collection"
    >
      <div className="w-full max-w-sm bg-[#fffdf8] p-5 shadow-[0_24px_70px_rgba(24,38,31,0.25)] rise-in">
        <DialogHeading
          eyebrow="Collection"
          title="Name a new shelf"
          onClose={onClose}
        />
        <input
          autoFocus
          value={name}
          onChange={event => onNameChange(event.target.value)}
          onKeyDown={event => event.key === "Enter" && onCreate()}
          placeholder="e.g. Weekend reading"
          className="mt-5 w-full border-b border-[#bcb6a8] bg-[#f9f7f1] px-3 py-3 text-[13px] font-semibold outline-none focus:border-[#e95224]"
        />
        <DialogActions
          onCancel={onClose}
          onConfirm={onCreate}
          confirmLabel="Create collection"
        />
      </div>
    </div>
  );
}

type EditCollectionDialogProps = {
  collection: VaultGroup;
  onChange: (collection: VaultGroup) => void;
  onClose: () => void;
  onSave: () => void;
};

export function EditCollectionDialog({
  collection,
  onChange,
  onClose,
  onSave,
}: EditCollectionDialogProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#18261f]/30 p-5 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Edit collection"
    >
      <div className="w-full max-w-sm bg-[#fffdf8] p-5 shadow-[0_24px_70px_rgba(24,38,31,0.25)] rise-in">
        <DialogHeading
          eyebrow="Collection"
          title="Edit shelf"
          onClose={onClose}
        />
        <label className="mt-5 block">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
            Name
          </span>
          <input
            value={collection.name}
            onChange={event =>
              onChange({ ...collection, name: event.target.value })
            }
            onKeyDown={event => event.key === "Enter" && onSave()}
            className="mt-2 w-full border-b border-[#bcb6a8] bg-[#f9f7f1] px-3 py-3 text-[13px] font-semibold outline-none focus:border-[#e95224]"
          />
        </label>
        <DialogActions
          onCancel={onClose}
          onConfirm={onSave}
          confirmLabel="Save name"
          icon
        />
      </div>
    </div>
  );
}

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
      description="The collection structure will be removed. Its saved tabs will be returned to Inbox rather than deleted."
      confirmLabel="Delete collection"
      onClose={onClose}
      onConfirm={onDelete}
    />
  );
}

export function DeleteTabDialog({
  tab,
  permanent,
  onClose,
  onDelete,
}: {
  tab: VaultTab;
  permanent: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <ConfirmDeleteDialog
      ariaLabel={`${permanent ? "Permanently delete" : "Archive"} ${tab.title}`}
      eyebrow={permanent ? "Permanent deletion" : "Archive saved tab"}
      title={permanent ? "Permanently delete this tab?" : "Archive this tab?"}
      description={
        permanent
          ? `“${tab.title}” will be removed from local storage and the configured backend. This cannot be undone.`
          : `“${tab.title}” will leave your active library but remain recoverable in Archive. Saving the same URL restores its existing notes and tags.`
      }
      confirmLabel={permanent ? "Permanently delete" : "Archive tab"}
      onClose={onClose}
      onConfirm={onDelete}
    />
  );
}

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
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[#18261f]/30 p-3 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Manage tags"
    >
      <div className="w-full max-w-[700px] overflow-hidden bg-[#fffdf8] shadow-[0_24px_70px_rgba(24,38,31,0.25)] rise-in">
        <div className="border-b border-[#ded9cd] px-5 py-4 sm:px-6">
          <DialogHeading
            eyebrow="Tag directory"
            title="Edit your index vocabulary"
            onClose={onClose}
          />
        </div>
        <div className="border-b border-[#ded9cd] bg-[#f9f7f1] p-5 sm:p-6">
          <p className="text-[11px] leading-5 text-[#697068]">
            Changing a tag name updates every linked tab. Add an optional
            description so an agent can understand the index without asking for
            context.
          </p>
          <div className="mt-4 flex gap-2">
            <input
              value={newTagName}
              onChange={event => onNewTagNameChange(event.target.value)}
              onKeyDown={event => event.key === "Enter" && onAdd()}
              placeholder="New tag"
              className="min-w-0 flex-1 border-b border-[#bcb6a8] bg-[#fffdf8] px-3 py-2 text-[12px] font-semibold outline-none focus:border-[#e95224]"
            />
            <button
              onClick={onAdd}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#e95224] px-3 py-2 text-[10px] font-bold text-white hover:bg-[#d94a1e]"
            >
              <Plus className="h-3.5 w-3.5" /> Add tag
            </button>
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
                <input
                  defaultValue={name}
                  onBlur={event => onRename(name, event.target.value)}
                  aria-label={`Tag name ${name}`}
                  className="min-w-0 bg-transparent font-mono text-[11px] font-medium text-[#334438] outline-none focus:text-[#e95224]"
                />
                <input
                  value={description}
                  onChange={event =>
                    onDescriptionChange(name, event.target.value)
                  }
                  placeholder="No description"
                  aria-label={`Description for ${name}`}
                  className="min-w-0 bg-transparent text-[11px] text-[#697068] outline-none placeholder:text-[#aaa9a1] focus:text-[#18261f]"
                />
                <button
                  onClick={() => onRemove(name)}
                  className="justify-self-start rounded p-1 text-[#9a9b94] hover:bg-[#fff0ea] hover:text-[#c84725]"
                  aria-label={`Remove ${name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
        </div>
        <div className="flex justify-between border-t border-[#ded9cd] bg-[#f9f7f1] px-5 py-4 sm:px-6">
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#858980]">
            {Object.keys(tags).length} indexed tags
          </span>
          <button
            onClick={onClose}
            className="text-[11px] font-bold text-[#e95224] hover:underline"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

type EditTabDialogProps = {
  tab: VaultTab;
  groups: VaultGroup[];
  tagDraft: string;
  tagSuggestions: string[];
  tagCatalog: Record<string, string>;
  onChange: (tab: VaultTab) => void;
  onTagDraftChange: (tag: string) => void;
  onAddTag: () => void;
  onClose: () => void;
  onSave: () => void;
};

export function EditTabDialog({
  tab,
  groups,
  tagDraft,
  tagSuggestions,
  tagCatalog,
  onChange,
  onTagDraftChange,
  onAddTag,
  onClose,
  onSave,
}: EditTabDialogProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[#18261f]/35 p-3 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Edit tab"
    >
      <div className="thin-scrollbar w-full max-w-[760px] max-h-[calc(100vh-24px)] overflow-y-auto bg-[#fffdf8] shadow-[0_24px_70px_rgba(24,38,31,0.25)] rise-in">
        <div className="sticky top-0 z-10 border-b border-[#ded9cd] bg-[#fffdf8]/95 px-5 py-4 backdrop-blur sm:px-6">
          <DialogHeading
            eyebrow="Tab record"
            title="Edit saved tab"
            onClose={onClose}
          />
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <Field label="Title" className="sm:col-span-2">
            <input
              value={tab.title}
              onChange={event =>
                onChange({ ...tab, title: event.target.value })
              }
              className="mt-2 w-full border-b border-[#bcb6a8] bg-[#f9f7f1] px-3 py-3 text-[13px] font-semibold outline-none focus:border-[#e95224]"
            />
          </Field>
          <Field label="URL" className="sm:col-span-2">
            <input
              value={tab.url}
              onChange={event => onChange({ ...tab, url: event.target.value })}
              className="mt-2 w-full border-b border-[#bcb6a8] bg-[#f9f7f1] px-3 py-3 font-mono text-[11px] outline-none focus:border-[#e95224]"
            />
          </Field>
          <Field label="Note" className="sm:col-span-2">
            <textarea
              value={tab.note}
              onChange={event => onChange({ ...tab, note: event.target.value })}
              rows={4}
              className="mt-2 w-full resize-none border border-[#ded9cd] bg-[#f9f7f1] px-3 py-3 text-[12px] leading-5 outline-none focus:border-[#e95224]"
            />
          </Field>
          <Field label="Collection">
            <select
              value={tab.groupId}
              onChange={event =>
                onChange({ ...tab, groupId: event.target.value })
              }
              className="mt-2 w-full border-b border-[#bcb6a8] bg-[#f9f7f1] px-3 py-3 text-[12px] font-semibold outline-none focus:border-[#e95224]"
            >
              {groups.map(group => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
              Tags
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tab.tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded border border-[#ded9cd] bg-[#f9f7f1] px-2 py-1 font-mono text-[9px] text-[#667067]"
                >
                  {tag}
                  <button
                    onClick={() =>
                      onChange({
                        ...tab,
                        tags: tab.tags.filter(item => item !== tag),
                      })
                    }
                    className="text-[#989990] hover:text-[#e95224]"
                    aria-label={`Remove ${tag}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex">
              <input
                value={tagDraft}
                onChange={event => onTagDraftChange(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onAddTag();
                  }
                }}
                list="tag-catalog-suggestions"
                placeholder="Search or create tag"
                aria-label="Search or create tag"
                className="min-w-0 flex-1 border-b border-[#bcb6a8] bg-transparent px-1 py-2 text-[11px] outline-none focus:border-[#e95224]"
              />
              <datalist id="tag-catalog-suggestions">
                {tagSuggestions.map(tag => (
                  <option key={tag} value={tag}>
                    {tagCatalog[tag]}
                  </option>
                ))}
              </datalist>
              <button
                onClick={onAddTag}
                className="px-2 text-[#e95224] hover:bg-[#fff0ea]"
                aria-label="Add tag"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-3 border-t border-[#ded9cd] bg-[#f9f7f1] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button
            onClick={onClose}
            className="text-left text-[11px] font-bold text-[#697068] hover:text-[#18261f]"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#e95224] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#d94a1e]"
          >
            <Save className="h-3.5 w-3.5" /> Save tab
          </button>
        </div>
      </div>
    </div>
  );
}

function DialogHeading({
  eyebrow,
  title,
  onClose,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#858980]">
          {eyebrow}
        </p>
        <h2 className="mt-1 font-['DM_Sans'] text-[20px] font-bold tracking-[-0.045em]">
          {title}
        </h2>
      </div>
      <button
        onClick={onClose}
        className="rounded-md p-1 text-[#747970] hover:bg-[#efede6] hover:text-[#18261f]"
        aria-label="Close dialog"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function DialogActions({
  onCancel,
  onConfirm,
  confirmLabel,
  icon = false,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  icon?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button
        onClick={onCancel}
        className="px-3 py-2 text-[11px] font-bold text-[#72776f]"
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        className="inline-flex items-center gap-1.5 rounded-md bg-[#e95224] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#d94a1e]"
      >
        {icon && <Save className="h-3.5 w-3.5" />}
        {confirmLabel}
      </button>
    </div>
  );
}

function ConfirmDeleteDialog({
  ariaLabel,
  eyebrow,
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  ariaLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#18261f]/40 p-5 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div className="w-full max-w-sm border border-[#e3b7a7] bg-[#fffdf8] p-5 shadow-[0_24px_70px_rgba(24,38,31,0.25)] rise-in">
        <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#c84b26]">
          <Trash2 className="h-3.5 w-3.5" /> {eyebrow}
        </p>
        <h2 className="mt-2 font-['DM_Sans'] text-[22px] font-bold tracking-[-0.05em]">
          {title}
        </h2>
        <p className="mt-3 text-[12px] leading-5 text-[#687067]">
          {description}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-[11px] font-bold text-[#72776f] hover:text-[#18261f]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-[#c84b26] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#ae3b1d]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={className}>
      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
        {label}
      </span>
      {children}
    </label>
  );
}
