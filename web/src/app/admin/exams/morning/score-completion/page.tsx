import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL } from "@/lib/constants";
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

const DAYS_OPTIONS = [7, 14, 30] as const;
type DaysOption = (typeof DAYS_OPTIONS)[number];

export default async function ScoreCompletionPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);
  const prisma = getPrisma();

  const resolvedParams = searchParams ? await searchParams : {};

  const daysParam = Array.isArray(resolvedParams.days)
    ? resolvedParams.days[0]
    : resolvedParams.days;

  const days: DaysOption = DAYS_OPTIONS.includes(
    Number(daysParam) as DaysOption,
  )
    ? (Number(daysParam) as DaysOption)
    : 14;

  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setDate(rangeStart.getDate() - days);
  rangeStart.setHours(0, 0, 0, 0);

  // Load all sessions in range with their scores
  const sessions = await prisma.examSession.findMany({
    where: {
      examDate: { gte: rangeStart, lte: now },
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

  type CompletionRow = {
    sessionId: number;
    examDate: Date;
    subject: string;
    displaySubjectName: string | null;
    week: number;
    expectedCount: number;
    enteredCount: number;
    completionRate: number;
    status: "complete" | "partial" | "incomplete";
  };

  const rows: CompletionRow[] = sessions.map((s) => {
    const expectedCount = s.scores.length;
    // Only count scores where student was present and has a score value entered
    const enteredCount = s.scores.filter(
      (sc) =>
        validAttendTypes.includes(sc.attendType) &&
        (sc.finalScore !== null || sc.rawScore !== null),
    ).length;

    // Also count excused/absent as "processed" for completion purposes
    const processedCount = s.scores.filter(
      (sc) =>
        sc.attendType !== null &&
        (sc.attendType === AttendType.ABSENT ||
          sc.attendType === AttendType.EXCUSED ||
          ((sc.finalScore !== null || sc.rawScore !== null) &&
            validAttendTypes.includes(sc.attendType))),
    ).length;

    const completionRate =
      expectedCount > 0
        ? Math.round((processedCount / expectedCount) * 1000) / 10
        : 100;

    const status: "complete" | "partial" | "incomplete" =
      completionRate >= 100
        ? "complete"
        : completionRate >= 80
          ? "partial"
          : "incomplete";

    return {
      sessionId: s.id,
      examDate: s.examDate,
      subject: s.subject,
      displaySubjectName: s.displaySubjectName,
      week: s.week,
      expectedCount,
      enteredCount: processedCount,
      completionRate,
      status,
    };
  });

  // Sort: worst first (ascending completion rate), then by date
  rows.sort((a, b) => {
    if (a.completionRate !== b.completionRate) {
      return a.completionRate - b.completionRate;
    }
    return a.examDate.getTime() - b.examDate.getTime();
  });

  // KPI counts
  const totalSessions = rows.length;
  const completeCount = rows.filter((r) => r.status === "complete").length;
  const incompleteCount = rows.filter((r) => r.status === "incomplete").length;
  const avgCompletion =
    rows.length > 0
      ? Math.round(
          (rows.reduce((a, r) => a + r.completionRate, 0) / rows.length) * 10,
        ) / 10
      : 0;

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            아침 모의고사
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">
            성적 입력 완료 현황
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-8 text-slate">
            최근 기간 내 시험 회차별 성적 입력 완료 여부를 확인합니다.
          </p>
        </div>
      </div>

      {/* Filter */}
      <form method="get" className="mt-8">
        <div className="flex flex-wrap items-end gap-3 rounded-[28px] border border-ink/10 bg-mist p-6">
          <div>
            <p className="mb-2 text-sm font-medium text-ink">기간 필터</p>
            <div className="flex gap-2">
              {DAYS_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="submit"
                  name="days"
                  value={String(d)}
                  className={`rounded-full border px-5 py-2.5 text-sm font-semibold transition ${
                    days === d
                      ? "border-forest bg-forest text-white"
                      : "border-ink/20 bg-white text-ink hover:bg-mist"
                  }`}
                >
                  최근 {d}일
                </button>
              ))}
            </div>
          </div>
        </div>
      </form>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">
            총 회차
          </p>
          <p className="mt-3 text-3xl font-bold text-ink">{totalSessions}</p>
          <p className="mt-1 text-xs text-slate">최근 {days}일</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">
            100% 완료
          </p>
          <p className="mt-3 text-3xl font-bold text-forest">{completeCount}</p>
          <p className="mt-1 text-xs text-slate">완전 입력 완료</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">
            미완료
          </p>
          <p className="mt-3 text-3xl font-bold text-red-600">
            {incompleteCount}
          </p>
          <p className="mt-1 text-xs text-slate">80% 미만</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">
            평균 완료율
          </p>
          <p
            className={`mt-3 text-3xl font-bold ${avgCompletion >= 80 ? "text-forest" : "text-amber-500"}`}
          >
            {avgCompletion}%
          </p>
          <p className="mt-1 text-xs text-slate">전 회차 평균</p>
        </div>
      </div>

      {/* Table */}
      <div className="mt-8 overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">회차별 완료 현황</h2>
          <p className="text-xs text-slate">
            완료율 낮은 순으로 정렬 (미입력 우선)
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate">
            최근 {days}일 내 등록된 시험 회차가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-4 py-3 text-left font-semibold text-ink/60">
                    날짜
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-ink/60">
                    과목
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-ink/60">
                    예상 인원
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-ink/60">
                    입력 인원
                  </th>
                  <th className="px-4 py-3 font-semibold text-ink/60">
                    완료율
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-ink/60">
                    상태
                  </th>
                  <th className="px-4 py-3 font-semibold text-ink/60" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {rows.map((row) => {
                  const subjectLabel =
                    row.displaySubjectName?.trim() ||
                    SUBJECT_LABEL[row.subject as keyof typeof SUBJECT_LABEL] ||
                    row.subject;
                  return (
                    <tr key={row.sessionId} className="hover:bg-mist/60">
                      <td className="px-4 py-3 font-mono text-slate">
                        {formatDateKR(row.examDate)}
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">
                        {subjectLabel}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink">
                        {row.expectedCount}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink">
                        {row.enteredCount}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-ink/10">
                            <div
                              className={`h-full rounded-full ${
                                row.status === "complete"
                                  ? "bg-forest"
                                  : row.status === "partial"
                                    ? "bg-amber-400"
                                    : "bg-red-400"
                              }`}
                              style={{
                                width: `${Math.min(row.completionRate, 100)}%`,
                              }}
                            />
                          </div>
                          <span
                            className={`text-xs font-mono font-semibold ${
                              row.status === "complete"
                                ? "text-forest"
                                : row.status === "partial"
                                  ? "text-amber-600"
                                  : "text-red-600"
                            }`}
                          >
                            {row.completionRate}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            row.status === "complete"
                              ? "bg-forest/10 text-forest"
                              : row.status === "partial"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {row.status === "complete"
                            ? "완료"
                            : row.status === "partial"
                              ? "일부 미입력"
                              : "미완료"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row.status !== "complete" && (
                          <Link
                            href={`/admin/exams/morning/scores?sessionId=${row.sessionId}`}
                            className="whitespace-nowrap rounded-full border border-ember/20 bg-ember/5 px-3 py-1 text-xs font-semibold text-ember hover:bg-ember/10 transition"
                          >
                            성적 입력하기
                          </Link>
                        )}
                        {row.status === "complete" && (
                          <Link
                            href={`/admin/exams/morning/sessions/${row.sessionId}`}
                            className="whitespace-nowrap rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-slate hover:bg-mist transition"
                          >
                            회차 상세
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary Footer */}
      {rows.length > 0 && (
        <div className="mt-6 rounded-[28px] border border-ink/10 bg-mist p-6">
          <p className="text-xs text-slate">
            조회 기간:{" "}
            <span className="font-semibold text-ink">
              {formatDateKR(rangeStart)} ~ {formatDateKR(now)}
            </span>
            &nbsp;·&nbsp; 총{" "}
            <span className="font-semibold text-ink">{totalSessions}</span>개
            회차 &nbsp;·&nbsp; 완료{" "}
            <span className="font-semibold text-forest">{completeCount}</span>개
            &nbsp;·&nbsp; 미완료{" "}
            <span className="font-semibold text-red-600">{incompleteCount}</span>
            개
          </p>
        </div>
      )}
    </div>
  );
}
