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
      className="dialog-backdrop"
      onClick={onCancel}
      role="presentation"
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="stack-sm">
          <h2 className="dialog__title" id={titleId}>
            {title}
          </h2>
          <p className="dialog__description" id={descriptionId}>
            {description}
          </p>
        </div>

        <div className="dialog__actions">
          <button
            className="button button-secondary"
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={
              confirmTone === "destructive"
                ? "button button-destructive"
                : "button button-primary"
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
