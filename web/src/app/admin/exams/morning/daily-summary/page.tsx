import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL, ATTEND_TYPE_LABEL } from "@/lib/constants";
import { PrintButton } from "./print-button";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function formatDateKR(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function toLocalDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

export default async function DailySummaryPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);
  const prisma = getPrisma();

  const resolvedParams = searchParams ? await searchParams : {};

  const dateParam = Array.isArray(resolvedParams.date)
    ? resolvedParams.date[0]
    : resolvedParams.date;

  let selectedDate: Date;
  if (dateParam) {
    const parsed = toLocalDate(dateParam);
    selectedDate = isNaN(parsed.getTime()) ? new Date() : parsed;
  } else {
    selectedDate = new Date();
  }

  // Normalize to start/end of day
  const dayStart = new Date(selectedDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(selectedDate);
  dayEnd.setHours(23, 59, 59, 999);

  // Load sessions for the selected date
  const sessions = await prisma.examSession.findMany({
    where: {
      examDate: { gte: dayStart, lte: dayEnd },
      isCancelled: false,
    },
    select: {
      id: true,
      subject: true,
      displaySubjectName: true,
      examDate: true,
      examType: true,
      week: true,
      scores: {
        select: {
          examNumber: true,
          finalScore: true,
          rawScore: true,
          attendType: true,
        },
      },
    },
    orderBy: [{ examDate: "asc" }, { subject: "asc" }],
  });

  const validAttendTypes: AttendType[] = [AttendType.NORMAL, AttendType.LIVE];
  const absentTypes: AttendType[] = [AttendType.ABSENT, AttendType.EXCUSED];

  // Per-session stats
  type SessionRow = {
    id: number;
    subject: string;
    displaySubjectName: string | null;
    examDate: Date;
    examType: string;
    week: number;
    totalScored: number;
    totalEnrolled: number;
    presentCount: number;
    absentCount: number;
    avgScore: number | null;
    attendDist: Record<AttendType, number>;
  };

  const sessionRows: SessionRow[] = sessions.map((s) => {
    const totalEnrolled = s.scores.length;
    const scored = s.scores.filter(
      (sc) => sc.finalScore !== null || sc.rawScore !== null,
    );
    const present = s.scores.filter((sc) =>
      validAttendTypes.includes(sc.attendType),
    );
    const absent = s.scores.filter((sc) =>
      absentTypes.includes(sc.attendType),
    );

    const presentWithScore = present.filter(
      (sc) => (sc.finalScore ?? sc.rawScore) !== null,
    );
    const scoreValues = presentWithScore.map(
      (sc) => sc.finalScore ?? sc.rawScore ?? 0,
    );
    const avgScore =
      scoreValues.length > 0
        ? Math.round(
            (scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) * 10,
          ) / 10
        : null;

    const attendDist = {} as Record<AttendType, number>;
    for (const type of Object.values(AttendType)) {
      attendDist[type] = s.scores.filter((sc) => sc.attendType === type).length;
    }

    return {
      id: s.id,
      subject: s.subject,
      displaySubjectName: s.displaySubjectName,
      examDate: s.examDate,
      examType: s.examType,
      week: s.week,
      totalScored: scored.length,
      totalEnrolled,
      presentCount: present.length,
      absentCount: absent.length,
      avgScore,
      attendDist,
    };
  });

  // KPI totals
  const totalSessions = sessionRows.length;
  const totalEnrolled = sessionRows.reduce((a, r) => a + r.totalEnrolled, 0);
  const totalScored = sessionRows.reduce((a, r) => a + r.totalScored, 0);
  const totalAbsent = sessionRows.reduce((a, r) => a + r.absentCount, 0);
  const completionRate =
    totalEnrolled > 0
      ? Math.round((totalScored / totalEnrolled) * 1000) / 10
      : 0;

  const allScores = sessionRows.flatMap((r) => {
    const s = sessions.find((s) => s.id === r.id)!;
    return s.scores
      .filter((sc) => validAttendTypes.includes(sc.attendType))
      .map((sc) => sc.finalScore ?? sc.rawScore)
      .filter((v): v is number => v !== null && v !== undefined);
  });
  const overallAvg =
    allScores.length > 0
      ? Math.round(
          (allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10,
        ) / 10
      : null;

  const dateLabel = formatDateKR(selectedDate);
  const selectedIso = isoDate(selectedDate);

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            아침 모의고사
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">
            일일 성적 현황 보고
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-8 text-slate">
            선택한 날짜의 전체 시험 회차 성적 현황을 확인하고 인쇄합니다.
          </p>
        </div>
        <PrintButton />
      </div>

      {/* Date Selector */}
      <form method="get" className="mt-8 print:hidden">
        <div className="flex flex-wrap items-end gap-3 rounded-[28px] border border-ink/10 bg-mist p-6">
          <div>
            <label
              htmlFor="date"
              className="mb-2 block text-sm font-medium text-ink"
            >
              날짜 선택
            </label>
            <input
              type="date"
              id="date"
              name="date"
              defaultValue={selectedIso}
              className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
        </div>
      </form>

      {/* Printable Area */}
      <div className="mt-8 space-y-8">
        {/* Print Header */}
        <div className="hidden print:block">
          <h2 className="text-2xl font-bold text-ink">
            일일 성적 현황 보고 — {dateLabel}
          </h2>
          <p className="mt-1 text-sm text-slate">한국경찰학원</p>
          <hr className="mt-4 border-ink/10" />
        </div>

        {/* Date badge */}
        <div className="flex items-center gap-3 print:hidden">
          <span className="rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-semibold text-ink">
            {dateLabel}
          </span>
          {sessions.length === 0 && (
            <span className="text-sm text-slate">
              이 날짜에 등록된 회차가 없습니다.
            </span>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-slate">
            선택한 날짜에 등록된 시험 회차가 없습니다. 다른 날짜를 선택해
            주세요.
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate">
                  총 시험 회차
                </p>
                <p className="mt-3 text-3xl font-bold text-ink">
                  {totalSessions}
                </p>
                <p className="mt-1 text-xs text-slate">개 회차</p>
              </div>
              <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate">
                  성적 입력 완료율
                </p>
                <p
                  className={`mt-3 text-3xl font-bold ${completionRate >= 80 ? "text-forest" : "text-amber-500"}`}
                >
                  {completionRate}%
                </p>
                <p className="mt-1 text-xs text-slate">
                  {totalScored}/{totalEnrolled} 명
                </p>
              </div>
              <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate">
                  평균 점수
                </p>
                {overallAvg !== null ? (
                  <p className="mt-3 text-3xl font-bold text-forest">
                    {overallAvg}점
                  </p>
                ) : (
                  <p className="mt-3 text-3xl font-bold text-ink/25">—</p>
                )}
                <p className="mt-1 text-xs text-slate">전 회차 응시자 통합</p>
              </div>
              <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate">
                  결석 학생 수
                </p>
                <p className="mt-3 text-3xl font-bold text-red-600">
                  {totalAbsent}
                </p>
                <p className="mt-1 text-xs text-slate">무단·공결</p>
              </div>
            </div>

            {/* Score Entry Progress */}
            <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-ink">
                  성적 입력 진행률
                </h2>
                <span className="text-sm text-slate">
                  {totalScored}/{totalEnrolled} 입력 완료
                </span>
              </div>
              <div className="mt-4 h-4 w-full overflow-hidden rounded-full bg-ink/10">
                <div
                  className={`h-full rounded-full transition-all ${completionRate >= 100 ? "bg-forest" : completionRate >= 80 ? "bg-amber-400" : "bg-red-400"}`}
                  style={{ width: `${Math.min(completionRate, 100)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate">
                <span>0%</span>
                <span className="font-semibold text-ink">{completionRate}%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Per-session Table */}
            <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
              <div className="border-b border-ink/10 px-6 py-4">
                <h2 className="text-base font-semibold text-ink">
                  회차별 성적 현황
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 bg-mist">
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">
                        시간
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">
                        과목
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-ink/60">
                        등록
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-ink/60">
                        성적입력
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-ink/60">
                        응시
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-ink/60">
                        결석
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-ink/60">
                        평균
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">
                        출결 분포
                      </th>
                      <th className="px-4 py-3 font-semibold text-ink/60" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {sessionRows.map((row) => {
                      const subjectLabel =
                        row.displaySubjectName?.trim() ||
                        SUBJECT_LABEL[row.subject as keyof typeof SUBJECT_LABEL] ||
                        row.subject;
                      const sessionCompletion =
                        row.totalEnrolled > 0
                          ? Math.round(
                              (row.totalScored / row.totalEnrolled) * 1000,
                            ) / 10
                          : 0;
                      const timeStr = row.examDate.toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                        timeZone: "Asia/Seoul",
                      });
                      return (
                        <tr key={row.id} className="hover:bg-mist/60">
                          <td className="px-4 py-3 font-mono text-slate">
                            {timeStr}
                          </td>
                          <td className="px-4 py-3 font-medium text-ink">
                            {subjectLabel}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-ink">
                            {row.totalEnrolled}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`font-mono font-semibold ${sessionCompletion >= 100 ? "text-forest" : sessionCompletion >= 80 ? "text-amber-500" : "text-red-500"}`}
                            >
                              {row.totalScored}
                            </span>
                            <span className="ml-1 text-xs text-slate">
                              ({sessionCompletion}%)
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-forest">
                            {row.presentCount}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-red-500">
                            {row.absentCount}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-ink">
                            {row.avgScore !== null ? `${row.avgScore}점` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {(
                                Object.entries(row.attendDist) as [
                                  AttendType,
                                  number,
                                ][]
                              )
                                .filter(([, count]) => count > 0)
                                .map(([type, count]) => (
                                  <span
                                    key={type}
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                      type === AttendType.NORMAL
                                        ? "bg-forest/10 text-forest"
                                        : type === AttendType.LIVE
                                          ? "bg-blue-100 text-blue-700"
                                          : type === AttendType.EXCUSED
                                            ? "bg-amber-100 text-amber-700"
                                            : "bg-red-100 text-red-700"
                                    }`}
                                  >
                                    {ATTEND_TYPE_LABEL[type]} {count}
                                  </span>
                                ))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/admin/exams/morning/sessions/${row.id}`}
                              className="whitespace-nowrap rounded-full border border-forest/20 px-3 py-1 text-xs font-semibold text-forest hover:bg-forest/5 print:hidden"
                            >
                              회차 상세
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick Links to Score Entry */}
            <div className="rounded-[28px] border border-ink/10 bg-mist p-6">
              <h2 className="text-sm font-semibold text-ink">빠른 성적 입력</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {sessionRows.map((row) => {
                  const subjectLabel =
                    row.displaySubjectName?.trim() ||
                    SUBJECT_LABEL[row.subject as keyof typeof SUBJECT_LABEL] ||
                    row.subject;
                  const isComplete =
                    row.totalEnrolled > 0 &&
                    row.totalScored >= row.totalEnrolled;
                  return (
                    <Link
                      key={row.id}
                      href={`/admin/exams/morning/scores?sessionId=${row.id}`}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition print:hidden ${
                        isComplete
                          ? "border-forest/20 bg-forest/5 text-forest"
                          : "border-ember/20 bg-ember/5 text-ember hover:bg-ember/10"
                      }`}
                    >
                      {subjectLabel}
                      {isComplete ? (
                        <span className="text-xs">완료</span>
                      ) : (
                        <span className="text-xs text-amber-600">
                          {row.totalScored}/{row.totalEnrolled}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
