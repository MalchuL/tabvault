import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deletePropertyDefinition,
  getPropertySchema,
  repairPropertyValues,
  upsertPropertyDefinition,
  validatePropertyValues,
  type PropertyDefinition,
  type PropertySchema,
} from "@/lib/extension";

const TYPES = ["string", "int", "float", "boolean", "json"] as const;

function parseDefault(type: PropertyDefinition["type"], raw: string): unknown {
  if (type === "string") return raw;
  if (type === "boolean") {
    if (raw !== "true" && raw !== "false")
      throw new Error("Boolean defaults must be true or false");
    return raw === "true";
  }
  if (type === "int" && !/^-?(0|[1-9]\d*)$/.test(raw))
    throw new Error("Integer defaults must contain only a complete integer");
  if (type === "int") return Number(raw);
  if (type === "float") {
    const value = Number(raw);
    if (!Number.isFinite(value) || !raw.trim())
      throw new Error("Float defaults must be finite numbers");
    return value;
  }
  return JSON.parse(raw);
}

/** Provides the dedicated Custom Property Schema administration page. */
export default function CustomProperties() {
  const [schema, setSchema] = useState<PropertySchema>({});
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<PropertyDefinition["type"]>("string");
  const [defaultText, setDefaultText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getPropertySchema()
      .then(setSchema)
      .catch(error =>
        toast.error("Could not load custom properties", {
          description: String(error),
        })
      );
  }, []);

  const save = async () => {
    try {
      setBusy(true);
      setSchema(
        await upsertPropertyDefinition(name, {
          description,
          type,
          default: parseDefault(type, defaultText),
        })
      );
      setName("");
      setDescription("");
      setDefaultText("");
      toast.success("Custom property saved");
    } catch (error) {
      toast.error("Could not save custom property", {
        description: String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#e95224]">
        Library schema
      </p>
      <h1 className="mt-2 font-['DM_Sans'] text-3xl font-bold tracking-[-0.04em]">
        Custom Properties
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-[#687067]">
        Define typed fields and defaults shared by every saved tab. Ordinary
        reads never rewrite incompatible stored values.
      </p>
      <section className="mt-8 grid gap-3">
        {Object.entries(schema).map(([propertyName, definition]) => (
          <article
            key={propertyName}
            className="border border-[#ded9cd] bg-[#fffdf8] p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-mono text-sm font-semibold">
                  {propertyName}
                </h2>
                <p className="mt-1 text-xs text-[#747970]">
                  {definition.description || "No description"}
                </p>
                <p className="mt-2 text-xs">
                  <strong>{definition.type}</strong> · default{" "}
                  {JSON.stringify(definition.default)}
                </p>
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-[#a33b21]"
                onClick={() =>
                  void deletePropertyDefinition(propertyName).then(setSchema)
                }
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </section>
      <section className="mt-8 border border-[#ded9cd] bg-[#fffdf8] p-5">
        <h2 className="font-semibold">Add or update a property</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            className="border border-[#ded9cd] p-3 text-sm"
            placeholder="propertyName"
            value={name}
            onChange={event => setName(event.target.value)}
          />
          <select
            className="border border-[#ded9cd] p-3 text-sm"
            value={type}
            onChange={event =>
              setType(event.target.value as PropertyDefinition["type"])
            }
          >
            {TYPES.map(value => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <input
            className="border border-[#ded9cd] p-3 text-sm sm:col-span-2"
            placeholder="Description (optional)"
            value={description}
            onChange={event => setDescription(event.target.value)}
          />
          <textarea
            className="border border-[#ded9cd] p-3 font-mono text-sm sm:col-span-2"
            placeholder="Default value"
            value={defaultText}
            onChange={event => setDefaultText(event.target.value)}
          />
        </div>
        <button
          type="button"
          disabled={busy || !name}
          onClick={() => void save()}
          className="mt-4 bg-[#e95224] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Save property
        </button>
      </section>
      <section className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          className="border border-[#bcb6a8] px-4 py-2 text-sm font-semibold"
          onClick={() =>
            void validatePropertyValues().then(result =>
              toast.success(
                result.valid
                  ? "All values are valid"
                  : "Validation found issues",
                {
                  description: `${result.summary.invalidValues} invalid, ${result.summary.undeclaredValues} undeclared`,
                }
              )
            )
          }
        >
          Validate all tabs
        </button>
        <button
          type="button"
          className="border border-[#bcb6a8] px-4 py-2 text-sm font-semibold"
          onClick={() =>
            void repairPropertyValues().then(result =>
              toast.success("Repair complete", {
                description: `${result.converted} converted, ${result.removed} removed`,
              })
            )
          }
        >
          Repair all tabs
        </button>
      </section>
    </main>
  );
}
