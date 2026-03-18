"use client";

import { useState, useMemo, useCallback } from "react";
import { AttendType } from "@prisma/client";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";

// ─── Types ───────────────────────────────────────────────────────────────────

type SessionOption = {
  id: number;
  examType: string;
  week: number;
  subject: string;
  displaySubjectName: string | null;
  examDate: string; // ISO string
  isCancelled: boolean;
  isLocked: boolean;
  periodName: string;
};

type StudentRow = {
  examNumber: string;
  name: string;
};

type ScoreEntry = {
  score: string; // raw string input
  absent: boolean;
};

type SubmitResult = {
  ok: boolean;
  message: string;
};

type Props = {
  sessions: SessionOption[];
  students: StudentRow[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"] as const;
  return `${d.getFullYear()}.${month}.${day}(${weekdays[d.getDay()]})`;
}

function getSubjectLabel(subject: string, displaySubjectName: string | null): string {
  const normalized = displaySubjectName?.trim();
  if (normalized) return normalized;
  return SUBJECT_LABEL[subject as keyof typeof SUBJECT_LABEL] ?? subject;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function QuickEntryForm({ sessions, students }: Props) {
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
    sessions.length > 0 ? sessions[0].id : null,
  );
  const [entries, setEntries] = useState<Record<string, ScoreEntry>>(() =>
    Object.fromEntries(
      students.map((s) => [s.examNumber, { score: "", absent: false }]),
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );

  // ── Derived stats ─────────────────────────────────────────────────────────
  const { presentCount, absentCount, avgScore } = useMemo(() => {
    let present = 0;
    let absent = 0;
    let sum = 0;
    let count = 0;
    for (const en of Object.values(entries)) {
      if (en.absent) {
        absent++;
      } else {
        present++;
        const v = parseFloat(en.score);
        if (!isNaN(v)) {
          sum += v;
          count++;
        }
      }
    }
    return {
      presentCount: present,
      absentCount: absent,
      avgScore: count > 0 ? Math.round((sum / count) * 10) / 10 : null,
    };
  }, [entries]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleScoreChange = useCallback(
    (examNumber: string, value: string) => {
      setEntries((prev) => ({
        ...prev,
        [examNumber]: { ...prev[examNumber], score: value },
      }));
    },
    [],
  );

  const handleAbsentChange = useCallback(
    (examNumber: string, checked: boolean) => {
      setEntries((prev) => ({
        ...prev,
        [examNumber]: { ...prev[examNumber], absent: checked, score: checked ? "" : prev[examNumber].score },
      }));
    },
    [],
  );

  const handleMarkAllAbsent = useCallback(() => {
    setEntries((prev) => {
      const next: Record<string, ScoreEntry> = {};
      for (const [k] of Object.entries(prev)) {
        next[k] = { score: "", absent: true };
      }
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setEntries(
      Object.fromEntries(
        students.map((s) => [s.examNumber, { score: "", absent: false }]),
      ),
    );
    setResult(null);
  }, [students]);

  const handleSubmit = useCallback(async () => {
    if (!selectedSession) {
      setResult({ ok: false, message: "회차를 선택해 주세요." });
      return;
    }
    if (selectedSession.isLocked) {
      setResult({ ok: false, message: "잠금된 회차입니다. 수정할 수 없습니다." });
      return;
    }

    // Build paste-format text: "학번\t이름\t점수" or absent marker
    const lines: string[] = [];
    for (const student of students) {
      const entry = entries[student.examNumber];
      if (!entry) continue;
      if (entry.absent) {
        lines.push(`${student.examNumber}\t${student.name}\t결석`);
      } else {
        const score = entry.score.trim();
        if (score === "") continue; // skip blank (not submitted)
        lines.push(`${student.examNumber}\t${student.name}\t${score}`);
      }
    }

    if (lines.length === 0) {
      setResult({ ok: false, message: "입력된 점수가 없습니다." });
      return;
    }

    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch("/api/scores/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "execute",
          sessionId: selectedSession.id,
          text: lines.join("\n"),
          attendType: AttendType.NORMAL,
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        inserted?: number;
        updated?: number;
        skipped?: number;
      };

      if (!res.ok || data.error) {
        setResult({ ok: false, message: data.error ?? "성적 저장에 실패했습니다." });
      } else {
        const inserted = data.inserted ?? 0;
        const updated = data.updated ?? 0;
        setResult({
          ok: true,
          message: `저장 완료: 신규 ${inserted}건, 수정 ${updated}건`,
        });
      }
    } catch {
      setResult({ ok: false, message: "네트워크 오류가 발생했습니다." });
    } finally {
      setSubmitting(false);
    }
  }, [selectedSession, students, entries]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Session selector */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-base font-semibold text-ink">회차 선택</h2>
        <div className="mt-4">
          {sessions.length === 0 ? (
            <p className="text-sm text-slate">등록된 회차가 없습니다.</p>
          ) : (
            <select
              value={selectedSessionId ?? ""}
              onChange={(e) => {
                const id = parseInt(e.target.value, 10);
                setSelectedSessionId(isNaN(id) ? null : id);
                setResult(null);
              }}
              className="w-full max-w-xl rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id} disabled={s.isCancelled || s.isLocked}>
                  [{s.periodName}] {s.week}주차 — {formatDate(s.examDate)} —{" "}
                  {EXAM_TYPE_LABEL[s.examType as keyof typeof EXAM_TYPE_LABEL] ?? s.examType} ·{" "}
                  {getSubjectLabel(s.subject, s.displaySubjectName)}
                  {s.isCancelled ? " [취소]" : ""}
                  {s.isLocked ? " [잠금]" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Selected session info */}
        {selectedSession && (
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
              {formatDate(selectedSession.examDate)}
            </span>
            <span className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-ink">
              {selectedSession.week}주차
            </span>
            <span className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-ink">
              {EXAM_TYPE_LABEL[selectedSession.examType as keyof typeof EXAM_TYPE_LABEL] ?? selectedSession.examType}
            </span>
            <span className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-ink">
              {getSubjectLabel(selectedSession.subject, selectedSession.displaySubjectName)}
            </span>
            {selectedSession.isLocked && (
              <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
                잠금됨
              </span>
            )}
          </div>
        )}
      </section>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleMarkAllAbsent}
          className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
        >
          전체 결석
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/30"
        >
          초기화
        </button>

        {/* Live stats */}
        <div className="ml-auto flex flex-wrap items-center gap-4 text-sm text-slate">
          <span>
            응시:{" "}
            <span className="font-semibold text-ink">{presentCount}</span>
          </span>
          <span>
            결석:{" "}
            <span className="font-semibold text-red-600">{absentCount}</span>
          </span>
          <span>
            평균:{" "}
            <span className="font-semibold text-ink">
              {avgScore !== null ? `${avgScore}점` : "—"}
            </span>
          </span>
        </div>
      </div>

      {/* Score grid */}
      <section className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
        <div className="border-b border-ink/10 bg-mist px-6 py-4">
          <h2 className="text-sm font-semibold text-ink">
            수강생 점수 입력{" "}
            <span className="ml-1 font-normal text-slate">
              (총 {students.length}명)
            </span>
          </h2>
        </div>

        {students.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate">
            현재 수강생이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist/50 text-xs text-slate">
                  <th className="px-4 py-3 text-left font-semibold">학번</th>
                  <th className="px-4 py-3 text-left font-semibold">이름</th>
                  <th className="px-4 py-3 text-center font-semibold w-40">
                    점수
                  </th>
                  <th className="px-4 py-3 text-center font-semibold w-24">
                    결석
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {students.map((student) => {
                  const entry = entries[student.examNumber] ?? {
                    score: "",
                    absent: false,
                  };
                  return (
                    <tr
                      key={student.examNumber}
                      className={`transition ${
                        entry.absent
                          ? "bg-red-50/60 hover:bg-red-50"
                          : "hover:bg-mist/40"
                      }`}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-slate">
                        {student.examNumber}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-ink">
                        {student.name}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          placeholder="—"
                          value={entry.score}
                          disabled={entry.absent}
                          onChange={(e) =>
                            handleScoreChange(student.examNumber, e.target.value)
                          }
                          className="w-28 rounded-xl border border-ink/10 px-3 py-1.5 text-center text-sm font-mono disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-forest/30"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={entry.absent}
                          onChange={(e) =>
                            handleAbsentChange(
                              student.examNumber,
                              e.target.checked,
                            )
                          }
                          className="h-4 w-4 cursor-pointer rounded accent-red-500"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer with average */}
        <div className="flex items-center justify-between border-t border-ink/10 bg-mist/60 px-6 py-4">
          <div className="flex gap-6 text-sm">
            <span>
              응시{" "}
              <span className="font-semibold text-forest">{presentCount}명</span>
            </span>
            <span>
              결석{" "}
              <span className="font-semibold text-red-600">{absentCount}명</span>
            </span>
            <span>
              실시간 평균{" "}
              <span className="font-semibold text-ink">
                {avgScore !== null ? `${avgScore}점` : "—"}
              </span>
            </span>
          </div>
        </div>
      </section>

      {/* Result banner */}
      {result && (
        <div
          className={`rounded-[20px] border p-4 text-sm font-medium ${
            result.ok
              ? "border-forest/30 bg-forest/10 text-forest"
              : "border-red-200 bg-red-50 text-red-600"
          }`}
        >
          {result.message}
        </div>
      )}

      {/* Submit button */}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={submitting || !selectedSession || selectedSession.isLocked}
          onClick={handleSubmit}
          className="inline-flex items-center gap-2 rounded-full bg-ember px-8 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              저장 중...
            </>
          ) : (
            "일괄 저장"
          )}
        </button>
      </div>
    </div>
  );
}
