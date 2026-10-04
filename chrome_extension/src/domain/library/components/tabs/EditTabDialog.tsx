import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog";
import { DialogHeading, Field } from "../shared/DialogParts";
import {
  matchesPropertyType,
  resolveProperty,
  unsetTabProperty,
} from "@/domain/library/properties";
import type {
  CustomPropertySchema,
  VaultGroup,
  VaultTab,
} from "@/domain/library/types";
type Props = {
  tab: VaultTab;
  groups: VaultGroup[];
  propertySchema: CustomPropertySchema;
  actions: {
    onChange: (tab: VaultTab) => void;
    onClose: () => void;
    onSave: (tab: VaultTab) => Promise<void>;
  };
};
/** Edit schema-defined values with validated drafts and explicit default resets. @param {Props} props - Current draft, definitions, and save callbacks. @returns {React.ReactElement} Edit dialog. */
export function EditTabDialog({
  tab,
  groups,
  propertySchema,
  actions: { onChange, onClose, onSave },
}: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [tagsText, setTagsText] = useState(tab.annotations.tags.join(", "));
  const change = (name: string, value: unknown) =>
    onChange({
      ...tab,
      annotations: {
        ...tab.annotations,
        customProperties: {
          ...tab.annotations.customProperties,
          [name]: value,
        },
      },
    });
  const save = async () => {
    const failures: Record<string, string> = {};
    const values = { ...tab.annotations.customProperties };
    for (const [name, raw] of Object.entries(drafts)) {
      const definition = propertySchema[name];
      if (!definition) continue;
      try {
        const value =
          definition.type === "string"
            ? raw
            : definition.type === "json"
              ? JSON.parse(raw)
              : raw.trim()
                ? Number(raw)
                : NaN;
        if (!matchesPropertyType(value, definition.type))
          throw new Error(`Enter a valid ${definition.type}`);
        values[name] = value;
      } catch {
        failures[name] = `Enter a valid ${definition.type}`;
      }
    }
    if (!tab.content.title.trim()) failures.title = "Enter a title";
    try {
      const url = new URL(tab.content.url);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      failures.url = "Enter an HTTP(S) URL";
    }
    setErrors(failures);
    if (Object.keys(failures).length) return;
    setSaving(true);
    try {
      await onSave({
        ...tab,
        annotations: {
          ...tab.annotations,
          tags: [
            ...new Set(
              tagsText
                .split(",")
                .map(t => t.trim())
                .filter(Boolean)
            ),
          ],
          customProperties: values,
        },
      });
    } catch (error) {
      setErrors({
        save: error instanceof Error ? error.message : "Could not save tab",
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent
        aria-labelledby={undefined}
        aria-label="Edit tab"
        className="max-h-[90vh] max-w-2xl overflow-y-auto bg-[#fffdf8]"
      >
        <DialogHeading eyebrow="Tab record" title="Edit saved tab" />
        <DialogDescription>
          Update details and custom properties for this saved occurrence.
        </DialogDescription>
        <Field label="Title">
          <Input
            aria-label="Title"
            value={tab.content.title}
            onChange={e =>
              onChange({
                ...tab,
                content: { ...tab.content, title: e.target.value },
              })
            }
          />
        </Field>
        {errors.title && <p role="alert">{errors.title}</p>}
        <Field label="URL">
          <Input
            aria-label="URL"
            value={tab.content.url}
            onChange={e =>
              onChange({
                ...tab,
                content: { ...tab.content, url: e.target.value },
              })
            }
          />
        </Field>
        {errors.url && <p role="alert">{errors.url}</p>}
        <Field label="Collection">
          <NativeSelect
            aria-label="Collection"
            value={tab.placement.groupId ?? ""}
            disabled={tab.lifecycle.archived}
            onChange={e =>
              onChange({
                ...tab,
                placement: {
                  ...tab.placement,
                  groupId: e.target.value || null,
                },
              })
            }
          >
            <option value="">[Unassigned]</option>
            {groups
              .filter(
                g =>
                  g.details.category === "manual" ||
                  g.id === tab.placement.groupId
              )
              .map(g => (
                <option key={g.id} value={g.id}>
                  {g.details.name}
                </option>
              ))}
          </NativeSelect>
        </Field>
        <Field label="Tags">
          <Input
            aria-label="Tags"
            value={tagsText}
            onChange={e => setTagsText(e.target.value)}
          />
        </Field>
        <section
          aria-label="Custom properties"
          className="space-y-4 border-t pt-4"
        >
          <h3 className="font-semibold">Custom properties</h3>
          {!Object.keys(propertySchema).length && (
            <p className="text-sm text-[#687067]">
              No properties defined. Add definitions on the Custom Properties
              page or through MCP.
            </p>
          )}
          {Object.entries(propertySchema).map(([name, definition]) => {
            const value = resolveProperty(
              tab.annotations.customProperties,
              propertySchema,
              name
            );
            const overridden =
              Object.hasOwn(tab.annotations.customProperties, name) ||
              Object.hasOwn(drafts, name);
            const raw =
              drafts[name] ??
              (definition.type === "json"
                ? JSON.stringify(value, null, 2)
                : String(value));
            return (
              <div key={name}>
                <label
                  htmlFor={`property-${name}`}
                  className="block font-medium"
                >
                  {name}
                </label>
                <p className="text-xs text-[#687067]">
                  {definition.description} ·{" "}
                  {overridden ? "Explicit value" : "Using default"}
                </p>
                {definition.type === "boolean" ? (
                  <input
                    id={`property-${name}`}
                    type="checkbox"
                    checked={value === true}
                    onChange={e => change(name, e.target.checked)}
                  />
                ) : definition.type === "int" || definition.type === "float" ? (
                  <Input
                    id={`property-${name}`}
                    type="number"
                    step={definition.type === "int" ? "1" : "any"}
                    value={raw}
                    onChange={e =>
                      setDrafts(d => ({ ...d, [name]: e.target.value }))
                    }
                  />
                ) : (
                  <Textarea
                    id={`property-${name}`}
                    rows={definition.type === "json" ? 5 : 3}
                    value={raw}
                    className={definition.type === "json" ? "font-mono" : ""}
                    onChange={e =>
                      setDrafts(d => ({ ...d, [name]: e.target.value }))
                    }
                  />
                )}
                {errors[name] && (
                  <p role="alert" className="text-sm text-red-700">
                    {errors[name]}
                  </p>
                )}
                {overridden && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const draft = { ...drafts };
                      delete draft[name];
                      setDrafts(draft);
                      onChange(unsetTabProperty(tab, name));
                    }}
                  >
                    Use default for {name}
                  </Button>
                )}
              </div>
            );
          })}
          {Object.entries(tab.annotations.customProperties)
            .filter(([name]) => !propertySchema[name])
            .map(([name, value]) => (
              <div key={name}>
                <p>
                  {name} <span className="text-xs">Undeclared · retained</span>
                </p>
                <pre className="overflow-auto text-xs">
                  {JSON.stringify(value, null, 2)}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(unsetTabProperty(tab, name))}
                >
                  Remove {name} from this tab
                </Button>
              </div>
            ))}
        </section>
        {errors.save && <p role="alert">{errors.save}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            Save tab
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
