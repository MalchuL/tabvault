import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Block library startup when stored data cannot be read as schema v3.
 * Offers a download of the untouched value before the user chooses to clear it.
 * @param {{ raw: unknown; storageKey: string; onClear: () => Promise<void> }} props - Invalid data, its key, and the explicit clear action.
 * @returns {JSX.Element} Recovery choices for the incompatible browser vault.
 */
export function StorageRecovery({
  raw,
  storageKey,
  onClear,
}: {
  raw: unknown;
  storageKey: string;
  onClear: () => Promise<void>;
}) {
  /**
   * Download a browser-vault recovery snapshot.
   *
   * Serialize the locally stored vault into a JSON file for manual recovery.
   */
  const download = () => {
    const content =
      typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json" })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tabvault-browser-recovery-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f3ec] p-6 text-[#18261f]">
      <Card className="w-full max-w-2xl gap-0 rounded-none border-[#d8d3c8] bg-[#fffdf8] p-7 shadow-sm">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#e95224]">
          Recovery required
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.05em]">
          This browser library is not schema v3.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[#687067]">
          TabVault stopped before loading <code>{storageKey}</code>. Download
          the untouched data first if you may want to adapt it later, or clear
          it and start with an empty v3 library.
        </p>
        <div className="mt-7 flex flex-row gap-3">
          <Button
            variant="outline"
            type="button"
            onClick={download}
            className="inline-flex flex-1 items-center justify-center gap-2 border border-[#cfc8ba] px-4 py-3 text-sm font-semibold hover:border-[#e95224]"
          >
            <Download className="h-4 w-4" /> Download raw data
          </Button>
          <Button
            type="button"
            onClick={() => void onClear()}
            className="inline-flex flex-1 items-center justify-center gap-2 bg-[#e95224] px-4 py-3 text-sm font-semibold text-white hover:bg-[#cf431b]"
          >
            <Trash2 className="h-4 w-4" /> Clear and start empty
          </Button>
        </div>
      </Card>
    </main>
  );
}
