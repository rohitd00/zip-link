import { useEffect, useRef } from "react";
import { Button } from "./Button";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  isConfirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A destructive-action confirmation dialog built on the native <dialog>
 * element. showModal()/close() give us a focus trap, Escape-to-close, and
 * a backdrop for free, instead of hand-rolling that accessibility
 * behavior, matching Section 10 of the design specification.
 */
export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  isConfirming,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogElement = dialogRef.current;

    if (dialogElement === null) {
      return;
    }

    if (isOpen && !dialogElement.open) {
      dialogElement.showModal();
    }

    if (!isOpen && dialogElement.open) {
      dialogElement.close();
    }
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        // The native Escape-to-close event; route it through the same
        // cancel handler so parent state stays in sync.
        event.preventDefault();
        onCancel();
      }}
      className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-dialog)] backdrop:bg-text/30"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
    >
      <h2 id="confirm-dialog-title" className="text-base font-semibold tracking-tight text-text">
        {title}
      </h2>
      <p id="confirm-dialog-description" className="mt-2 text-sm leading-relaxed text-text-muted">
        {description}
      </p>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={isConfirming}>
          Cancel
        </Button>
        <Button
          variant="destructive-solid"
          onClick={onConfirm}
          isLoading={isConfirming}
          loadingLabel="Deleting…"
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
