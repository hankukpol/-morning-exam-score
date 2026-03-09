"use client";

import { AttendType, Subject } from "@/generated/prisma";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  ATTEND_TYPE_LABEL,
  EXAM_TYPE_LABEL,
  SUBJECT_LABEL,
} from "@/lib/constants";
import { useState, useTransition, useMemo } from "react";

type SessionOption = {
  id: number;
  examType: "GONGCHAE" | "GYEONGCHAE";
  week: number;
  subject: Subject;
  examDate: string;
  isCancelled: boolean;
};

type PeriodOption = {
  id: number;
  name: string;
  isActive: boolean;
  sessions: SessionOption[];
};

type ScoreRow = {
  id: number;
  examNumber: string;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
  attendType: AttendType;
  note: string | null;
  sourceType: string;
  student: {
    name: string;
    examType: string;
  } | null;
};

type EditDraft = {
  rawScore: string;
  oxScore: string;
  attendType: AttendType;
  note: string;
};

type ScoreEditPanelProps = {
  periods: PeriodOption[];
};

const MONTH_NAMES = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

export function ScoreEditPanel({ periods }: ScoreEditPanelProps) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string | null>(null); // YYYY-MM-DD
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [scores, setScores] = useState<ScoreRow[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, EditDraft>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  // Build date → sessions map from all periods
  const sessionsByDate = useMemo(() => {
    const map: Record<string, (SessionOption & { periodName: string })[]> = {};
    for (const period of periods) {
      for (const session of period.sessions) {
        const key = session.examDate.slice(0, 10); // YYYY-MM-DD
        if (!map[key]) map[key] = [];
        map[key].push({ ...session, periodName: period.name });
      }
    }
    return map;
  }, [periods]);

  // Calendar grid values
  const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const totalCells = Math.ceil((firstDayOfMonth + daysInMonth) / 7) * 7;

  function prevMonth() {
    if (calendarMonth === 0) {
      setCalendarYear((y) => y - 1);
      setCalendarMonth(11);
    } else {
      setCalendarMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (calendarMonth === 11) {
      setCalendarYear((y) => y + 1);
      setCalendarMonth(0);
    } else {
      setCalendarMonth((m) => m + 1);
    }
  }

  function goToToday() {
    setCalendarYear(today.getFullYear());
    setCalendarMonth(today.getMonth());
  }

  function handleDateClick(dateStr: string) {
    const sessions = sessionsByDate[dateStr];
    if (!sessions || sessions.length === 0) return;

    setSelectedDate(dateStr);
    setScores(null);
    setNotice(null);
    setErrorMessage(null);

    // Auto-select if only one session
    if (sessions.length === 1) {
      setSelectedSessionId(String(sessions[0].id));
    } else {
      setSelectedSessionId("");
    }
  }

  // Sessions for the selected date
  const sessionsForSelectedDate = selectedDate
    ? (sessionsByDate[selectedDate] ?? [])
    : [];

  // Format date for display: "2026-03-08" → "3월 8일 (토)"
  function formatKoreanDate(dateStr: string) {
    const d = new Date(dateStr + "T00:00:00");
    const day = DAY_NAMES[d.getDay()];
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${day})`;
  }

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

  function search() {
    if (!selectedSessionId) {
      setMessage(null, "날짜와 회차를 선택하세요.");
      return;
    }

    setMessage(null, null);

    startTransition(async () => {
      try {
        const params = new URLSearchParams({ sessionId: selectedSessionId });
        if (searchQuery.trim()) {
          params.set("query", searchQuery.trim());
        }
        const result = await requestJson(`/api/scores?${params}`);
        setScores(result.scores);
        setEditingId(null);
        setDrafts({});
        if (result.scores.length === 0) {
          setMessage("조회된 성적이 없습니다.", null);
        }
      } catch (error) {
        setMessage(
          null,
          error instanceof Error ? error.message : "조회에 실패했습니다.",
        );
      }
    });
  }

  function startEdit(score: ScoreRow) {
    setEditingId(score.id);
    setDrafts((current) => ({
      ...current,
      [score.id]: {
        rawScore: score.rawScore?.toString() ?? "",
        oxScore: score.oxScore?.toString() ?? "",
        attendType: score.attendType,
        note: score.note ?? "",
      },
    }));
  }

  function getDraft(scoreId: number): EditDraft {
    return (
      drafts[scoreId] ?? {
        rawScore: "",
        oxScore: "",
        attendType: AttendType.NORMAL,
        note: "",
      }
    );
  }

  function patchDraft(scoreId: number, patch: Partial<EditDraft>) {
    setDrafts((current) => ({
      ...current,
      [scoreId]: { ...getDraft(scoreId), ...patch },
    }));
  }

  function saveScore(scoreId: number) {
    const draft = getDraft(scoreId);

    startTransition(async () => {
      try {
        await requestJson(`/api/scores/${scoreId}`, {
          method: "PUT",
          body: JSON.stringify({
            rawScore: draft.rawScore === "" ? null : Number(draft.rawScore),
            oxScore: draft.oxScore === "" ? null : Number(draft.oxScore),
            attendType: draft.attendType,
            note: draft.note || null,
          }),
        });
        setMessage("성적을 저장했습니다.", null);
        setEditingId(null);
        if (selectedSessionId) {
          const params = new URLSearchParams({ sessionId: selectedSessionId });
          if (searchQuery.trim())
            params.set("query", searchQuery.trim());
          const result = await requestJson(`/api/scores?${params}`);
          setScores(result.scores);
        }
      } catch (error) {
        setMessage(
          null,
          error instanceof Error ? error.message : "저장에 실패했습니다.",
        );
      }
    });
  }

  function deleteScore(scoreId: number) {
    if (
      !window.confirm(
        "이 성적을 삭제하시겠습니까? 삭제 후 석차와 통계가 재계산됩니다.",
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        await requestJson(`/api/scores/${scoreId}`, { method: "DELETE" });
        setMessage("성적을 삭제했습니다.", null);
        setScores(
          (current) => current?.filter((s) => s.id !== scoreId) ?? null,
        );
        if (editingId === scoreId) setEditingId(null);
      } catch (error) {
        setMessage(
          null,
          error instanceof Error ? error.message : "삭제에 실패했습니다.",
        );
      }
    });
  }

  const totalPages = Math.max(1, Math.ceil((scores?.length ?? 0) / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedScores =
    scores?.slice((currentPage - 1) * pageSize, currentPage * pageSize) ?? [];

  return (
    <div className="space-y-8">
      {/* 캘린더 검색 */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">시험 날짜 선택</h2>
        <p className="mt-2 text-sm leading-7 text-slate">
          달력에서 시험 날짜를 클릭하여 회차를 선택합니다. 시험이 있는 날짜는
          색상으로 표시됩니다.
        </p>

        {/* 월 탐색 */}
        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={prevMonth}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-sm font-semibold transition hover:border-ink/30 hover:bg-mist"
            aria-label="이전 달"
          >
            ‹
          </button>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold">
              {calendarYear}년 {MONTH_NAMES[calendarMonth]}
            </span>
            <button
              type="button"
              onClick={goToToday}
              className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              오늘
            </button>
          </div>
          <button
            type="button"
            onClick={nextMonth}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-sm font-semibold transition hover:border-ink/30 hover:bg-mist"
            aria-label="다음 달"
          >
            ›
          </button>
        </div>

        {/* 캘린더 그리드 */}
        <div className="mt-4">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 text-center">
            {DAY_NAMES.map((day, i) => (
              <div
                key={day}
                className={`py-2 text-xs font-semibold ${i === 0
                  ? "text-red-500"
                  : i === 6
                    ? "text-blue-500"
                    : "text-slate"
                  }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* 날짜 셀 */}
          <div className="grid grid-cols-7 gap-y-1 mt-2">
            {Array.from({ length: totalCells }).map((_, cellIndex) => {
              const dayNum = cellIndex - firstDayOfMonth + 1;
              if (dayNum < 1 || dayNum > daysInMonth) {
                return (
                  <div
                    key={cellIndex}
                    className="h-16 border border-slate-200 bg-mist/20"
                  />
                );
              }

              const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const sessions = sessionsByDate[dateStr] ?? [];
              const hasSession = sessions.length > 0;
              const hasActiveSessions = sessions.some((s) => !s.isCancelled);
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const dayOfWeek = (firstDayOfMonth + dayNum - 1) % 7;
              const isSunday = dayOfWeek === 0;
              const isSaturday = dayOfWeek === 6;

              return (
                <button
                  key={cellIndex}
                  type="button"
                  onClick={() => handleDateClick(dateStr)}
                  disabled={!hasSession}
                  className={[
                    "relative flex h-16 flex-col items-center justify-center rounded-none border border-slate-200 text-sm transition",
                    isSelected
                      ? "bg-ember text-white font-semibold border-ember"
                      : isToday
                        ? "border-ember/40 font-semibold bg-white"
                        : "bg-white",
                    hasSession && !isSelected
                      ? "cursor-pointer hover:bg-ember/5 hover:border-ember/20"
                      : "",
                    !hasSession ? "cursor-default text-ink/30" : "",
                    !isSelected && isSunday && hasSession ? "text-red-500" : "",
                    !isSelected && isSaturday && hasSession
                      ? "text-blue-500"
                      : "",
                    !isSelected && !isSunday && !isSaturday && hasSession
                      ? "text-ink"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span>{dayNum}</span>
                  {/* 시험 표시 점 */}
                  {hasSession && (
                    <span className="mt-0.5 flex gap-0.5">
                      {sessions.slice(0, 3).map((s, i) => (
                        <span
                          key={i}
                          className={`h-1.5 w-1.5 rounded-full ${isSelected
                            ? "bg-white/80"
                            : s.isCancelled
                              ? "bg-ink/20"
                              : hasActiveSessions
                                ? "bg-ember"
                                : "bg-ink/20"
                            }`}
                        />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 범례 */}
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ember" />
            시험 있음
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ink/20" />
            취소된 시험
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-ember/40 text-[10px] font-semibold">
              오
            </span>
            오늘
          </span>
        </div>

        {/* 선택된 날짜의 회차 목록 */}
        {selectedDate && sessionsForSelectedDate.length > 0 && (
          <div className="mt-6 border-t border-ink/10 pt-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-ink">
                {formatKoreanDate(selectedDate)} 시험
              </span>
              <div className="flex flex-wrap gap-2">
                {sessionsForSelectedDate.map((session) => {
                  const isActive = String(session.id) === selectedSessionId;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => {
                        setSelectedSessionId(String(session.id));
                        setScores(null);
                      }}
                      className={[
                        "rounded-full border px-4 py-2 text-sm font-semibold transition",
                        isActive
                          ? "border-ember bg-ember text-white"
                          : "border-ink/10 hover:border-ember/30 hover:text-ember",
                        session.isCancelled ? "line-through opacity-50" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {session.week}주차 · {EXAM_TYPE_LABEL[session.examType]} ·{" "}
                      {SUBJECT_LABEL[session.subject]}
                      {session.isCancelled ? " [취소]" : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 수험번호 검색 + 조회 버튼 */}
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  이름 또는 수험번호 검색 (선택)
                </label>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="이름 또는 수험번호 일부 입력"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") search();
                  }}
                  className="w-56 rounded-2xl border border-ink/10 px-4 py-2.5 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={search}
                disabled={isPending || !selectedSessionId}
                className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
              >
                {isPending ? "조회 중..." : "성적 조회"}
              </button>
            </div>
          </div>
        )}

        {/* 날짜를 선택하지 않았을 때 안내 */}
        {!selectedDate && (
          <div className="mt-6 rounded-2xl border border-dashed border-ink/15 px-5 py-8 text-center text-sm text-slate">
            달력에서 시험 날짜를 선택해 주세요.
          </div>
        )}
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

      {/* 성적 목록 */}
      {scores !== null && scores.length > 0 ? (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">
              성적 목록{" "}
              <span className="text-sm font-normal text-slate">
                ({scores.length}건)
              </span>
            </h2>
          </div>
          <div className="mt-4 overflow-hidden rounded-[24px] border border-ink/10">
            <PaginationControls
              totalCount={scores.length}
              page={currentPage}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
              itemLabel="건"
            />
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">수험번호 / 이름</th>
                    <th className="px-4 py-3 font-semibold">원점수</th>
                    <th className="px-4 py-3 font-semibold">OX</th>
                    <th className="px-4 py-3 font-semibold">최종</th>
                    <th className="px-4 py-3 font-semibold">응시 유형</th>
                    <th className="px-4 py-3 font-semibold">메모</th>
                    <th className="px-4 py-3 font-semibold">동작</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {pagedScores.map((score) => {
                    const isEditing = editingId === score.id;
                    const draft = getDraft(score.id);

                    return (
                      <tr
                        key={score.id}
                        className={isEditing ? "bg-amber-50/40" : ""}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium">{score.student?.name ?? "-"}</div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="font-mono text-xs text-slate">{score.examNumber}</span>
                            {score.student?.examType ? (
                              <span className="rounded-full bg-ink/5 px-1.5 py-0.5 text-[10px] font-semibold text-slate">
                                {EXAM_TYPE_LABEL[score.student.examType as "GONGCHAE" | "GYEONGCHAE"]}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        {isEditing ? (
                          <>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                value={draft.rawScore}
                                onChange={(event) =>
                                  patchDraft(score.id, {
                                    rawScore: event.target.value,
                                  })
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
                                  patchDraft(score.id, {
                                    oxScore: event.target.value,
                                  })
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
                                    attendType:
                                      event.target.value as AttendType,
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
                                  patchDraft(score.id, {
                                    note: event.target.value,
                                  })
                                }
                                className="w-32 rounded-xl border border-ink/10 px-2 py-1 text-sm"
                                placeholder="메모"
                              />
                            </td>
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
                            <td className="px-4 py-3">
                              {score.rawScore ?? (
                                <span className="text-slate">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {score.oxScore ?? (
                                <span className="text-slate">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {score.finalScore ?? (
                                <span className="text-slate">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {ATTEND_TYPE_LABEL[score.attendType]}
                            </td>
                            <td className="px-4 py-3 text-slate">
                              {score.note ? (
                                <span
                                  className="block max-w-[120px] truncate"
                                  title={score.note}
                                >
                                  {score.note}
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => startEdit(score)}
                                className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                              >
                                수정
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}