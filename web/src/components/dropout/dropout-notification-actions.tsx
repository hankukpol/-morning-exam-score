"use client";

import { ExamType, StudentStatus } from "@/generated/prisma";
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

    if (!window.confirm(`${recipientCount}명에게 현재 경고/탈락 안내 문자를 발송하시겠습니까?`)) {
      return;
    }

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
          throw new Error(payload.error ?? "문자 발송에 실패했습니다.");
        }

        setNotice(
          `대상 ${recipientCount}명 / 신규 ${payload.createdCount ?? 0}건 / 오늘중복 ${payload.duplicateCount ?? 0}건 / 발송 ${payload.sentCount ?? 0}건 / 실패 ${payload.failedCount ?? 0}건 / 제외 ${payload.skippedCount ?? 0}건`,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "문자 발송에 실패했습니다.",
        );
      }
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
    </div>
  );
}
