"use client";

import {
  AbsenceCategory,
  AbsenceStatus,
  StudentStatus,
  Subject,
} from "@/generated/prisma";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from "@/lib/analytics/presentation";
import {
  ABSENCE_CATEGORY_LABEL,
  SUBJECT_LABEL,
} from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { useMemo, useState, useTransition } from "react";

type SessionOption = {
  id: number;
  examDate: string;
  subject: Subject;
  week: number;
};

type StudentOption = {
  examNumber: string;
  name: string;
};

type AbsenceNoteRecord = {
  id: number;
  examNumber: string;
  sessionId: number;
  reason: string;
  absenceCategory: AbsenceCategory | null;
  submittedAt: string | null;
  approvedAt: string | null;
  status: AbsenceStatus;
  attendGrantsPerfectAttendance: boolean;
  adminNote: string | null;
  student: {
    name: string;
    currentStatus: StudentStatus;
  };
  session: {
    examDate: string;
    week: number;
    subject: Subject;
    period: {
      name: string;
    };
  };
};

type AbsenceNoteManagerProps = {
  students: StudentOption[];
  sessions: SessionOption[];
  notes: AbsenceNoteRecord[];
};

const NOTE_STATUS_LABEL: Record<AbsenceStatus, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "반려",
};

const NOTE_STATUS_CLASS: Record<AbsenceStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-forest/20 bg-forest/10 text-forest",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
};

function booleanFromFormData(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

export function AbsenceNoteManager({
  students,
  sessions,
  notes,
}: AbsenceNoteManagerProps) {
  const [createExamNumber, setCreateExamNumber] = useState(students[0]?.examNumber ?? "");
  const [createSessionId, setCreateSessionId] = useState(String(sessions[0]?.id ?? ""));
  const [createCategory, setCreateCategory] = useState<AbsenceCategory>(AbsenceCategory.OTHER);
  const [createReason, setCreateReason] = useState("");
  const [createAdminNote, setCreateAdminNote] = useState("");
  const [createPerfectAttendance, setCreatePerfectAttendance] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const availableSessionIds = useMemo(
    () => new Set(sessions.map((session) => String(session.id))),
    [sessions],
  );

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "요청에 실패했습니다.");
    }

    return payload;
  }

  function setMessage(nextNotice: string | null, nextError: string | null) {
    setNotice(nextNotice);
    setErrorMessage(nextError);
  }

  function reloadPage(message: string) {
    setMessage(message, null);
    window.location.reload();
  }

  function createNote() {
    setMessage(null, null);

    startTransition(async () => {
      try {
        await requestJson("/api/absence-notes", {
          method: "POST",
          body: JSON.stringify({
            examNumber: createExamNumber,
            sessionId: Number(createSessionId),
            reason: createReason,
            absenceCategory: createCategory,
            attendGrantsPerfectAttendance:
              createCategory === AbsenceCategory.MILITARY
                ? true
                : createPerfectAttendance,
            adminNote: createAdminNote,
          }),
        });

        reloadPage("사유서를 등록했습니다.");
      } catch (error) {
        setMessage(
          null,
          error instanceof Error ? error.message : "사유서 등록에 실패했습니다.",
        );
      }
    });
  }

  function updateNote(noteId: number, formData: FormData) {
    setMessage(null, null);

    startTransition(async () => {
      try {
        await requestJson(`/api/absence-notes/${noteId}`, {
          method: "PUT",
          body: JSON.stringify({
            action: "update",
            reason: String(formData.get("reason") ?? ""),
            absenceCategory: formData.get("absenceCategory"),
            adminNote: String(formData.get("adminNote") ?? ""),
          }),
        });

        reloadPage("사유서를 수정했습니다.");
      } catch (error) {
        setMessage(
          null,
          error instanceof Error ? error.message : "사유서 수정에 실패했습니다.",
        );
      }
    });
  }

  function reviewNote(noteId: number, formData: FormData, action: "approve" | "reject") {
    setMessage(null, null);

    startTransition(async () => {
      try {
        const absenceCategory = formData.get("absenceCategory") as AbsenceCategory | null;
        await requestJson(`/api/absence-notes/${noteId}`, {
          method: "PUT",
          body: JSON.stringify({
            action,
            adminNote: String(formData.get("adminNote") ?? ""),
            attendGrantsPerfectAttendance:
              absenceCategory === AbsenceCategory.MILITARY
                ? true
                : booleanFromFormData(formData, "attendGrantsPerfectAttendance"),
          }),
        });

        reloadPage(action === "approve" ? "사유서를 승인했습니다." : "사유서를 반려했습니다.");
      } catch (error) {
        setMessage(
          null,
          error instanceof Error ? error.message : "사유서 검토에 실패했습니다.",
        );
      }
    });
  }

  function removeNote(noteId: number) {
    if (!window.confirm("사유서를 삭제하시겠습니까? 승인된 사유서는 EXCUSED 처리도 함께 되돌립니다.")) {
      return;
    }

    setMessage(null, null);

    startTransition(async () => {
      try {
        await requestJson(`/api/absence-notes/${noteId}`, {
          method: "DELETE",
        });

        reloadPage("사유서를 삭제했습니다.");
      } catch (error) {
        setMessage(
          null,
          error instanceof Error ? error.message : "사유서 삭제에 실패했습니다.",
        );
      }
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
        <h2 className="text-xl font-semibold">운영 규정</h2>
        <ul className="mt-4 space-y-2 text-sm leading-7 text-slate">
          <li>시험 종료 후에는 사유서를 등록할 수 없습니다.</li>
          <li>군무는 승인 시 개근 인정이 자동으로 적용됩니다.</li>
          <li>병원, 경조사, 기타는 승인 시 개근 인정 여부를 직접 선택합니다.</li>
          <li>승인되면 ABSENT는 EXCUSED로 변경되고 상태 판정이 다시 계산됩니다.</li>
        </ul>
      </section>

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

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">사유서 등록</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              오늘 이후 회차만 등록 목록에 노출합니다. 지난 회차는 기존 건 검토만 가능합니다.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium">수강생</label>
            <select
              value={createExamNumber}
              onChange={(event) => setCreateExamNumber(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            >
              {students.map((student) => (
                <option key={student.examNumber} value={student.examNumber}>
                  {student.examNumber} · {student.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">회차</label>
            <select
              value={createSessionId}
              onChange={(event) => setCreateSessionId(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {formatDate(session.examDate)} · {session.week}주차 · {SUBJECT_LABEL[session.subject]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">사유 유형</label>
            <select
              value={createCategory}
              onChange={(event) => setCreateCategory(event.target.value as AbsenceCategory)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            >
              {Object.values(AbsenceCategory).map((category) => (
                <option key={category} value={category}>
                  {ABSENCE_CATEGORY_LABEL[category]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 rounded-2xl border border-ink/10 px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={
                  createCategory === AbsenceCategory.MILITARY
                    ? true
                    : createPerfectAttendance
                }
                disabled={createCategory === AbsenceCategory.MILITARY}
                onChange={(event) => setCreatePerfectAttendance(event.target.checked)}
              />
              개근 인정
            </label>
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium">사유 내용</label>
          <textarea
            rows={4}
            value={createReason}
            onChange={(event) => setCreateReason(event.target.value)}
            className="w-full rounded-3xl border border-ink/10 px-4 py-3 text-sm"
            placeholder="예: 병원 진료로 오전 시험 참석 불가"
          />
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium">관리자 메모</label>
          <input
            value={createAdminNote}
            onChange={(event) => setCreateAdminNote(event.target.value)}
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            placeholder="내부 확인 메모"
          />
        </div>

        <button
          type="button"
          onClick={createNote}
          disabled={
            isPending ||
            !createExamNumber ||
            !createReason.trim() ||
            !availableSessionIds.has(createSessionId)
          }
          className="mt-4 inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
        >
          사유서 등록
        </button>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">사유서 검토</h2>
        <div className="mt-6 space-y-4">
          {notes.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
              조회된 사유서가 없습니다.
            </div>
          ) : null}
          {notes.map((note) => (
            <article key={note.id} className="rounded-[28px] border border-ink/10 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold">
                      {note.examNumber} · {note.student.name}
                    </h3>
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${NOTE_STATUS_CLASS[note.status]}`}
                    >
                      {NOTE_STATUS_LABEL[note.status]}
                    </span>
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[note.student.currentStatus]}`}
                    >
                      {STATUS_LABEL[note.student.currentStatus]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate">
                    {note.session.period.name} · {formatDate(note.session.examDate)} · {note.session.week}
                    주차 · {SUBJECT_LABEL[note.session.subject]}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-ink">{note.reason}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate">
                    <span>분류: {note.absenceCategory ? ABSENCE_CATEGORY_LABEL[note.absenceCategory] : "-"}</span>
                    <span>제출: {note.submittedAt ? formatDateTime(note.submittedAt) : "-"}</span>
                    <span>승인: {note.approvedAt ? formatDateTime(note.approvedAt) : "-"}</span>
                    <span>개근 인정: {note.attendGrantsPerfectAttendance ? "예" : "아니오"}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeNote(note.id)}
                  disabled={isPending}
                  className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  삭제
                </button>
              </div>

              <form className="mt-5 grid gap-4 rounded-[24px] border border-ink/10 bg-mist p-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium">사유 내용</label>
                  <textarea
                    name="reason"
                    rows={3}
                    defaultValue={note.reason}
                    disabled={note.status === AbsenceStatus.APPROVED}
                    className="w-full rounded-3xl border border-ink/10 px-4 py-3 text-sm disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">사유 유형</label>
                  <select
                    name="absenceCategory"
                    defaultValue={note.absenceCategory ?? AbsenceCategory.OTHER}
                    disabled={note.status === AbsenceStatus.APPROVED}
                    className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm disabled:bg-slate-50"
                  >
                    {Object.values(AbsenceCategory).map((category) => (
                      <option key={category} value={category}>
                        {ABSENCE_CATEGORY_LABEL[category]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">관리자 메모</label>
                  <input
                    name="adminNote"
                    defaultValue={note.adminNote ?? ""}
                    className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
                    placeholder="내부 확인 메모"
                  />
                </div>
                <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-slate">
                    <input
                      type="checkbox"
                      name="attendGrantsPerfectAttendance"
                      defaultChecked={
                        note.absenceCategory === AbsenceCategory.MILITARY
                          ? true
                          : note.attendGrantsPerfectAttendance
                      }
                      disabled={note.absenceCategory === AbsenceCategory.MILITARY}
                    />
                    개근 인정
                  </label>

                  <div className="flex flex-wrap gap-3">
                    {note.status !== AbsenceStatus.APPROVED ? (
                      <button
                        type="button"
                        onClick={(event) => updateNote(note.id, new FormData(event.currentTarget.form!))}
                        disabled={isPending}
                        className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        저장
                      </button>
                    ) : null}
                    {note.status !== AbsenceStatus.APPROVED ? (
                      <button
                        type="button"
                        onClick={(event) =>
                          reviewNote(note.id, new FormData(event.currentTarget.form!), "approve")
                        }
                        disabled={isPending}
                        className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
                      >
                        승인
                      </button>
                    ) : null}
                    {note.status !== AbsenceStatus.REJECTED && note.status !== AbsenceStatus.APPROVED ? (
                      <button
                        type="button"
                        onClick={(event) =>
                          reviewNote(note.id, new FormData(event.currentTarget.form!), "reject")
                        }
                        disabled={isPending}
                        className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        반려
                      </button>
                    ) : null}
                  </div>
                </div>
              </form>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
