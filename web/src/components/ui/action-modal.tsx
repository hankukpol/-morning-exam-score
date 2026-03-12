"use client";

import { useEffect } from "react";

export type ActionModalProps = {
  open: boolean;
  badgeLabel: string;
  badgeTone?: "default" | "success" | "warning";
  title: string;
  description: string;
  details?: string[];
  cancelLabel?: string;
  confirmLabel: string;
  confirmTone?: "default" | "danger";
  isPending?: boolean;
  onClose: () => void;
  onConfirm?: () => void;
};

const badgeToneClass = {
  default: "border-ink/10 bg-mist text-ink",
  success: "border-forest/20 bg-forest/10 text-forest",
  warning: "border-ember/20 bg-ember/10 text-ember",
} as const;

const confirmToneClass = {
  default: "bg-ink text-white hover:bg-forest",
  danger: "bg-red-600 text-white hover:bg-red-700",
} as const;

export function ActionModal({
  open,
  badgeLabel,
  badgeTone = "default",
  title,
  description,
  details = [],
  cancelLabel,
  confirmLabel,
  confirmTone = "default",
  isPending = false,
  onClose,
  onConfirm,
}: ActionModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isPending, onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-modal-title"
      onClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-md rounded-[28px] border border-ink/10 bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${badgeToneClass[badgeTone]}`}
        >
          {badgeLabel}
        </div>
        <h3 id="action-modal-title" className="mt-4 text-2xl font-semibold text-ink">
          {title}
        </h3>
        <p className="mt-3 text-sm leading-7 text-slate">{description}</p>
        {details.length > 0 ? (
          <div className="mt-5 rounded-3xl bg-mist p-4">
            <div className="space-y-2 text-sm text-ink">
              {details.map((detail) => (
                <p key={detail}>{detail}</p>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          {cancelLabel ? (
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold text-ink transition hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onConfirm ?? onClose}
            disabled={isPending}
            className={`inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${confirmToneClass[confirmTone]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
