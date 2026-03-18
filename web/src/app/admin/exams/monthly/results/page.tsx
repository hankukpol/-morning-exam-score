import Link from "next/link";
import { AdminRole, ExamEventType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────────

type ExamSummary = {
  id: string;
  title: string;
  examDate: string;
  participantCount: number;
  avgScore: number | null;
  topScore: number | null;
  passCount: number;
  passRate: number | null;
  totalRegistrations: number;
};

type TopPerformer = {
  examNumber: string;
  name: string;
  avgScore: number;
  examCount: number;
};

type SubjectMonthAvg = {
  subject: string;
  /** eventId → avg */
  byEvent: Record<string, number | null>;
};

type DivisionBreakdown = {
  GONGCHAE_M: number;
  GONGCHAE_F: number;
  GYEONGCHAE: number;
  ONLINE: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

const DIVISION_LABEL: Record<string, string> = {
  GONGCHAE_M: "공채 남자",
  GONGCHAE_F: "공채 여자",
  GYEONGCHAE: "경채",
  ONLINE: "온라인",
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function MonthlyExamResultsPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();
  const now = new Date();
  const filterYear = searchParams.year ? parseInt(searchParams.year, 10) : now.getFullYear();
  const yearStart = new Date(filterYear, 0, 1);
  const yearEnd = new Date(filterYear + 1, 0, 1);

  // ── 1. Fetch recent 12 monthly exam events ─────────────────────────────────
  const events = await prisma.examEvent.findMany({
    where: {
      eventType: ExamEventType.MONTHLY,
      examDate: { gte: yearStart, lt: yearEnd },
    },
    orderBy: { examDate: "asc" },
    take: 12,
    include: {
      registrations: {
        where: { cancelledAt: null },
        select: {
          division: true,
          isPaid: true,
          examNumber: true,
          externalName: true,
        },
      },
    },
  });

  // Derive available years from all monthly events
  const allEvents = await prisma.examEvent.findMany({
    where: { eventType: ExamEventType.MONTHLY },
    orderBy: { examDate: "desc" },
    select: { examDate: true },
  });
  const availableYears = Array.from(
    new Set(allEvents.map((e) => e.examDate.getFullYear())),
  ).sort((a, b) => b - a);

  // Build exam summaries (registrations only, no score data in ExamRegistration)
  const examSummaries: ExamSummary[] = events.map((e) => {
    const activeRegs = e.registrations;
    const participantCount = activeRegs.length;
    const paidCount = activeRegs.filter((r) => r.isPaid).length;

    return {
      id: e.id,
      title: e.title,
      examDate: e.examDate.toISOString(),
      participantCount,
      avgScore: null,
      topScore: null,
      passCount: paidCount,
      passRate: participantCount > 0 ? round1((paidCount / participantCount) * 100) : null,
      totalRegistrations: participantCount,
    };
  });

  // ── 2. Division breakdown across all events ────────────────────────────────
  const totalDivisionBreakdown: DivisionBreakdown = {
    GONGCHAE_M: 0,
    GONGCHAE_F: 0,
    GYEONGCHAE: 0,
    ONLINE: 0,
  };
  for (const e of events) {
    for (const r of e.registrations) {
      if (r.division in totalDivisionBreakdown) {
        totalDivisionBreakdown[r.division as keyof DivisionBreakdown] += 1;
      }
    }
  }
  const totalParticipants = Object.values(totalDivisionBreakdown).reduce(
    (a, b) => a + b,
    0,
  );

  // ── 3. Monthly participation trend per division ────────────────────────────
  // We build a matrix: event × division counts
  type EventDivisionRow = {
    eventId: string;
    title: string;
    examDate: string;
    counts: DivisionBreakdown;
    total: number;
  };
  const eventDivisionRows: EventDivisionRow[] = events.map((e) => {
    const counts: DivisionBreakdown = { GONGCHAE_M: 0, GONGCHAE_F: 0, GYEONGCHAE: 0, ONLINE: 0 };
    for (const r of e.registrations) {
      if (r.division in counts) {
        counts[r.division as keyof DivisionBreakdown] += 1;
      }
    }
    return {
      eventId: e.id,
      title: e.title,
      examDate: e.examDate.toISOString(),
      counts,
      total: e.registrations.length,
    };
  });

  // ── 4. Top 10 students who registered most frequently ──────────────────────
  // Among internal students (those with examNumber) across all monthly exams this year
  const allYearRegs = await prisma.examRegistration.findMany({
    where: {
      examEvent: {
        eventType: ExamEventType.MONTHLY,
        examDate: { gte: yearStart, lt: yearEnd },
      },
      cancelledAt: null,
      examNumber: { not: null },
    },
    select: {
      examNumber: true,
      isPaid: true,
      student: { select: { name: true } },
    },
  });

  const studentRegMap = new Map<
    string,
    { name: string; count: number; paidCount: number }
  >();
  for (const r of allYearRegs) {
    if (!r.examNumber || !r.student) continue;
    const entry = studentRegMap.get(r.examNumber);
    if (entry) {
      entry.count += 1;
      if (r.isPaid) entry.paidCount += 1;
    } else {
      studentRegMap.set(r.examNumber, {
        name: r.student.name,
        count: 1,
        paidCount: r.isPaid ? 1 : 0,
      });
    }
  }

  const topPerformers: TopPerformer[] = Array.from(studentRegMap.entries())
    .map(([examNumber, { name, count, paidCount }]) => ({
      examNumber,
      name,
      avgScore: count > 0 ? round1((paidCount / count) * 100) : 0,
      examCount: count,
    }))
    .sort((a, b) => b.examCount - a.examCount || b.avgScore - a.avgScore)
    .slice(0, 10);

  // ── 5. Monthly count trend by month ───────────────────────────────────────
  // Group examSummaries by month for a quick bar chart representation
  const monthlyTrend: { month: string; count: number }[] = examSummaries.map(
    (s) => ({
      month: new Date(s.examDate).toLocaleDateString("ko-KR", {
        month: "short",
      }),
      count: s.totalRegistrations,
    }),
  );
  const maxCount = Math.max(...monthlyTrend.map((m) => m.count), 1);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "성적 관리" },
          { label: "월말평가 접수 관리", href: "/admin/exams/monthly" },
          { label: "결과 분석" },
        ]}
      />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            Monthly Exam Analytics
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">월말평가 결과 분석</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            월말평가 접수 현황, 구분별 통계, 다회 응시 학생 현황을 분석합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-5 sm:mt-0">
          {/* Year filter */}
          <div className="flex items-center gap-2">
            {availableYears.map((y) => (
              <Link
                key={y}
                href={`/admin/exams/monthly/results?year=${y}`}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  y === filterYear
                    ? "bg-ember text-white"
                    : "border border-ink/10 text-slate hover:bg-ink/5"
                }`}
              >
                {y}년
              </Link>
            ))}
          </div>
          <Link
            href="/admin/exams/monthly"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:bg-ink/5"
          >
            접수 관리로
          </Link>
        </div>
      </div>

      {examSummaries.length === 0 ? (
        <div className="mt-12 rounded-[28px] border border-dashed border-ink/10 p-12 text-center text-slate">
          {filterYear}년 월말평가 데이터가 없습니다.
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          {/* ── Section 1: KPI Overview ───────────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-ink">
              {filterYear}년 종합 현황
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-[28px] border border-ink/10 bg-white p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate">
                  시험 횟수
                </p>
                <p className="mt-3 text-4xl font-bold text-ink">
                  {examSummaries.length}
                </p>
                <p className="mt-1 text-xs text-slate">회</p>
              </div>
              <div className="rounded-[28px] border border-ink/10 bg-white p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate">
                  총 응시 인원
                </p>
                <p className="mt-3 text-4xl font-bold text-ember">
                  {totalParticipants.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-slate">명</p>
              </div>
              <div className="rounded-[28px] border border-ink/10 bg-white p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate">
                  회당 평균 응시
                </p>
                <p className="mt-3 text-4xl font-bold text-forest">
                  {examSummaries.length > 0
                    ? round1(totalParticipants / examSummaries.length)
                    : 0}
                </p>
                <p className="mt-1 text-xs text-slate">명</p>
              </div>
              <div className="rounded-[28px] border border-ink/10 bg-white p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate">
                  재원생 다회 응시
                </p>
                <p className="mt-3 text-4xl font-bold text-ink">
                  {studentRegMap.size.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-slate">명</p>
              </div>
            </div>
          </section>

          {/* ── Section 2: Participation trend bar chart ─────────────────── */}
          {monthlyTrend.length > 1 && (
            <section>
              <h2 className="text-lg font-semibold text-ink">월별 응시 추이</h2>
              <div className="mt-4 rounded-[28px] border border-ink/10 bg-white p-6">
                <div className="flex items-end gap-3 h-40">
                  {monthlyTrend.map((m, idx) => {
                    const heightPct = maxCount > 0 ? (m.count / maxCount) * 100 : 0;
                    return (
                      <div
                        key={idx}
                        className="flex flex-1 flex-col items-center gap-1"
                      >
                        <span className="text-xs font-mono text-slate">
                          {m.count}
                        </span>
                        <div
                          className="w-full rounded-t-lg bg-ember/70 transition-all"
                          style={{ height: `${Math.max(heightPct, 2)}%` }}
                        />
                        <span className="text-xs text-slate">{m.month}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* ── Section 3: Division breakdown ────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-ink">구분별 누계</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(Object.keys(totalDivisionBreakdown) as (keyof DivisionBreakdown)[]).map(
                (div) => {
                  const count = totalDivisionBreakdown[div];
                  const pct =
                    totalParticipants > 0
                      ? round1((count / totalParticipants) * 100)
                      : 0;
                  return (
                    <div
                      key={div}
                      className="rounded-[28px] border border-ink/10 bg-white p-5 text-center"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate">
                        {DIVISION_LABEL[div]}
                      </p>
                      <p className="mt-2 text-3xl font-bold text-ink">
                        {count.toLocaleString()}
                      </p>
                      <p className="mt-1 text-xs text-slate">{pct}%</p>
                    </div>
                  );
                },
              )}
            </div>
          </section>

          {/* ── Section 4: Per-event summary table ───────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-ink">
              회차별 현황{" "}
              <span className="text-sm font-normal text-slate">
                ({filterYear}년 최근 12회)
              </span>
            </h2>
            <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/80">
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                      시험명
                    </th>
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                      시험일
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      공채(남)
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      공채(여)
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      경채
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      온라인
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      합계
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      납부 완료
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {eventDivisionRows.map((row) => {
                    const paidCount = events
                      .find((e) => e.id === row.eventId)
                      ?.registrations.filter((r) => r.isPaid).length ?? 0;
                    return (
                      <tr key={row.eventId} className="hover:bg-mist/30">
                        <td className="px-5 py-3.5 font-medium text-ink">
                          <Link
                            href={`/admin/exams/monthly/${row.eventId}`}
                            className="hover:text-ember hover:underline"
                          >
                            {row.title}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-slate">
                          {formatDate(row.examDate)}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate">
                          {row.counts.GONGCHAE_M}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate">
                          {row.counts.GONGCHAE_F}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate">
                          {row.counts.GYEONGCHAE}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate">
                          {row.counts.ONLINE}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                          {row.total}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span
                            className={`font-mono font-semibold ${
                              row.total > 0 && paidCount === row.total
                                ? "text-forest"
                                : "text-amber-600"
                            }`}
                          >
                            {paidCount}
                          </span>
                          <span className="ml-1 text-xs text-slate">
                            / {row.total}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-ink/10 bg-mist/80">
                    <td
                      colSpan={2}
                      className="px-5 py-3.5 text-sm font-semibold text-ink"
                    >
                      합계
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                      {totalDivisionBreakdown.GONGCHAE_M}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                      {totalDivisionBreakdown.GONGCHAE_F}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                      {totalDivisionBreakdown.GYEONGCHAE}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                      {totalDivisionBreakdown.ONLINE}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-ember">
                      {totalParticipants}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* ── Section 5: Top 10 frequent participants ───────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-ink">
              다회 응시 재원생 TOP 10{" "}
              <span className="text-sm font-normal text-slate">
                ({filterYear}년, 응시 횟수 기준)
              </span>
            </h2>
            {topPerformers.length === 0 ? (
              <div className="mt-4 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
                {filterYear}년 재원생 응시 기록이 없습니다.
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-[28px] border border-ink/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 bg-mist/80">
                      <th className="w-12 px-5 py-3.5 text-center font-semibold text-ink/60">
                        순위
                      </th>
                      <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                        학생
                      </th>
                      <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                        응시 횟수
                      </th>
                      <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                        납부 완료율
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {topPerformers.map((t, idx) => (
                      <tr key={t.examNumber} className="hover:bg-mist/30">
                        <td className="px-5 py-3.5 text-center">
                          {idx === 0 ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-white">
                              1
                            </span>
                          ) : idx === 1 ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate/40 text-xs font-bold text-white">
                              2
                            </span>
                          ) : idx === 2 ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-700/60 text-xs font-bold text-white">
                              3
                            </span>
                          ) : (
                            <span className="text-slate">{idx + 1}</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/admin/students/${t.examNumber}`}
                            className="font-medium text-ink transition hover:text-ember"
                          >
                            {t.name}
                          </Link>{" "}
                          <span className="text-xs text-slate">
                            {t.examNumber}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                          {t.examCount}회
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono">
                          <span
                            className={
                              t.avgScore >= 100
                                ? "font-semibold text-forest"
                                : t.avgScore >= 80
                                  ? "text-ink"
                                  : "text-amber-600"
                            }
                          >
                            {t.avgScore}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Section 6: Subject vs Month trend ────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-ink">
              구분별 월별 추이 매트릭스{" "}
              <span className="text-sm font-normal text-slate">
                (시험 × 구분)
              </span>
            </h2>
            <p className="mt-1 text-xs text-slate">
              * 월말평가는 성적 점수 미수집 — 접수 인원 기준 통계입니다.
              성적 분석은 아침모의고사 성적 개요를 이용하세요.
            </p>
            <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/80">
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60 whitespace-nowrap">
                      구분
                    </th>
                    {eventDivisionRows.map((row) => (
                      <th
                        key={row.eventId}
                        className="px-4 py-3.5 text-right font-semibold text-ink/60 whitespace-nowrap"
                      >
                        {new Date(row.examDate).toLocaleDateString("ko-KR", {
                          month: "numeric",
                          day: "numeric",
                        })}
                      </th>
                    ))}
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      합계
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {(
                    [
                      "GONGCHAE_M",
                      "GONGCHAE_F",
                      "GYEONGCHAE",
                      "ONLINE",
                    ] as (keyof DivisionBreakdown)[]
                  ).map((div) => (
                    <tr key={div} className="hover:bg-mist/30">
                      <td className="px-5 py-3.5 font-medium text-ink whitespace-nowrap">
                        {DIVISION_LABEL[div]}
                      </td>
                      {eventDivisionRows.map((row) => {
                        const count = row.counts[div];
                        return (
                          <td
                            key={row.eventId}
                            className="px-4 py-3.5 text-right font-mono"
                          >
                            {count > 0 ? (
                              <span
                                className={
                                  count >= 30
                                    ? "font-semibold text-forest"
                                    : count >= 10
                                      ? "text-ink"
                                      : "text-slate"
                                }
                              >
                                {count}
                              </span>
                            ) : (
                              <span className="text-ink/20">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-5 py-3.5 text-right font-mono font-semibold text-ember">
                        {totalDivisionBreakdown[div]}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-ink/10 bg-mist/50">
                    <td className="px-5 py-3.5 font-semibold text-ink">합계</td>
                    {eventDivisionRows.map((row) => (
                      <td
                        key={row.eventId}
                        className="px-4 py-3.5 text-right font-mono font-semibold text-ink"
                      >
                        {row.total}
                      </td>
                    ))}
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-ember">
                      {totalParticipants}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
