import type { ReactNode } from "react";
import { Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Render a shared dialog heading.
 * The heading keeps dialog titles visually consistent.
 * @param {{ eyebrow: string; title: string }} props - Short category label and dialog title.
 * @returns {React.ReactElement} Dialog heading.
 */
export function DialogHeading({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <DialogHeader className="pr-8 text-left">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#858980]">
        {eyebrow}
      </p>
      <DialogTitle className="font-['DM_Sans'] text-[20px] font-bold tracking-[-0.045em]">
        {title}
      </DialogTitle>
    </DialogHeader>
  );
}

/**
 * Render cancel and confirm controls for an edit dialog.
 * The confirm label and optional icon come from the caller.
 * @param {{ onCancel: () => void; onConfirm: () => void; confirmLabel: string; icon?: boolean; }} props - Cancel and confirm callbacks, label, and icon option.
 * @returns {React.ReactElement} Dialog action row.
 */
export function DialogActions({
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
    <DialogFooter className="mt-5 flex-row justify-end gap-2">
      <Button
        variant="ghost"
        onClick={onCancel}
        className="px-3 py-2 text-[11px] font-bold text-[#72776f]"
      >
        Cancel
      </Button>
      <Button
        onClick={onConfirm}
        className="inline-flex items-center gap-1.5 rounded-md bg-[#e95224] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#d94a1e]"
      >
        {icon && <Save className="h-3.5 w-3.5" />}
        {confirmLabel}
      </Button>
    </DialogFooter>
  );
}

/**
 * Present a destructive action with explicit confirmation.
 * The owning view performs the deletion only after confirmation.
 * @param {{ ariaLabel: string; eyebrow: string; title: string; description: string; confirmLabel: string; onClose: () => void; onConfirm: () => void; }} props - Accessible label, explanatory copy, and confirmation callbacks.
 * @returns {React.ReactElement} Destructive confirmation dialog.
 */
export function ConfirmDeleteDialog({
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
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent
        aria-labelledby={undefined}
        aria-label={ariaLabel}
        className="max-w-sm gap-0 rounded-none border-[#e3b7a7] bg-[#fffdf8] p-5 shadow-[0_24px_70px_rgba(24,38,31,0.25)]"
      >
        <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#c84b26]">
          <Trash2 className="h-3.5 w-3.5" /> {eyebrow}
        </p>
        <DialogTitle className="mt-2 font-['DM_Sans'] text-[22px] font-bold tracking-[-0.05em]">
          {title}
        </DialogTitle>
        <DialogDescription className="mt-3 text-[12px] leading-5 text-[#687067]">
          {description}
        </DialogDescription>
        <DialogFooter className="mt-6 flex-row justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="px-3 py-2 text-[11px] font-bold text-[#72776f] hover:text-[#18261f]"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            className="rounded-md bg-[#c84b26] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#ae3b1d]"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Pair a form label with its control and optional styling.
 * The wrapper preserves consistent field spacing across dialogs.
 * @param {{ label: string; className?: string; children: ReactNode; }} props - Label, optional class name, and form control children.
 * @returns {React.ReactElement} Labeled form field.
 */
export function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Label className={className}>
      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#858980]">
        {label}
      </span>
      {children}
    </Label>
  );
}
