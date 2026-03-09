"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AttendType, StudentStatus, Subject } from "@/generated/prisma";
import {
  ATTEND_TYPE_LABEL,
  EXAM_TYPE_LABEL,
  SCORE_SOURCE_LABEL,
  SUBJECT_LABEL,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { STATUS_BADGE_CLASS, STATUS_LABEL } from "@/lib/analytics/presentation";

type ScoreHistoryRow = {
  id: number;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
  attendType: AttendType;
  note: string | null;
  sourceType: keyof typeof SCORE_SOURCE_LABEL;
  session: {
    id: number;
    week: number;
    subject: Subject;
    examDate: string;
    period: {
      name: string;
    };
  };
};

type StudentHistoryData = {
  examNumber: string;
  name: string;
  className: string | null;
  generation: number | null;
  examType: "GONGCHAE" | "GYEONGCHAE";
  currentStatus: StudentStatus;
  scores: ScoreHistoryRow[];
};

type EditDraft = {
  rawScore: string;
  oxScore: string;
  attendType: AttendType;
  note: string;
};

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload = {} as T & { error?: string };

  if (text.trim().length > 0) {
    try {
      payload = (JSON.parse(text) as T & { error?: string }) ?? ({} as T & { error?: string });
    } catch {
      payload = {} as T & { error?: string };
    }
  }

  if (!response.ok) {
    throw new Error(payload.error ?? "요청을 처리하지 못했습니다.");
  }

  return payload;
}

export function StudentScoreHistoryManager({
  initialStudent,
  canEdit,
}: {
  initialStudent: StudentHistoryData;
  canEdit: boolean;
}) {
  const [student, setStudent] = useState(initialStudent);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, EditDraft>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function getDraft(score: ScoreHistoryRow) {
    return (
      drafts[score.id] ?? {
        rawScore: score.rawScore?.toString() ?? "",
        oxScore: score.oxScore?.toString() ?? "",
        attendType: score.attendType,
        note: score.note ?? "",
      }
    );
  }

  function patchDraft(scoreId: number, patch: Partial<EditDraft>) {
    const currentScore = student.scores.find((score) => score.id === scoreId);

    if (!currentScore) {
      return;
    }

    setDrafts((current) => ({
      ...current,
      [scoreId]: {
        ...getDraft(currentScore),
        ...patch,
      },
    }));
  }

  function startEdit(score: ScoreHistoryRow) {
    setEditingId(score.id);
    setNotice(null);
    setErrorMessage(null);
    setDrafts((current) => ({
      ...current,
      [score.id]: getDraft(score),
    }));
  }

  async function refreshStudent() {
    const result = await requestJson<{ student: StudentHistoryData }>(
      `/api/students/${student.examNumber}/scores`,
    );

    if (!result.student) {
      throw new Error("학생 이력을 다시 불러오지 못했습니다.");
    }

    setStudent(result.student);
  }

  function saveScore(scoreId: number) {
    const currentScore = student.scores.find((score) => score.id === scoreId);

    if (!currentScore) {
      return;
    }

    const draft = getDraft(currentScore);

    startTransition(async () => {
      try {
        await requestJson(`/api/scores/${scoreId}`, {
          method: "PUT",
          body: JSON.stringify({
            rawScore: draft.rawScore === "" ? null : Number(draft.rawScore),
            oxScore: draft.oxScore === "" ? null : Number(draft.oxScore),
            attendType: draft.attendType,
            note: draft.note.trim() || null,
          }),
        });

        await refreshStudent();
        setEditingId(null);
        setNotice("출결/성적을 수정했고, 경고·탈락 상태를 다시 계산했습니다.");
        setErrorMessage(null);
      } catch (error) {
        setNotice(null);
        setErrorMessage(
          error instanceof Error ? error.message : "출결/성적 수정에 실패했습니다.",
        );
      }
    });
  }

  function deleteScore(scoreId: number) {
    if (
      !window.confirm(
        "이 성적 기록을 삭제하면 출결 상태와 경고 판정이 다시 계산됩니다. 계속하시겠습니까?",
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        await requestJson(`/api/scores/${scoreId}`, { method: "DELETE" });
        await refreshStudent();
        setEditingId((current) => (current === scoreId ? null : current));
        setNotice("성적 기록을 삭제했고, 경고·탈락 상태를 다시 계산했습니다.");
        setErrorMessage(null);
      } catch (error) {
        setNotice(null);
        setErrorMessage(
          error instanceof Error ? error.message : "성적 삭제에 실패했습니다.",
        );
      }
    });
  }

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            Student History
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold">
              {student.name} ({student.examNumber})
            </h1>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[student.currentStatus]}`}
            >
              {STATUS_LABEL[student.currentStatus]}
            </span>
            <span className="rounded-full bg-ink/5 px-3 py-1 text-xs font-semibold text-slate">
              {EXAM_TYPE_LABEL[student.examType]}
            </span>
          </div>
          <p className="mt-3 text-sm leading-7 text-slate">
            {student.className ?? "-"} /{" "}
            {student.generation ? `${student.generation}기` : "기수 미설정"}
          </p>
          <p className="mt-2 text-sm leading-7 text-slate">
            {canEdit
              ? "출결 유형을 ABSENT에서 NORMAL/LIVE/EXCUSED로 수정하면 현재 경고 상태와 주차 이력이 즉시 다시 계산됩니다."
              : "조회 전용 계정입니다. 수정은 교사 이상 권한에서 가능합니다."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/students?examType=${student.examType}`}
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            목록으로
          </Link>
          {canEdit ? (
            <Link
              href="/admin/scores/edit"
              className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest"
            >
              성적 수정 화면
            </Link>
          ) : null}
        </div>
      </div>

      {notice ? (
        <div className="mt-6 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {notice}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-8 overflow-hidden rounded-[28px] border border-ink/10">
        <table className="min-w-full divide-y divide-ink/10 text-sm">
          <thead className="bg-mist text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">기간</th>
              <th className="px-4 py-3 font-semibold">날짜</th>
              <th className="px-4 py-3 font-semibold">주차</th>
              <th className="px-4 py-3 font-semibold">과목</th>
              <th className="px-4 py-3 font-semibold">원점수</th>
              <th className="px-4 py-3 font-semibold">OX</th>
              <th className="px-4 py-3 font-semibold">최종점수</th>
              <th className="px-4 py-3 font-semibold">응시유형</th>
              <th className="px-4 py-3 font-semibold">메모</th>
              <th className="px-4 py-3 font-semibold">입력원천</th>
              {canEdit ? <th className="px-4 py-3 font-semibold">정정</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10 bg-white">
            {student.scores.map((score) => {
              const isEditing = canEdit && editingId === score.id;
              const draft = getDraft(score);

              return (
                <tr key={score.id} className={isEditing ? "bg-amber-50/40" : ""}>
                  <td className="px-4 py-3">{score.session.period.name}</td>
                  <td className="px-4 py-3">{formatDate(score.session.examDate)}</td>
                  <td className="px-4 py-3">{score.session.week}주차</td>
                  <td className="px-4 py-3">{SUBJECT_LABEL[score.session.subject]}</td>
                  {isEditing ? (
                    <>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={draft.rawScore}
                          onChange={(event) =>
                            patchDraft(score.id, { rawScore: event.target.value })
                          }
                          className="w-20 rounded-xl border border-ink/10 px-2 py-1 text-sm"
                          placeholder="-"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={draft.oxScore}
                          onChange={(event) =>
                            patchDraft(score.id, { oxScore: event.target.value })
                          }
                          className="w-20 rounded-xl border border-ink/10 px-2 py-1 text-sm"
                          placeholder="-"
                        />
                      </td>
                      <td className="px-4 py-3 text-slate">자동 계산</td>
                      <td className="px-4 py-3">
                        <select
                          value={draft.attendType}
                          onChange={(event) =>
                            patchDraft(score.id, {
                              attendType: event.target.value as AttendType,
                            })
                          }
                          className="rounded-xl border border-ink/10 px-2 py-1 text-sm"
                        >
                          {Object.values(AttendType).map((type) => (
                            <option key={type} value={type}>
                              {ATTEND_TYPE_LABEL[type]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          value={draft.note}
                          onChange={(event) =>
                            patchDraft(score.id, { note: event.target.value })
                          }
                          className="w-40 rounded-xl border border-ink/10 px-2 py-1 text-sm"
                          placeholder="메모"
                        />
                      </td>
                      <td className="px-4 py-3">{SCORE_SOURCE_LABEL[score.sourceType]}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => saveScore(score.id)}
                            disabled={isPending}
                            className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white transition hover:bg-forest disabled:opacity-50"
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ink/30"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteScore(score.id)}
                            disabled={isPending}
                            className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3">{score.rawScore ?? "-"}</td>
                      <td className="px-4 py-3">{score.oxScore ?? "-"}</td>
                      <td className="px-4 py-3">{score.finalScore ?? "-"}</td>
                      <td className="px-4 py-3">{ATTEND_TYPE_LABEL[score.attendType]}</td>
                      <td className="px-4 py-3 text-slate">{score.note ?? "-"}</td>
                      <td className="px-4 py-3">{SCORE_SOURCE_LABEL[score.sourceType]}</td>
                      {canEdit ? (
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => startEdit(score)}
                            className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                          >
                            정정
                          </button>
                        </td>
                      ) : null}
                    </>
                  )}
                </tr>
              );
            })}
            {student.scores.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 11 : 10} className="px-4 py-8 text-center text-slate">
                  입력된 성적이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <p className="mt-4 text-xs leading-6 text-slate">
          정정 저장 후 학생의 현재 상태와 주차별 경고/탈락 이력이 자동으로 다시 계산됩니다.
        </p>
      ) : null}
    </div>
  );
}
