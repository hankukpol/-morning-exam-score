"use client";

import { Subject } from "@prisma/client";
import { useMemo, useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import { SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

type WrongNoteRow = {
  id: number;
  questionId: number;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  examDate: string;
  subject: Subject;
  sessionId: number;
  questionNo: number;
  correctAnswer: string;
  correctRate: number | null;
  difficulty: string | null;
  studentAnswer: string | null;
};

type WrongNoteManagerProps = {
  initialNotes: WrongNoteRow[];
};

export function WrongNoteManager({ initialNotes }: WrongNoteManagerProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [subject, setSubject] = useState<Subject | "ALL">("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(initialNotes.map((note) => [note.id, note.memo ?? ""])),
  );
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      if (subject !== "ALL" && note.subject !== subject) {
        return false;
      }

      if (startDate && formatDate(note.examDate) < startDate) {
        return false;
      }

      if (endDate && formatDate(note.examDate) > endDate) {
        return false;
      }

      return true;
    });
  }, [endDate, notes, startDate, subject]);

  function setMessage(nextNotice: string | null, nextError: string | null) {
    setNotice(nextNotice);
    setErrorMessage(nextError);
  }

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "요청 처리에 실패했습니다.");
    }

    return payload;
  }

  function saveMemo(noteId: number) {
    setMessage(null, null);

    startTransition(async () => {
      try {
        const payload = await requestJson(`/api/student/wrong-notes/${noteId}`, {
          method: "PUT",
          body: JSON.stringify({
            memo: drafts[noteId] ?? "",
          }),
        });

        setNotes((current) =>
          current.map((note) =>
            note.id === noteId
              ? {
                  ...note,
                  memo: payload.note.memo,
                  updatedAt: payload.note.updatedAt,
                }
              : note,
          ),
        );
        setNotice("메모를 저장했습니다.");
        setErrorMessage(null);
      } catch (error) {
        setNotice(null);
        setErrorMessage(
          error instanceof Error ? error.message : "메모 저장에 실패했습니다.",
        );
      }
    });
  }

  function deleteNote(noteId: number) {
    confirmModal.openModal({
      badgeLabel: "삭제 확인",
      badgeTone: "warning",
      title: "오답 노트 삭제",
      description: "이 오답 노트를 삭제하시겠습니까?",
      details: ["삭제한 노트는 다시 복구할 수 없습니다."],
      cancelLabel: "취소",
      confirmLabel: "삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setMessage(null, null);

        startTransition(async () => {
          try {
            await requestJson(`/api/student/wrong-notes/${noteId}`, {
              method: "DELETE",
            });

            setNotes((current) => current.filter((note) => note.id !== noteId));
            setNotice("오답 노트를 삭제했습니다.");
            setErrorMessage(null);
          } catch (error) {
            setNotice(null);
            setErrorMessage(
              error instanceof Error ? error.message : "오답 노트 삭제에 실패했습니다.",
            );
          }
        });
      },
    });
  }

  function clearAll() {
    confirmModal.openModal({
      badgeLabel: "전체 삭제 확인",
      badgeTone: "warning",
      title: "오답 노트 전체 삭제",
      description: "저장한 오답 노트를 모두 삭제하시겠습니까?",
      details: ["전체 삭제 후에는 저장한 메모와 오답 기록을 복구할 수 없습니다."],
      cancelLabel: "취소",
      confirmLabel: "전체 삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setMessage(null, null);

        startTransition(async () => {
          try {
            await requestJson("/api/student/wrong-notes", {
              method: "DELETE",
            });

            setNotes([]);
            setNotice("오답 노트를 모두 삭제했습니다.");
            setErrorMessage(null);
          } catch (error) {
            setNotice(null);
            setErrorMessage(
              error instanceof Error ? error.message : "오답 노트 전체 삭제에 실패했습니다.",
            );
          }
        });
      },
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">오답 노트 필터</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              과목과 날짜 범위로 저장한 오답을 빠르게 정리할 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={clearAll}
            disabled={isPending || notes.length === 0}
            className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            전체 삭제
          </button>
        </div>

        {notice ? (
          <div className="mt-4 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
            {notice}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <select
            value={subject}
            onChange={(event) => setSubject(event.target.value as Subject | "ALL")}
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
          >
            <option value="ALL">전체 과목</option>
            {Object.values(Subject).map((value) => (
              <option key={value} value={value}>
                {SUBJECT_LABEL[value]}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
          />
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
          />
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">저장한 오답</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              현재 필터에 맞는 문항 {filteredNotes.length}건을 표시하고 있습니다.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {filteredNotes.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              저장한 오답이 없거나, 현재 필터에 맞는 데이터가 없습니다.
            </div>
          ) : null}

          {filteredNotes.map((note) => (
            <article key={note.id} className="rounded-[24px] border border-ink/10 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                      {SUBJECT_LABEL[note.subject]}
                    </span>
                    <span className="inline-flex rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-slate">
                      {formatDate(note.examDate)}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{note.questionNo}번 문항</h3>
                  <div className="mt-3 grid gap-2 text-sm text-slate sm:grid-cols-2">
                    <p>정답: {note.correctAnswer}</p>
                    <p>내 답안: {note.studentAnswer ?? "-"}</p>
                    <p>
                      정답률{" "}
                      {note.correctRate !== null && note.correctRate !== undefined
                        ? `${note.correctRate.toFixed(1)}%`
                        : "-"}
                    </p>
                    <p>난이도: {note.difficulty ?? "-"}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => deleteNote(note.id)}
                  disabled={isPending}
                  className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  삭제
                </button>
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-sm font-medium">메모</label>
                <textarea
                  value={drafts[note.id] ?? ""}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [note.id]: event.target.value,
                    }))
                  }
                  rows={4}
                  className="w-full rounded-[20px] border border-ink/10 px-4 py-3 text-sm leading-7"
                  placeholder="복습 포인트나 다음에 다시 확인할 내용을 적어 두세요."
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate">마지막 수정 {formatDate(note.updatedAt)}</p>
                <button
                  type="button"
                  onClick={() => saveMemo(note.id)}
                  disabled={isPending}
                  className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
                >
                  메모 저장
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <ActionModal
        open={Boolean(confirmModal.modal)}
        badgeLabel={confirmModal.modal?.badgeLabel ?? ""}
        badgeTone={confirmModal.modal?.badgeTone}
        title={confirmModal.modal?.title ?? ""}
        description={confirmModal.modal?.description ?? ""}
        details={confirmModal.modal?.details ?? []}
        cancelLabel={confirmModal.modal?.cancelLabel}
        confirmLabel={confirmModal.modal?.confirmLabel ?? "확인"}
        confirmTone={confirmModal.modal?.confirmTone}
        isPending={isPending}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
    </div>
  );
}