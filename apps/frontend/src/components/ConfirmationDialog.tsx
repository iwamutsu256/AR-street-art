"use client";

import { useEffect, useId } from "react";

type ConfirmationDialogProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  confirmTone?: "primary" | "destructive";
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
};

export function ConfirmationDialog({
  cancelLabel = "キャンセル",
  confirmLabel = "OK",
  confirmTone = "primary",
  description,
  onCancel,
  onConfirm,
  open,
  title,
}: ConfirmationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-120 grid place-items-center bg-overlay p-6 backdrop-blur-sm max-[720px]:p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="grid w-full max-w-105 gap-5 rounded-3xl border border-border bg-bg-elevated p-6 shadow-[var(--shadow-elevated)] max-[720px]:rounded-[20px] max-[720px]:p-5"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="stack-sm">
          <h2 className="m-0 text-lg leading-snug" id={titleId}>
            {title}
          </h2>
          <p className="m-0 leading-7 text-fg-muted" id={descriptionId}>
            {description}
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-3 max-[720px]:flex-col-reverse">
          <button
            className="button button-secondary max-[720px]:w-full"
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={
              confirmTone === "destructive"
                ? "button button-destructive max-[720px]:w-full"
                : "button button-primary max-[720px]:w-full"
            }
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
