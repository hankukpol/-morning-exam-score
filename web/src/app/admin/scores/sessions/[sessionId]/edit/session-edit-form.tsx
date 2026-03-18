"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Subject } from "@prisma/client";
import { SUBJECT_LABEL, EXAM_TYPE_SUBJECTS } from "@/lib/constants";
import { ExamType } from "@prisma/client";

export type SessionEditData = {
  id: number;
  examType: ExamType;
  subject: Subject;
  displaySubjectName: string | null;
  examDate: string; // ISO string
  isCancelled: boolean;
  cancelReason: string | null;
};

type Props = {
  session: SessionEditData;
};

function Spinner() {
  return (
    <svg
      className="mr-1.5 inline-block h-3 w-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      (payload.error as string | undefined) ?? "요청에 실패했습니다.",
    );
  }
  return payload;
}

function toDateInputValue(isoString: string): string {
  const d = new Date(isoString);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function SessionEditForm({ session }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCancelled, setIsCancelled] = useState(session.isCancelled);

  const subjectsForType = EXAM_TYPE_SUBJECTS[session.examType];

  function handleSubmit() {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);

    setNotice(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const rawSubject = String(formData.get("subject") ?? "");
        const rawDisplaySubjectName =
          String(formData.get("displaySubjectName") ?? "").trim() || null;
        const rawExamDate = String(formData.get("examDate") ?? "");
        const rawCancelReason =
          String(formData.get("cancelReason") ?? "").trim() || null;

        await requestJson(`/api/sessions/${session.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            subject: rawSubject,
            displaySubjectName: rawDisplaySubjectName,
            examDate: rawExamDate,
            isCancelled,
            cancelReason: isCancelled ? rawCancelReason : null,
          }),
        });

        setNotice("회차 정보가 수정되었습니다.");
        router.refresh();
        router.push(`/admin/scores/sessions/${session.id}`);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "수정에 실패했습니다.",
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {notice}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <form ref={formRef} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Exam Date */}
            <div>
              <label className="mb-2 block text-sm font-medium">
                시험 날짜
              </label>
              <input
                type="date"
                name="examDate"
                defaultValue={toDateInputValue(session.examDate)}
                required
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
              />
            </div>

            {/* Subject */}
            <div>
              <label className="mb-2 block text-sm font-medium">과목</label>
              <select
                name="subject"
                defaultValue={session.subject}
                required
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
              >
                {subjectsForType.map((subj) => (
                  <option key={subj} value={subj}>
                    {SUBJECT_LABEL[subj]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Display Subject Name (custom label) */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              과목 표시명{" "}
              <span className="ml-1 font-normal text-slate">
                (비워 두면 기본 과목명 사용)
              </span>
            </label>
            <input
              type="text"
              name="displaySubjectName"
              defaultValue={session.displaySubjectName ?? ""}
              placeholder="예: 형법 (일반 범죄론)"
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
            />
          </div>

          {/* Cancelled toggle */}
          <div>
            <label className="mb-2 block text-sm font-medium">회차 상태</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsCancelled(false)}
                className={`rounded-full border px-5 py-2 text-sm font-semibold transition ${
                  !isCancelled
                    ? "border-forest bg-forest text-white"
                    : "border-ink/10 bg-white text-ink hover:border-forest/30 hover:text-forest"
                }`}
              >
                정상
              </button>
              <button
                type="button"
                onClick={() => setIsCancelled(true)}
                className={`rounded-full border px-5 py-2 text-sm font-semibold transition ${
                  isCancelled
                    ? "border-red-500 bg-red-500 text-white"
                    : "border-ink/10 bg-white text-ink hover:border-red-300 hover:text-red-600"
                }`}
              >
                취소됨
              </button>
            </div>
          </div>

          {/* Cancel reason (only when isCancelled) */}
          {isCancelled ? (
            <div>
              <label className="mb-2 block text-sm font-medium">취소 사유</label>
              <input
                type="text"
                name="cancelReason"
                defaultValue={session.cancelReason ?? ""}
                placeholder="취소 사유를 입력하세요"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
              />
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="inline-flex items-center rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
            >
              {isPending && <Spinner />}
              저장
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              disabled={isPending}
              className="inline-flex items-center rounded-full border border-ink/10 px-6 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-60"
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
