import { useState } from "react";
import { Link } from "wouter";
import { useLibrary } from "@/domain/library/library-context";
import { changePropertyDefinition } from "@/domain/library/properties";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  repairPropertyValues,
  validatePropertyValues,
  type PropertyDefinition,
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
  const { vault, mutate, persistenceStatus, syncStatus, synchronize } =
    useLibrary();
  const schema = vault.propertySchema;
  const hasPendingChanges = Object.values(vault.sync.pending).some(
    change => change.kind === "property"
  );
  const connected = syncStatus?.state === "synced" && !hasPendingChanges;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<PropertyDefinition["type"]>("string");
  const [defaultText, setDefaultText] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * Save a custom property definition.
   *
   * Parse the draft default value, update the schema, and reset the form on success.
   * @returns {Promise<void>} Resolves after the save attempt.
   */
  const save = async () => {
    try {
      setBusy(true);
      const definition = {
        description,
        type,
        default: parseDefault(type, defaultText),
      };
      await mutate(current =>
        changePropertyDefinition(current, name, definition)
      );
      setName("");
      setDescription("");
      setDefaultText("");
      toast.success("Custom property updated");
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
        Add fields and default values to saved tabs. Definitions are saved in
        this browser.
      </p>
      <p role="status" className="mt-3 text-sm text-[#687067]">
        {persistenceStatus === "error"
          ? "Could not save changes in this browser."
          : persistenceStatus === "saving"
            ? "Saving in this browser…"
            : syncStatus?.state === "local_only"
              ? "Saved locally. Enable Backend preferred in Settings to sync definitions."
              : connected
                ? "Definitions synced with the backend."
                : "Saved locally. Backend sync is pending and will retry automatically."}{" "}
        <Link href="/settings" className="underline">
          Settings
        </Link>
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-3"
        onClick={() =>
          void synchronize().catch(error => toast.error(String(error)))
        }
      >
        Sync now
      </Button>
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
              {
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setName(propertyName);
                      setDescription(definition.description);
                      setType(definition.type);
                      setDefaultText(
                        definition.type === "string"
                          ? String(definition.default)
                          : JSON.stringify(definition.default)
                      );
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    className="text-xs font-semibold text-[#a33b21]"
                    onClick={() => {
                      void mutate(current =>
                        changePropertyDefinition(current, propertyName, null)
                      ).catch(error => toast.error(String(error)));
                    }}
                  >
                    Delete
                  </Button>
                </div>
              }
            </div>
          </Card>
        ))}
      </section>
      <Card className="mt-5 gap-0 rounded-none border-[#ded9cd] bg-[#fffdf8] p-5 shadow-none">
        <h2 className="font-semibold">Add or update a property</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Input
            className="border border-[#ded9cd] p-3 text-sm"
            aria-label="Property name"
            maxLength={128}
            placeholder="propertyName"
            value={name}
            onChange={event => setName(event.target.value)}
          />
          <NativeSelect
            className="border border-[#ded9cd] p-3 text-sm"
            aria-label="Property type"
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
            aria-label="Property description"
            maxLength={1000}
            placeholder="Description (optional)"
            value={description}
            onChange={event => setDescription(event.target.value)}
          />
          <Textarea
            className="border border-[#ded9cd] p-3 font-mono text-sm sm:col-span-2"
            aria-label="Default value"
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
          disabled={!connected}
          onClick={() =>
            void validatePropertyValues()
              .then(result =>
                toast.success(
                  result.valid
                    ? "All values are valid"
                    : "Validation found issues",
                  {
                    description: `${result.summary.invalidValues} invalid, ${result.summary.undeclaredValues} undeclared`,
                  }
                )
              )
              .catch(error =>
                toast.error("Could not validate property values", {
                  description: String(error),
                })
              )
          }
        >
          Validate all tabs
        </Button>
        <Button
          variant="outline"
          type="button"
          className="border border-[#bcb6a8] px-4 py-2 text-sm font-semibold"
          disabled={!connected}
          onClick={() =>
            void repairPropertyValues()
              .then(result =>
                toast.success("Repair complete", {
                  description: `${result.converted} converted, ${result.removed} removed`,
                })
              )
              .catch(error =>
                toast.error("Could not repair property values", {
                  description: String(error),
                })
              )
          }
        >
          Repair all tabs
        </Button>
      </section>
      <p className="mt-2 text-xs text-[#747970]">
        Validation and repair inspect backend tabs and require a synced backend
        connection.
      </p>
    </main>
  );
}
