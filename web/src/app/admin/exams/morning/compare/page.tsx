import Link from "next/link";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { SUBJECT_LABEL, EXAM_TYPE_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────────

type PeriodStats = {
  periodId: number;
  periodName: string;
  startDate: string;
  endDate: string;
  sessionCount: number;
  totalParticipants: number;
  participationRate: number | null;
  avgScore: number | null;
  topScore: number | null;
  subjectAvgs: SubjectAvg[];
};

type SubjectAvg = {
  subject: string;
  label: string;
  avg: number | null;
  sessionCount: number;
};

type ImprovementRow = {
  examNumber: string;
  name: string;
  period1Avg: number | null;
  period2Avg: number | null;
  delta: number | null;
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function sp(p: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = p[key];
  return Array.isArray(v) ? v[0] : v;
}

function getSubjectLabel(subject: string): string {
  return SUBJECT_LABEL[subject as keyof typeof SUBJECT_LABEL] ?? subject;
}

async function buildPeriodStats(periodId: number): Promise<PeriodStats> {
  const prisma = getPrisma();

  const period = await prisma.examPeriod.findUnique({
    where: { id: periodId },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
    },
  });

  if (!period) {
    return {
      periodId,
      periodName: `기간 #${periodId}`,
      startDate: "",
      endDate: "",
      sessionCount: 0,
      totalParticipants: 0,
      participationRate: null,
      avgScore: null,
      topScore: null,
      subjectAvgs: [],
    };
  }

  const sessions = await prisma.examSession.findMany({
    where: { periodId, isCancelled: false },
    select: {
      id: true,
      subject: true,
      displaySubjectName: true,
      scores: {
        select: {
          examNumber: true,
          finalScore: true,
          attendType: true,
        },
      },
    },
  });

  const sessionCount = sessions.length;

  // Aggregate all scores across sessions
  const allScores: number[] = [];
  let totalPresent = 0;
  let totalRecords = 0;

  // Subject aggregation
  type SubjectBucket = { sum: number; count: number; sessionCount: number };
  const subjectBuckets = new Map<string, SubjectBucket>();

  for (const session of sessions) {
    const present = session.scores.filter(
      (sc) => sc.attendType === AttendType.NORMAL || sc.attendType === AttendType.LIVE,
    );
    const absent = session.scores.filter(
      (sc) => sc.attendType === AttendType.ABSENT || sc.attendType === AttendType.EXCUSED,
    );
    totalPresent += present.length;
    totalRecords += present.length + absent.length;

    const subjectKey = session.displaySubjectName?.trim() || getSubjectLabel(session.subject);

    for (const sc of present) {
      if (sc.finalScore !== null) {
        allScores.push(sc.finalScore);
        const bucket = subjectBuckets.get(subjectKey);
        if (bucket) {
          bucket.sum += sc.finalScore;
          bucket.count += 1;
        } else {
          subjectBuckets.set(subjectKey, { sum: sc.finalScore, count: 1, sessionCount: 1 });
        }
      }
    }
    // Count distinct sessions per subject
    const bucket = subjectBuckets.get(subjectKey);
    if (bucket) {
      bucket.sessionCount += 1;
    }
  }

  const avgScore =
    allScores.length > 0 ? round1(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null;
  const topScore = allScores.length > 0 ? Math.max(...allScores) : null;
  const participationRate =
    totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : null;

  const subjectAvgs: SubjectAvg[] = Array.from(subjectBuckets.entries()).map(
    ([subject, bucket]) => ({
      subject,
      label: subject,
      avg: bucket.count > 0 ? round1(bucket.sum / bucket.count) : null,
      sessionCount: bucket.sessionCount,
    }),
  );

  return {
    periodId,
    periodName: period.name,
    startDate: period.startDate.toISOString(),
    endDate: period.endDate.toISOString(),
    sessionCount,
    totalParticipants: totalPresent,
    participationRate,
    avgScore,
    topScore,
    subjectAvgs,
  };
}

async function getImprovementRows(
  period1Id: number,
  period2Id: number,
  deltaThreshold: number,
): Promise<{ improved: ImprovementRow[]; declined: ImprovementRow[] }> {
  const prisma = getPrisma();

  // Get per-student averages for both periods
  const [scores1, scores2] = await Promise.all([
    prisma.score.findMany({
      where: {
        session: { periodId: period1Id, isCancelled: false },
        attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
        finalScore: { not: null },
      },
      select: { examNumber: true, finalScore: true, student: { select: { name: true } } },
    }),
    prisma.score.findMany({
      where: {
        session: { periodId: period2Id, isCancelled: false },
        attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
        finalScore: { not: null },
      },
      select: { examNumber: true, finalScore: true, student: { select: { name: true } } },
    }),
  ]);

  // Build per-student maps
  type StudentBucket = { name: string; sum: number; count: number };
  const map1 = new Map<string, StudentBucket>();
  const map2 = new Map<string, StudentBucket>();

  for (const sc of scores1) {
    if (sc.finalScore === null) continue;
    const e = map1.get(sc.examNumber);
    if (e) {
      e.sum += sc.finalScore;
      e.count += 1;
    } else {
      map1.set(sc.examNumber, { name: sc.student.name, sum: sc.finalScore, count: 1 });
    }
  }
  for (const sc of scores2) {
    if (sc.finalScore === null) continue;
    const e = map2.get(sc.examNumber);
    if (e) {
      e.sum += sc.finalScore;
      e.count += 1;
    } else {
      map2.set(sc.examNumber, { name: sc.student.name, sum: sc.finalScore, count: 1 });
    }
  }

  const rows: ImprovementRow[] = [];
  for (const [examNumber, b1] of map1.entries()) {
    const b2 = map2.get(examNumber);
    if (!b2) continue;
    const avg1 = round1(b1.sum / b1.count);
    const avg2 = round1(b2.sum / b2.count);
    const delta = round1(avg2 - avg1);
    rows.push({ examNumber, name: b1.name, period1Avg: avg1, period2Avg: avg2, delta });
  }

  const improved = rows
    .filter((r) => r.delta !== null && r.delta >= deltaThreshold)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
    .slice(0, 10);

  const declined = rows
    .filter((r) => r.delta !== null && r.delta <= -deltaThreshold)
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
    .slice(0, 10);

  return { improved, declined };
}

// ── Server Component ───────────────────────────────────────────────────────────

export default async function MorningExamComparePage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();
  const resolvedSP = await searchParams;

  // Load all periods for selector
  const allPeriods = await prisma.examPeriod.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, startDate: true, endDate: true, isActive: true },
  });

  // Default: last 2 completed periods (or first 2 if fewer)
  const completedPeriods = allPeriods.filter((p) => !p.isActive);
  const defaultP1 = completedPeriods[1]?.id ?? allPeriods[1]?.id ?? allPeriods[0]?.id;
  const defaultP2 = completedPeriods[0]?.id ?? allPeriods[0]?.id;

  const rawP1 = sp(resolvedSP, "period1");
  const rawP2 = sp(resolvedSP, "period2");
  const period1Id = rawP1 ? parseInt(rawP1, 10) : (defaultP1 ?? 0);
  const period2Id = rawP2 ? parseInt(rawP2, 10) : (defaultP2 ?? 0);

  if (!period1Id || !period2Id || period1Id === period2Id) {
    // Not enough periods to compare
    return (
      <div className="p-8 sm:p-10">
        <Breadcrumbs
          items={[
            { label: "성적 관리" },
            { label: "아침모의고사", href: "/admin/exams/morning" },
            { label: "성적 개요", href: "/admin/exams/morning/overview" },
            { label: "기간 비교" },
          ]}
        />
        <h1 className="mt-8 text-3xl font-semibold text-ink">기간별 성적 비교</h1>
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-12 text-center text-slate">
          비교할 기간이 충분하지 않습니다. 최소 2개의 시험 기간이 필요합니다.
        </div>
        <div className="mt-4">
          <Link
            href="/admin/exams/morning/overview"
            className="text-sm font-semibold text-forest transition hover:underline"
          >
            ← 성적 개요로
          </Link>
        </div>
      </div>
    );
  }

  // Build stats for both periods in parallel
  const [stats1, stats2, { improved, declined }] = await Promise.all([
    buildPeriodStats(period1Id),
    buildPeriodStats(period2Id),
    getImprovementRows(period1Id, period2Id, 10),
  ]);

  // Build unified subject list
  const allSubjects = Array.from(
    new Set([
      ...stats1.subjectAvgs.map((s) => s.label),
      ...stats2.subjectAvgs.map((s) => s.label),
    ]),
  );

  function getSubjectAvg(stats: PeriodStats, label: string): number | null {
    return stats.subjectAvgs.find((s) => s.label === label)?.avg ?? null;
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <Breadcrumbs
        items={[
          { label: "성적 관리" },
          { label: "아침모의고사", href: "/admin/exams/morning" },
          { label: "성적 개요", href: "/admin/exams/morning/overview" },
          { label: "기간 비교" },
        ]}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            아침 모의고사
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">기간별 성적 비교</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            두 시험 기간의 성적 지표를 나란히 비교하고, 성적이 크게 향상 또는 하락한 학생을 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/exams/morning/overview"
            className="inline-flex items-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            성적 개요
          </Link>
          <Link
            href="/admin/exams/morning"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            수강 현황
          </Link>
        </div>
      </div>

      {/* ── Period Selector ────────────────────────────────────────────── */}
      <form
        method="get"
        className="mt-8 flex flex-wrap items-end gap-4 rounded-[28px] border border-ink/10 bg-mist p-6"
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate">기간 1 (이전)</label>
          <select
            name="period1"
            defaultValue={String(period1Id)}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {allPeriods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isActive ? " (진행 중)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="pb-3 text-2xl font-bold text-slate">vs</div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate">기간 2 (이후)</label>
          <select
            name="period2"
            defaultValue={String(period2Id)}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {allPeriods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isActive ? " (진행 중)" : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest"
        >
          비교
        </button>
      </form>

      <div className="mt-10 space-y-10">

        {/* ── Section 1: Side-by-side stats ─────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-ink">핵심 지표 비교</h2>
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {([stats1, stats2] as PeriodStats[]).map((stats, idx) => (
              <div
                key={stats.periodId}
                className={`rounded-[28px] border p-6 ${
                  idx === 0
                    ? "border-ink/10 bg-white"
                    : "border-ember/20 bg-ember/5"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        idx === 0
                          ? "bg-ink/10 text-ink"
                          : "bg-ember/10 text-ember"
                      }`}
                    >
                      기간 {idx + 1}
                    </span>
                    <h3 className="mt-2 text-xl font-bold text-ink">{stats.periodName}</h3>
                  </div>
                  <p className="text-xs text-slate">
                    {stats.startDate ? formatDate(stats.startDate) : ""}
                    {stats.endDate ? ` ~ ${formatDate(stats.endDate)}` : ""}
                  </p>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <Stat label="평균 점수" value={stats.avgScore !== null ? `${stats.avgScore}점` : "—"} />
                  <Stat label="최고 점수" value={stats.topScore !== null ? `${stats.topScore}점` : "—"} />
                  <Stat label="총 응시 수" value={`${stats.totalParticipants}회`} />
                  <Stat label="참여율" value={stats.participationRate !== null ? `${stats.participationRate}%` : "—"} />
                  <Stat label="시험 횟수" value={`${stats.sessionCount}회`} />
                </div>
              </div>
            ))}
          </div>

          {/* Delta row */}
          {stats1.avgScore !== null && stats2.avgScore !== null && (
            <div className="mt-6 rounded-[24px] border border-ink/10 bg-mist p-5">
              <p className="text-sm font-semibold text-ink">
                기간 2 − 기간 1 평균 점수 변화
              </p>
              {(() => {
                const delta = round1(stats2.avgScore - stats1.avgScore);
                const isPositive = delta > 0;
                return (
                  <p
                    className={`mt-2 text-4xl font-bold ${
                      isPositive ? "text-forest" : delta < 0 ? "text-ember" : "text-slate"
                    }`}
                  >
                    {isPositive ? "+" : ""}
                    {delta}점
                    <span className="ml-3 text-base font-normal text-slate">
                      {isPositive ? "성적 향상" : delta < 0 ? "성적 하락" : "동일"}
                    </span>
                  </p>
                );
              })()}
            </div>
          )}
        </section>

        {/* ── Section 2: Subject Comparison Table ───────────────────────── */}
        {allSubjects.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-ink">과목별 평균 비교</h2>
            <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/80">
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">과목</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      기간 1: {stats1.periodName}
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      기간 2: {stats2.periodName}
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">변화</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {allSubjects.map((subject) => {
                    const avg1 = getSubjectAvg(stats1, subject);
                    const avg2 = getSubjectAvg(stats2, subject);
                    const delta =
                      avg1 !== null && avg2 !== null ? round1(avg2 - avg1) : null;
                    return (
                      <tr key={subject} className="hover:bg-mist/30">
                        <td className="px-5 py-3.5 font-medium text-ink">{subject}</td>
                        <td className="px-5 py-3.5 text-right font-mono">
                          {avg1 !== null ? (
                            <span
                              className={
                                avg1 >= 80
                                  ? "font-semibold text-forest"
                                  : avg1 >= 60
                                    ? "text-ink"
                                    : "text-red-500"
                              }
                            >
                              {avg1}점
                            </span>
                          ) : (
                            <span className="text-ink/25">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono">
                          {avg2 !== null ? (
                            <span
                              className={
                                avg2 >= 80
                                  ? "font-semibold text-forest"
                                  : avg2 >= 60
                                    ? "text-ink"
                                    : "text-red-500"
                              }
                            >
                              {avg2}점
                            </span>
                          ) : (
                            <span className="text-ink/25">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold">
                          {delta !== null ? (
                            <span
                              className={
                                delta > 0
                                  ? "text-forest"
                                  : delta < 0
                                    ? "text-ember"
                                    : "text-slate"
                              }
                            >
                              {delta > 0 ? "+" : ""}
                              {delta}
                            </span>
                          ) : (
                            <span className="text-ink/25">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate">
              * 80점 이상{" "}
              <span className="font-semibold text-forest">녹색</span>,  60점 미만{" "}
              <span className="font-semibold text-red-500">빨간색</span>으로 표시됩니다.
            </p>
          </section>
        )}

        {/* ── Section 3: Improved students (delta >= 10) ────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-ink">
            성적 향상 학생 TOP 10{" "}
            <span className="text-sm font-normal text-slate">(두 기간 평균 점수 차 +10점 이상)</span>
          </h2>
          {improved.length === 0 ? (
            <div className="mt-4 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
              +10점 이상 향상된 학생이 없습니다.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-[28px] border border-ink/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/80">
                    <th className="w-10 px-5 py-3.5 text-center font-semibold text-ink/60">#</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">학생</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">기간 1 평균</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">기간 2 평균</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">변화</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {improved.map((row, idx) => (
                    <tr key={row.examNumber} className="hover:bg-mist/30">
                      <td className="px-5 py-3.5 text-center text-slate">{idx + 1}</td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/students/${row.examNumber}`}
                          className="font-medium text-ink transition hover:text-ember"
                        >
                          {row.name}
                        </Link>{" "}
                        <span className="text-xs text-slate">{row.examNumber}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-slate">
                        {row.period1Avg !== null ? `${row.period1Avg}점` : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                        {row.period2Avg !== null ? `${row.period2Avg}점` : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-forest">
                        +{row.delta}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Section 4: Declined students (delta <= -10) ───────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-ink">
            성적 하락 학생 TOP 10{" "}
            <span className="text-sm font-normal text-slate">(두 기간 평균 점수 차 −10점 이상)</span>
          </h2>
          {declined.length === 0 ? (
            <div className="mt-4 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
              −10점 이상 하락된 학생이 없습니다.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-[28px] border border-ink/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/80">
                    <th className="w-10 px-5 py-3.5 text-center font-semibold text-ink/60">#</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">학생</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">기간 1 평균</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">기간 2 평균</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">변화</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {declined.map((row, idx) => (
                    <tr key={row.examNumber} className="hover:bg-mist/30">
                      <td className="px-5 py-3.5 text-center text-slate">{idx + 1}</td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/students/${row.examNumber}`}
                          className="font-medium text-ink transition hover:text-ember"
                        >
                          {row.name}
                        </Link>{" "}
                        <span className="text-xs text-slate">{row.examNumber}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-slate">
                        {row.period1Avg !== null ? `${row.period1Avg}점` : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                        {row.period2Avg !== null ? `${row.period2Avg}점` : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-ember">
                        {row.delta}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Helper component ───────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-mist p-3">
      <p className="text-xs text-slate">{label}</p>
      <p className="mt-1 text-lg font-bold text-ink">{value}</p>
    </div>
  );
}
