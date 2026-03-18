import Link from "next/link";
import { AdminRole, ExamEventType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── helpers ──────────────────────────────────────────────────────────────────

function parseMonthParam(raw: string | undefined): { year: number; month: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function padZero(n: number) {
  return String(n).padStart(2, "0");
}

function monthStr(year: number, month: number) {
  return `${year}-${padZero(month)}`;
}

function prevMonth(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function nextMonth(year: number, month: number) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

// ── constants ────────────────────────────────────────────────────────────────

const EXAM_TYPE_LABEL: Record<ExamEventType, string> = {
  MORNING: "아침모의고사",
  MONTHLY: "월말평가",
  SPECIAL: "특강모의고사",
  EXTERNAL: "외부모의고사",
};

// Badge colour classes (bg + text) for each exam event type
const EXAM_TYPE_BADGE: Record<ExamEventType, string> = {
  MORNING: "bg-ember/15 text-ember",
  MONTHLY: "bg-forest/15 text-forest",
  SPECIAL: "bg-blue-100 text-blue-700",
  EXTERNAL: "bg-purple-100 text-purple-700",
};

// Link targets per type
const EXAM_TYPE_HREF: Record<ExamEventType, string> = {
  MORNING: "/admin/exams/morning",
  MONTHLY: "/admin/exams/monthly",
  SPECIAL: "/admin/exams/special",
  EXTERNAL: "/admin/exams/external",
};

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTH_KO = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

// ── page ─────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams?: { month?: string };
};

export default async function AdminCalendarPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { year, month } = parseMonthParam(searchParams?.month);

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999); // last day of month

  const [examEvents, lectureSessions] = await Promise.all([
    getPrisma().examEvent.findMany({
      where: {
        isActive: true,
        examDate: { gte: monthStart, lte: monthEnd },
      },
      select: {
        id: true,
        title: true,
        eventType: true,
        examDate: true,
      },
      orderBy: { examDate: "asc" },
    }),
    getPrisma().lectureSession.findMany({
      where: {
        isCancelled: false,
        sessionDate: { gte: monthStart, lte: monthEnd },
      },
      select: {
        id: true,
        sessionDate: true,
        scheduleId: true,
      },
    }),
  ]);

  // ── group by date key ──────────────────────────────────────────────────────

  // dateKey = "YYYY-MM-DD"
  const examsByDate: Record<string, typeof examEvents> = {};
  for (const ev of examEvents) {
    const d = ev.examDate;
    const key = `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
    if (!examsByDate[key]) examsByDate[key] = [];
    examsByDate[key].push(ev);
  }

  const sessionCountByDate: Record<string, number> = {};
  for (const s of lectureSessions) {
    const d = s.sessionDate;
    const key = `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
    sessionCountByDate[key] = (sessionCountByDate[key] ?? 0) + 1;
  }

  // ── build calendar grid ────────────────────────────────────────────────────

  // Sunday = 0, so we need offset to start grid from Sunday
  const firstDayOfWeek = monthStart.getDay(); // 0 (Sun) – 6 (Sat)
  const daysInMonth = new Date(year, month, 0).getDate();

  // Total cells = pad + days (fill to full weeks)
  const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

  const cells: Array<{ day: number | null; dateKey: string | null }> = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstDayOfWeek + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push({ day: null, dateKey: null });
    } else {
      cells.push({
        day: dayNum,
        dateKey: `${year}-${padZero(month)}-${padZero(dayNum)}`,
      });
    }
  }

  // ── KPI ───────────────────────────────────────────────────────────────────

  const totalExamEvents = examEvents.length;
  const totalLectureSessions = lectureSessions.length;

  // Count by event type for KPI
  const countByType: Partial<Record<ExamEventType, number>> = {};
  for (const ev of examEvents) {
    countByType[ev.eventType] = (countByType[ev.eventType] ?? 0) + 1;
  }

  // ── nav ───────────────────────────────────────────────────────────────────

  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);
  const prevHref = `/admin/calendar?month=${monthStr(prev.year, prev.month)}`;
  const nextHref = `/admin/calendar?month=${monthStr(next.year, next.month)}`;

  // Today's dateKey
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${padZero(today.getMonth() + 1)}-${padZero(today.getDate())}`;

  return (
    <div className="p-8 sm:p-10">
      {/* Page header */}
      <div className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
        일정 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">월간 일정표</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        시험 일정과 강의 세션을 달력 형태로 한눈에 확인합니다.
      </p>

      {/* KPI row */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <article className="col-span-2 rounded-[24px] border border-ink/10 bg-white p-6 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">이번 달 시험</p>
          <p className="mt-3 text-3xl font-semibold text-ink">{totalExamEvents}건</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["MORNING", "MONTHLY", "SPECIAL", "EXTERNAL"] as ExamEventType[]).map((t) =>
              countByType[t] ? (
                <span
                  key={t}
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${EXAM_TYPE_BADGE[t]}`}
                >
                  {EXAM_TYPE_LABEL[t]} {countByType[t]}
                </span>
              ) : null,
            )}
          </div>
        </article>
        <article className="col-span-2 rounded-[24px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">강의 세션</p>
          <p className="mt-3 text-3xl font-semibold text-ink">{totalLectureSessions}회</p>
          <p className="mt-3 text-xs text-slate">취소 제외 / 이번 달 전체</p>
        </article>
      </div>

      {/* Calendar card */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
        {/* Month navigation header */}
        <div className="flex items-center justify-between border-b border-ink/5 px-6 py-4">
          <Link
            href={prevHref}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:bg-mist hover:text-ink"
            aria-label="이전 달"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          <div className="text-center">
            <p className="text-lg font-semibold text-ink">
              {year}년 {MONTH_KO[month - 1]}
            </p>
          </div>

          <Link
            href={nextHref}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:bg-mist hover:text-ink"
            aria-label="다음 달"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7 7 7" />
            </svg>
          </Link>
        </div>

        {/* Weekday header row */}
        <div className="grid grid-cols-7 border-b border-ink/5">
          {WEEKDAY_LABELS.map((label, idx) => (
            <div
              key={label}
              className={`py-2 text-center text-xs font-semibold ${
                idx === 0 ? "text-red-500" : idx === 6 ? "text-blue-500" : "text-slate"
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 divide-x divide-ink/5">
          {cells.map((cell, idx) => {
            const isToday = cell.dateKey === todayKey;
            const exams = cell.dateKey ? (examsByDate[cell.dateKey] ?? []) : [];
            const sessionCount = cell.dateKey ? (sessionCountByDate[cell.dateKey] ?? 0) : 0;
            const colIndex = idx % 7; // 0=Sun, 6=Sat

            return (
              <div
                key={idx}
                className={`min-h-[110px] border-b border-ink/5 p-2 ${
                  cell.day === null ? "bg-mist/40" : "bg-white"
                } ${colIndex === 0 ? "text-red-500" : colIndex === 6 ? "text-blue-500" : ""}`}
              >
                {cell.day !== null && (
                  <>
                    {/* Day number */}
                    <div className="mb-1.5 flex items-center justify-between">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                          isToday
                            ? "bg-ember text-white"
                            : colIndex === 0
                              ? "text-red-500"
                              : colIndex === 6
                                ? "text-blue-500"
                                : "text-ink"
                        }`}
                      >
                        {cell.day}
                      </span>
                    </div>

                    {/* Exam event badges */}
                    <div className="space-y-0.5">
                      {exams.map((ev) => (
                        <Link
                          key={ev.id}
                          href={EXAM_TYPE_HREF[ev.eventType]}
                          title={ev.title}
                          className={`block truncate rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight transition hover:opacity-75 ${EXAM_TYPE_BADGE[ev.eventType]}`}
                        >
                          {ev.title}
                        </Link>
                      ))}

                      {/* Lecture session count badge */}
                      {sessionCount > 0 && (
                        <Link
                          href={`/admin/attendance/lecture`}
                          className="block truncate rounded bg-slate/10 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-slate transition hover:bg-slate/20"
                        >
                          강의 {sessionCount}회
                        </Link>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate font-medium">범례:</span>
        {(["MORNING", "MONTHLY", "SPECIAL", "EXTERNAL"] as ExamEventType[]).map((t) => (
          <span
            key={t}
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${EXAM_TYPE_BADGE[t]}`}
          >
            {EXAM_TYPE_LABEL[t]}
          </span>
        ))}
        <span className="inline-flex rounded-full bg-slate/10 px-2.5 py-0.5 text-xs font-semibold text-slate">
          강의 세션
        </span>
      </div>
    </div>
  );
}
