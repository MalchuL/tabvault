import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  deletePropertyDefinition,
  getPropertySchema,
  repairPropertyValues,
  upsertPropertyDefinition,
  validatePropertyValues,
  type PropertyDefinition,
  type PropertySchema,
} from "@/domain/server/propertySchema";

const TYPES = ["string", "int", "float", "boolean", "json"] as const;

/**
 * Parse a property default using its declared schema type.
 * Integer parsing rejects partial numbers; floating defaults must be finite.
 * @param {PropertyDefinition["type"]} type - Property type chosen by the user.
 * @param {string} raw - Text entered in the default-value field.
 * @returns {unknown} Value ready for the property definition.
 * @throws {Error} When the text does not match the selected type.
 */
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

/**
 * Edit custom property definitions and inspect stored-value validation results.
 * @returns {JSX.Element} Property schema administration page.
 */
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

  /**
   * Save a custom property definition.
   *
   * Parse the draft default value, update the schema, and reset the form on success.
   * @returns {Promise<void>} Resolves after the save attempt.
   */
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
    <main className="mx-auto max-w-5xl px-5 py-6 sm:px-8">
      <h1 className="mt-2 font-['DM_Sans'] text-2xl font-bold tracking-[-0.04em]">
        Custom Properties
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-[#687067]">
        Add fields and default values to saved tabs.
      </p>
      <section className="mt-5 grid gap-3">
        {Object.entries(schema).map(([propertyName, definition]) => (
          <Card
            key={propertyName}
            className="gap-0 rounded-none border-[#ded9cd] bg-[#fffdf8] p-4 shadow-none"
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
              <Button
                variant="ghost"
                type="button"
                className="text-xs font-semibold text-[#a33b21]"
                onClick={() =>
                  void deletePropertyDefinition(propertyName).then(setSchema)
                }
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </section>
      <Card className="mt-5 gap-0 rounded-none border-[#ded9cd] bg-[#fffdf8] p-5 shadow-none">
        <h2 className="font-semibold">Add or update a property</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Input
            className="border border-[#ded9cd] p-3 text-sm"
            placeholder="propertyName"
            value={name}
            onChange={event => setName(event.target.value)}
          />
          <NativeSelect
            className="border border-[#ded9cd] p-3 text-sm"
            value={type}
            onChange={event =>
              setType(event.target.value as PropertyDefinition["type"])
            }
          >
            {TYPES.map(value => (
              <option key={value}>{value}</option>
            ))}
          </NativeSelect>
          <Input
            className="border border-[#ded9cd] p-3 text-sm sm:col-span-2"
            placeholder="Description (optional)"
            value={description}
            onChange={event => setDescription(event.target.value)}
          />
          <Textarea
            className="border border-[#ded9cd] p-3 font-mono text-sm sm:col-span-2"
            placeholder="Default value"
            value={defaultText}
            onChange={event => setDefaultText(event.target.value)}
          />
        </div>
        <Button
          type="button"
          disabled={busy || !name}
          onClick={() => void save()}
          className="mt-4 bg-[#e95224] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Save property
        </Button>
      </Card>
      <section className="mt-6 flex flex-wrap gap-3">
        <Button
          variant="outline"
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
        </Button>
        <Button
          variant="outline"
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
        </Button>
      </section>
    </main>
  );
}
