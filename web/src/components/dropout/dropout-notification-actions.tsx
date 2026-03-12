"use client";

import { ExamType, StudentStatus } from "@prisma/client";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import { useState, useTransition } from "react";

type Props = {
  periodId: number;
  examType: ExamType;
  statuses: StudentStatus[];
  recipientCount: number;
};

export function DropoutNotificationActions({
  periodId,
  examType,
  statuses,
  recipientCount,
}: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();
  const completionModal = useActionModalState();

  const hasSendableStatus = statuses.some(
    (status) =>
      status === StudentStatus.WARNING_1 ||
      status === StudentStatus.WARNING_2 ||
      status === StudentStatus.DROPOUT,
  );

  function sendNotifications() {
    if (!hasSendableStatus || recipientCount === 0) {
      setNotice(null);
      setErrorMessage("현재 조건에 맞는 발송 대상자가 없습니다.");
      return;
    }

    confirmModal.openModal({
      badgeLabel: "?? ??",
      badgeTone: "warning",
      title: "??/?? ?? ?? ??",
      description: `${recipientCount}??? ?? ??/?? ?? ??? ?????????`,
      details: ["?? ?? ?? ??? ???? ?????."],
      cancelLabel: "??",
      confirmLabel: "??",
      onConfirm: () => {
        confirmModal.closeModal();
        setNotice(null);
        setErrorMessage(null);

        startTransition(async () => {
          try {
            const response = await fetch("/api/notifications/send", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                periodId,
                examType,
                statuses,
              }),
            });
            const payload = (await response.json()) as {
              error?: string;
              createdCount?: number;
              duplicateCount?: number;
              sentCount?: number;
              failedCount?: number;
              skippedCount?: number;
            };

            if (!response.ok) {
              throw new Error(payload.error ?? "?? ??? ??????.");
            }

            const summary = `?? ${recipientCount}? / ?? ${payload.createdCount ?? 0}? / ???? ${payload.duplicateCount ?? 0}? / ?? ${payload.sentCount ?? 0}? / ?? ${payload.failedCount ?? 0}? / ?? ${payload.skippedCount ?? 0}?`;
            setNotice(summary);
            completionModal.openModal({
              badgeLabel: "?? ??",
              badgeTone: "success",
              title: "?? ?? ??? ???????.",
              description: "??/?? ?? ?? ?? ??? ?????.",
              details: [summary],
              confirmLabel: "??",
            });
          } catch (error) {
            setErrorMessage(
              error instanceof Error ? error.message : "?? ??? ??????.",
            );
          }
        });
      },
    });
  }

  return (
    <div className="rounded-[24px] border border-ink/10 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate">
          오늘 발송 대상 {recipientCount}명
        </div>
        <button
          type="button"
          onClick={sendNotifications}
          disabled={isPending || !hasSendableStatus || recipientCount === 0}
          className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
        >
          현재 대상 문자 발송
        </button>
      </div>
      {notice ? <p className="mt-2 text-xs text-forest">{notice}</p> : null}
      {errorMessage ? <p className="mt-2 text-xs text-red-700">{errorMessage}</p> : null}
      <ActionModal
        open={Boolean(confirmModal.modal)}
        badgeLabel={confirmModal.modal?.badgeLabel ?? ""}
        badgeTone={confirmModal.modal?.badgeTone}
        title={confirmModal.modal?.title ?? ""}
        description={confirmModal.modal?.description ?? ""}
        details={confirmModal.modal?.details ?? []}
        cancelLabel={confirmModal.modal?.cancelLabel}
        confirmLabel={confirmModal.modal?.confirmLabel ?? "??"}
        confirmTone={confirmModal.modal?.confirmTone}
        isPending={isPending}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
      <ActionModal
        open={Boolean(completionModal.modal)}
        badgeLabel={completionModal.modal?.badgeLabel ?? ""}
        badgeTone={completionModal.modal?.badgeTone}
        title={completionModal.modal?.title ?? ""}
        description={completionModal.modal?.description ?? ""}
        details={completionModal.modal?.details ?? []}
        confirmLabel={completionModal.modal?.confirmLabel ?? "??"}
        onClose={completionModal.closeModal}
        onConfirm={completionModal.modal?.onConfirm}
      />
    </div>
  );
}