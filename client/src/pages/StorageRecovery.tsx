import { Download, Trash2 } from "lucide-react";

export function StorageRecovery({
  raw,
  storageKey,
  onClear,
}: {
  raw: unknown;
  storageKey: string;
  onClear: () => Promise<void>;
}) {
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
      <section className="w-full max-w-2xl border border-[#d8d3c8] bg-[#fffdf8] p-7 shadow-sm">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#e95224]">
          Recovery required
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.05em]">
          This browser library is not schema v2.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[#687067]">
          TabVault stopped before loading <code>{storageKey}</code>. Download
          the untouched data first if you may want to adapt it later, or clear
          it and start with an empty v2 library.
        </p>
        <div className="mt-7 flex flex-row gap-3">
          <button
            type="button"
            onClick={download}
            className="inline-flex flex-1 items-center justify-center gap-2 border border-[#cfc8ba] px-4 py-3 text-sm font-semibold hover:border-[#e95224]"
          >
            <Download className="h-4 w-4" /> Download raw data
          </button>
          <button
            type="button"
            onClick={() => void onClear()}
            className="inline-flex flex-1 items-center justify-center gap-2 bg-[#e95224] px-4 py-3 text-sm font-semibold text-white hover:bg-[#cf431b]"
          >
            <Trash2 className="h-4 w-4" /> Clear and start empty
          </button>
        </div>
      </section>
    </main>
  );
}
