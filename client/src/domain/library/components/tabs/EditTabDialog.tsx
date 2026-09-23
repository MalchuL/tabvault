import { Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog";
import type {
  CustomPropertySchema,
  VaultGroup,
  VaultTab,
} from "@/domain/library/types";
import {
  DialogHeading,
  Field,
} from "@/domain/library/components/shared/DialogParts";

type EditTabDialogProps = {
  tab: VaultTab;
  groups: VaultGroup[];
  tagDraft: string;
  tagSuggestions: string[];
  tagCatalog: Record<string, string>;
  propertySchema: CustomPropertySchema;
  onChange: (tab: VaultTab) => void;
  onTagDraftChange: (tag: string) => void;
  onAddTag: () => void;
  onClose: () => void;
  onSave: () => void;
};

/**
 * Edit saved-tab details and custom property values.
 * Session groups are excluded as move destinations while the current assignment remains visible.
 * @param {EditTabDialogProps} props - Tab, available groups, tag and property data, and edit callbacks.
 * @returns {React.ReactElement} Saved-tab editor dialog.
 */
export function EditTabDialog({
  tab,
  groups,
  tagDraft,
  tagSuggestions,
  tagCatalog,
  propertySchema,
  onChange,
  onTagDraftChange,
  onAddTag,
  onClose,
  onSave,
}: EditTabDialogProps) {
  const destinationGroups = groups.filter(
    group => group.category !== "session"
  );
  const currentGroupIsSession = groups.some(
    group => group.id === tab.groupId && group.category === "session"
  );
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent
        aria-labelledby={undefined}
        aria-label="Edit tab"
        className="thin-scrollbar max-h-[calc(100vh-24px)] w-[calc(100%-24px)] max-w-[760px] gap-0 overflow-y-auto rounded-none border-[#ded9cd] bg-[#fffdf8] p-0 shadow-[0_24px_70px_rgba(24,38,31,0.25)]"
      >
        <div className="sticky top-0 z-10 border-b border-[#ded9cd] bg-[#fffdf8]/95 px-5 py-4 backdrop-blur sm:px-6">
          <DialogHeading eyebrow="Tab record" title="Edit saved tab" />
          <DialogDescription className="sr-only">
            Update this saved tab’s details and collection.
          </DialogDescription>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <Field label="Title" className="sm:col-span-2">
            <Input
              value={tab.title}
              onChange={event =>
                onChange({ ...tab, title: event.target.value })
              }
              className="mt-2 w-full border-b border-[#bcb6a8] bg-[#f9f7f1] px-3 py-3 text-[13px] font-semibold outline-none focus:border-[#e95224]"
            />
          </Field>
          <Field label="URL" className="sm:col-span-2">
            <Input
              value={tab.url}
              onChange={event => onChange({ ...tab, url: event.target.value })}
              className="mt-2 w-full border-b border-[#bcb6a8] bg-[#f9f7f1] px-3 py-3 font-mono text-[11px] outline-none focus:border-[#e95224]"
            />
          </Field>
          <Field label="Note" className="sm:col-span-2">
            <Textarea
              value={tab.note}
              onChange={event => onChange({ ...tab, note: event.target.value })}
              rows={4}
              className="mt-2 w-full resize-none border border-[#ded9cd] bg-[#f9f7f1] px-3 py-3 text-[12px] leading-5 outline-none focus:border-[#e95224]"
            />
          </Field>
          <Field label="Agent review" className="sm:col-span-2">
            <Textarea
              value={tab.agentReview}
              onChange={event =>
                onChange({ ...tab, agentReview: event.target.value })
              }
              rows={4}
              placeholder="Summary or additional context written by an AI agent"
              className="mt-2 w-full resize-none border border-[#ded9cd] bg-[#f9f7f1] px-3 py-3 text-[12px] leading-5 outline-none focus:border-[#e95224]"
            />
          </Field>
          <div>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
              Viewed
            </span>
            <label className="mt-2 flex items-center gap-2 py-3 text-[12px] font-semibold text-[#3f4e44]">
              <Checkbox
                checked={tab.viewed}
                onCheckedChange={checked =>
                  onChange({ ...tab, viewed: checked === true })
                }
                className="h-4 w-4 accent-[#e95224]"
              />
              Mark as viewed
            </label>
          </div>
          {Object.entries(propertySchema)
            .filter(([name]) => name !== "viewed")
            .map(([name, definition]) => {
              const value = tab.customProperties[name] ?? definition.default;
              /**
               * Update an edited tab's custom property.
               *
               * Replace the property selected by this row while retaining the other draft values.
               * @param {unknown} next - Replacement value for the current custom property.
               */
              const update = (next: unknown) =>
                onChange({
                  ...tab,
                  customProperties: {
                    ...tab.customProperties,
                    [name]: next,
                  },
                });
              return (
                <Field key={name} label={name}>
                  {definition.type === "boolean" ? (
                    <Checkbox
                      checked={Boolean(value)}
                      onCheckedChange={checked => update(checked === true)}
                      className="mt-4 h-4 w-4 accent-[#e95224]"
                    />
                  ) : definition.type === "json" ? (
                    <Textarea
                      defaultValue={JSON.stringify(value, null, 2)}
                      onBlur={event => {
                        try {
                          update(JSON.parse(event.target.value));
                        } catch {
                          event.target.setCustomValidity("Enter valid JSON");
                          event.target.reportValidity();
                        }
                      }}
                      className="mt-2 w-full border border-[#ded9cd] bg-[#f9f7f1] px-3 py-3 font-mono text-[11px]"
                    />
                  ) : (
                    <Input
                      type={
                        definition.type === "int" || definition.type === "float"
                          ? "number"
                          : "text"
                      }
                      step={definition.type === "int" ? "1" : "any"}
                      value={String(value)}
                      onChange={event =>
                        update(
                          definition.type === "string"
                            ? event.target.value
                            : Number(event.target.value)
                        )
                      }
                      className="mt-2 w-full border-b border-[#bcb6a8] bg-[#f9f7f1] px-3 py-3 text-[12px]"
                    />
                  )}
                  {definition.description ? (
                    <span className="mt-1 block text-[10px] text-[#858980]">
                      {definition.description}
                    </span>
                  ) : null}
                </Field>
              );
            })}
          <Field label="Collection">
            <NativeSelect
              value={
                currentGroupIsSession ? "current-session" : (tab.groupId ?? "")
              }
              onChange={event =>
                onChange({
                  ...tab,
                  groupId: event.target.value || null,
                })
              }
              className="mt-2 w-full border-b border-[#bcb6a8] bg-[#f9f7f1] px-3 py-3 text-[12px] font-semibold outline-none focus:border-[#e95224]"
            >
              {currentGroupIsSession ? (
                <option value="current-session" disabled>
                  Move from current session…
                </option>
              ) : null}
              <option value="">[Unassigned]</option>
              {destinationGroups.map(group => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </NativeSelect>
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
                  <Button
                    variant="ghost"
                    size="icon-sm"
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
                  </Button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex">
              <Input
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
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onAddTag}
                className="px-2 text-[#e95224] hover:bg-[#fff0ea]"
                aria-label="Add tag"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-3 border-t border-[#ded9cd] bg-[#f9f7f1] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-left text-[11px] font-bold text-[#697068] hover:text-[#18261f]"
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#e95224] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#d94a1e]"
          >
            <Save className="h-3.5 w-3.5" /> Save tab
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
