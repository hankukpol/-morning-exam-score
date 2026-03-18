import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType, Subject } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL, EXAM_TYPE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ examNumber: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function pickFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isSubject(value: string): value is Subject {
  return Object.values(Subject).includes(value as Subject);
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${year}.${month}.${day}(${weekdays[d.getDay()]})`;
}

function formatMonthKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${year}년 ${parseInt(month, 10)}월`;
}

const ATTEND_TYPE_COLOR: Record<AttendType, string> = {
  NORMAL: "border-forest/20 bg-forest/10 text-forest",
  LIVE: "border-sky-200 bg-sky-50 text-sky-700",
  EXCUSED: "border-amber-200 bg-amber-50 text-amber-700",
  ABSENT: "border-red-200 bg-red-50 text-red-600",
};

const ATTEND_TYPE_LABEL: Record<AttendType, string> = {
  NORMAL: "출석",
  LIVE: "라이브",
  EXCUSED: "사유 결시",
  ABSENT: "무단 결시",
};

type TrendRow = {
  scoreId: number;
  sessionId: number;
  examDate: Date;
  periodName: string;
  week: number;
  subject: Subject;
  displaySubjectName: string | null;
  finalScore: number | null;
  rawScore: number | null;
  attendType: AttendType;
  rank: number | null;
  total: number | null;
  percentileFromTop: number | null;
  monthKey: string;
};

export default async function StudentScoreTrendPage({ params, searchParams }: PageProps) {
  const { examNumber } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  await requireAdminContext(AdminRole.TEACHER);

  const db = getPrisma();

  // ── Student info ─────────────────────────────────────────────────────────
  const student = await db.student.findUnique({
    where: { examNumber },
    select: {
      examNumber: true,
      name: true,
      examType: true,
      className: true,
      generation: true,
      isActive: true,
    },
  });

  if (!student) notFound();

  const rawSubject = pickFirst(resolvedSearchParams["subject"]);
  const selectedSubject: Subject | null =
    rawSubject && isSubject(rawSubject) ? rawSubject : null;

  // ── All scores for student, ordered by date ──────────────────────────────
  const allScores = await db.score.findMany({
    where: {
      examNumber,
      ...(selectedSubject ? { session: { subject: selectedSubject } } : {}),
    },
    include: {
      session: {
        include: {
          period: { select: { name: true } },
        },
      },
    },
    orderBy: [{ session: { examDate: "asc" } }, { session: { id: "asc" } }],
  });

  // ── Compute per-session rank ─────────────────────────────────────────────
  // Collect unique sessionIds for sessions this student participated in
  const sessionIds = [...new Set(allScores.map((s) => s.sessionId))];

  // For each session, get all valid scores to compute rank
  type SessionScoreEntry = { examNumber: string; finalScore: number | null };
  const sessionScoreMap = new Map<number, SessionScoreEntry[]>();

  if (sessionIds.length > 0) {
    const allSessionScores = await db.score.findMany({
      where: {
        sessionId: { in: sessionIds },
        attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
      },
      select: { sessionId: true, examNumber: true, finalScore: true },
    });

    for (const sc of allSessionScores) {
      if (!sessionScoreMap.has(sc.sessionId)) {
        sessionScoreMap.set(sc.sessionId, []);
      }
      sessionScoreMap.get(sc.sessionId)!.push({
        examNumber: sc.examNumber,
        finalScore: sc.finalScore,
      });
    }
  }

  // Compute rank for the student in each session
  function computeRank(
    entries: SessionScoreEntry[],
    targetExamNumber: string,
  ): { rank: number | null; total: number } {
    const validEntries = entries.filter((e) => e.finalScore !== null);
    const total = validEntries.length;
    if (total === 0) return { rank: null, total: 0 };

    const targetEntry = validEntries.find((e) => e.examNumber === targetExamNumber);
    if (!targetEntry || targetEntry.finalScore === null) return { rank: null, total };

    const sorted = [...validEntries].sort((a, b) => {
      if (a.finalScore === null) return 1;
      if (b.finalScore === null) return -1;
      return b.finalScore - a.finalScore;
    });

    // Dense rank
    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i].finalScore !== sorted[i - 1].finalScore) {
        rank = i + 1;
      }
      if (sorted[i].examNumber === targetExamNumber) {
        return { rank, total };
      }
    }
    return { rank: null, total };
  }

  // ── Build trend rows ─────────────────────────────────────────────────────
  const trendRows: TrendRow[] = allScores.map((score) => {
    const sessionEntries = sessionScoreMap.get(score.sessionId) ?? [];
    const { rank, total } = computeRank(sessionEntries, examNumber);
    const percentileFromTop =
      rank !== null && total > 0
        ? Math.round((rank / total) * 100 * 10) / 10
        : null;

    return {
      scoreId: score.id,
      sessionId: score.sessionId,
      examDate: score.session.examDate,
      periodName: score.session.period.name,
      week: score.session.week,
      subject: score.session.subject,
      displaySubjectName: score.session.displaySubjectName,
      finalScore: score.finalScore,
      rawScore: score.rawScore,
      attendType: score.attendType,
      rank,
      total,
      percentileFromTop,
      monthKey: formatMonthKey(score.session.examDate),
    };
  });

  // ── Monthly averages ─────────────────────────────────────────────────────
  const monthlyMap = new Map<string, { total: number; count: number }>();
  for (const row of trendRows) {
    if (row.finalScore !== null && row.attendType !== AttendType.ABSENT) {
      const existing = monthlyMap.get(row.monthKey);
      if (existing) {
        existing.total += row.finalScore;
        existing.count += 1;
      } else {
        monthlyMap.set(row.monthKey, { total: row.finalScore, count: 1 });
      }
    }
  }

  const monthlyAverages = new Map<string, number>(
    Array.from(monthlyMap.entries()).map(([key, v]) => [
      key,
      Math.round((v.total / v.count) * 10) / 10,
    ]),
  );

  // ── KPI stats ────────────────────────────────────────────────────────────
  const attendedRows = trendRows.filter(
    (r) => r.attendType !== AttendType.ABSENT && r.finalScore !== null,
  );
  const totalSessions = trendRows.length;
  const attendedCount = attendedRows.length;
  const avgScore =
    attendedCount > 0
      ? Math.round(
          (attendedRows.reduce((sum, r) => sum + (r.finalScore ?? 0), 0) /
            attendedCount) *
            10,
        ) / 10
      : null;
  const recentScores = attendedRows.slice(-5);
  const recentAvg =
    recentScores.length > 0
      ? Math.round(
          (recentScores.reduce((sum, r) => sum + (r.finalScore ?? 0), 0) /
            recentScores.length) *
            10,
        ) / 10
      : null;
  const trend =
    attendedCount >= 2 && recentAvg !== null && avgScore !== null
      ? recentAvg - avgScore
      : null;

  // Best/worst session
  const bestRow = attendedRows.reduce<TrendRow | null>(
    (best, r) =>
      r.finalScore !== null &&
      (best === null || (best.finalScore ?? 0) < (r.finalScore ?? 0))
        ? r
        : best,
    null,
  );

  // Subject options (only subjects this student took)
  const subjectsInData = [...new Set(allScores.map((s) => s.session.subject))];
  const subjectOptions = subjectsInData.map((s) => ({
    value: s,
    label: SUBJECT_LABEL[s] ?? s,
  }));

  // Max score value for bar width calculation
  const maxFinalScore = Math.max(
    ...attendedRows.map((r) => r.finalScore ?? 0),
    100, // minimum denominator
  );

  return (
    <div className="p-8 sm:p-10">
      {/* ── 헤더 ──────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <Link
            href={`/admin/students/${examNumber}`}
            className="text-sm text-slate transition hover:text-ember"
          >
            ← {student.name} ({examNumber})
          </Link>
          <h1 className="mt-3 text-3xl font-semibold">
            {student.name}
            <span className="ml-3 text-xl font-normal text-slate">{examNumber}</span>
          </h1>
          <p className="mt-1 text-sm text-slate">
            {EXAM_TYPE_LABEL[student.examType]}
            {student.className ? ` · ${student.className}반` : ""}
            {student.generation ? ` · ${student.generation}기` : ""}
            {!student.isActive && (
              <span className="ml-2 rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold">
                비활성
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-ember">
          성적 추이
        </div>
        <Link
          href={`/admin/students/${examNumber}/scores`}
          className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-slate transition hover:border-ink/30"
        >
          전체 성적 이력
        </Link>
        <Link
          href={`/admin/students/${examNumber}`}
          className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-slate transition hover:border-ink/30"
        >
          학생 상세
        </Link>
      </div>

      {/* ── 과목 필터 ─────────────────────────────────────────────────── */}
      <div className="mt-8 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">
          과목 필터
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/students/${examNumber}/score-trend`}
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
              !selectedSubject
                ? "border-ember/30 bg-ember/10 text-ember"
                : "border-ink/10 bg-white text-slate hover:border-ember/20 hover:text-ember"
            }`}
          >
            전체 과목
          </Link>
          {subjectOptions.map((opt) => {
            const isActive = selectedSubject === opt.value;
            return (
              <Link
                key={opt.value}
                href={`/admin/students/${examNumber}/score-trend?subject=${opt.value}`}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  isActive
                    ? "border-ember/30 bg-ember/10 text-ember"
                    : "border-ink/10 bg-white text-slate hover:border-ember/20 hover:text-ember"
                }`}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── KPI 카드 ──────────────────────────────────────────────────── */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            전체 평균
          </p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              avgScore === null
                ? "text-slate"
                : avgScore >= 80
                  ? "text-forest"
                  : avgScore >= 60
                    ? "text-amber-600"
                    : "text-ember"
            }`}
          >
            {avgScore !== null ? `${avgScore}점` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">응시 기준</p>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            최근 5회 평균
          </p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              recentAvg === null
                ? "text-slate"
                : recentAvg >= 80
                  ? "text-forest"
                  : recentAvg >= 60
                    ? "text-amber-600"
                    : "text-ember"
            }`}
          >
            {recentAvg !== null ? `${recentAvg}점` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">
            {trend !== null ? (
              <span className={trend > 0 ? "text-forest" : trend < 0 ? "text-ember" : "text-slate"}>
                전체 대비 {trend > 0 ? "+" : ""}
                {trend.toFixed(1)}점
              </span>
            ) : (
              "최근 5회"
            )}
          </p>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            응시 횟수
          </p>
          <p className="mt-3 text-3xl font-semibold text-ink">
            {attendedCount}
            <span className="ml-1 text-base font-normal text-slate">
              / {totalSessions}회
            </span>
          </p>
          <p className="mt-1 text-xs text-slate">응시 / 전체</p>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            최고 점수
          </p>
          <p className="mt-3 text-3xl font-semibold text-ember">
            {bestRow?.finalScore !== undefined && bestRow?.finalScore !== null
              ? `${bestRow.finalScore}점`
              : "—"}
          </p>
          {bestRow && (
            <p className="mt-1 text-xs text-slate">
              {SUBJECT_LABEL[bestRow.subject] ?? bestRow.subject}
            </p>
          )}
        </article>
      </section>

      {/* ── 성적 추이 바 차트 ─────────────────────────────────────────── */}
      {trendRows.length === 0 ? (
        <section className="mt-8">
          <div className="rounded-[28px] border border-dashed border-ink/10 p-16 text-center">
            <p className="text-sm text-slate">
              {selectedSubject
                ? `${SUBJECT_LABEL[selectedSubject] ?? selectedSubject} 과목의 성적 데이터가 없습니다.`
                : "성적 데이터가 없습니다."}
            </p>
          </div>
        </section>
      ) : (
        <>
          {/* ── SVG 추이 라인 차트 ────────────────────────────────────── */}
          {(() => {
            // Use last 40 attended rows for the line chart
            const chartRows = attendedRows.slice(-40);
            if (chartRows.length < 2) return null;

            const chartW = 600;
            const chartH = 160;
            const padL = 36;
            const padR = 12;
            const padT = 12;
            const padB = 28;
            const innerW = chartW - padL - padR;
            const innerH = chartH - padT - padB;

            // Y domain: 0–100
            const yMin = 0;
            const yMax = 100;
            const yScale = (v: number) =>
              padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
            const xScale = (i: number) =>
              padL + (i / (chartRows.length - 1)) * innerW;

            // Build points string
            const linePoints = chartRows
              .map((r, i) => `${xScale(i).toFixed(1)},${yScale(r.finalScore ?? 0).toFixed(1)}`)
              .join(" ");

            // Reference lines at 60, 70, 80
            const refLines = [60, 70, 80];

            // Dot color per score
            const dotColor = (score: number | null) => {
              if (score === null) return "#9CA3AF";
              if (score >= 80) return "#1F4D3A";
              if (score >= 60) return "#D97706";
              return "#C55A11";
            };

            // Y axis tick labels
            const yTicks = [0, 20, 40, 60, 80, 100];

            // X axis: show first, last, and every ~10th label
            const xLabelIndices = new Set<number>();
            xLabelIndices.add(0);
            xLabelIndices.add(chartRows.length - 1);
            for (let i = Math.floor(chartRows.length / 5); i < chartRows.length - 1; i += Math.max(1, Math.floor(chartRows.length / 5))) {
              xLabelIndices.add(i);
            }

            return (
              <section className="mt-8">
                <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-ink">
                      성적 추이 라인 차트
                      {selectedSubject && (
                        <span className="ml-2 text-sm font-normal text-slate">
                          — {SUBJECT_LABEL[selectedSubject] ?? selectedSubject}
                        </span>
                      )}
                    </h2>
                    <div className="flex flex-wrap gap-4 text-xs text-slate">
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-forest" />
                        80점 이상
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
                        60~79점
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-ember" />
                        60점 미만
                      </span>
                    </div>
                  </div>
                  <div className="mt-5 overflow-x-auto">
                    <svg
                      viewBox={`0 0 ${chartW} ${chartH}`}
                      className="w-full min-w-[400px]"
                      aria-label="성적 추이 라인 차트"
                    >
                      {/* Y grid lines + labels */}
                      {yTicks.map((tick) => {
                        const y = yScale(tick);
                        return (
                          <g key={tick}>
                            <line
                              x1={padL}
                              y1={y}
                              x2={chartW - padR}
                              y2={y}
                              stroke={tick === 0 ? "#9CA3AF" : "#E5E7EB"}
                              strokeWidth={tick === 0 ? 1 : 0.8}
                            />
                            <text
                              x={padL - 4}
                              y={y + 4}
                              textAnchor="end"
                              fontSize={9}
                              fill="#6B7280"
                            >
                              {tick}
                            </text>
                          </g>
                        );
                      })}

                      {/* Reference lines at 60, 70, 80 */}
                      {refLines.map((ref) => {
                        const y = yScale(ref);
                        const color =
                          ref === 80 ? "#1F4D3A" : ref === 70 ? "#D97706" : "#C55A11";
                        return (
                          <g key={ref}>
                            <line
                              x1={padL}
                              y1={y}
                              x2={chartW - padR}
                              y2={y}
                              stroke={color}
                              strokeWidth={0.8}
                              strokeDasharray="4 3"
                              opacity={0.45}
                            />
                            <text
                              x={chartW - padR + 2}
                              y={y + 3}
                              fontSize={8}
                              fill={color}
                              opacity={0.8}
                            >
                              {ref}
                            </text>
                          </g>
                        );
                      })}

                      {/* Trend line */}
                      <polyline
                        points={linePoints}
                        fill="none"
                        stroke="#C55A11"
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />

                      {/* Dots */}
                      {chartRows.map((r, i) => {
                        if (r.finalScore === null) return null;
                        const cx = xScale(i);
                        const cy = yScale(r.finalScore);
                        return (
                          <circle
                            key={r.scoreId}
                            cx={cx.toFixed(1)}
                            cy={cy.toFixed(1)}
                            r={3.5}
                            fill={dotColor(r.finalScore)}
                            stroke="white"
                            strokeWidth={1.5}
                          />
                        );
                      })}

                      {/* X axis labels */}
                      {chartRows.map((r, i) => {
                        if (!xLabelIndices.has(i)) return null;
                        const dateStr = r.examDate;
                        const mo = String(dateStr.getMonth() + 1).padStart(2, "0");
                        const dd = String(dateStr.getDate()).padStart(2, "0");
                        return (
                          <text
                            key={r.scoreId}
                            x={xScale(i).toFixed(1)}
                            y={chartH - 4}
                            textAnchor="middle"
                            fontSize={8.5}
                            fill="#6B7280"
                          >
                            {`${mo}/${dd}`}
                          </text>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Latest score annotation */}
                  {(() => {
                    const last = chartRows[chartRows.length - 1];
                    if (!last || last.finalScore === null) return null;
                    const prev = chartRows[chartRows.length - 2];
                    const diff =
                      prev && prev.finalScore !== null
                        ? last.finalScore - prev.finalScore
                        : null;
                    return (
                      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-ink/5 pt-4">
                        <div>
                          <p className="text-xs text-slate">최근 점수</p>
                          <p
                            className={`text-xl font-semibold ${
                              last.finalScore >= 80
                                ? "text-forest"
                                : last.finalScore >= 60
                                  ? "text-amber-600"
                                  : "text-ember"
                            }`}
                          >
                            {last.finalScore}점
                          </p>
                        </div>
                        {diff !== null && (
                          <div>
                            <p className="text-xs text-slate">전회 대비</p>
                            <p
                              className={`text-xl font-semibold ${
                                diff > 0
                                  ? "text-forest"
                                  : diff < 0
                                    ? "text-ember"
                                    : "text-slate"
                              }`}
                            >
                              {diff > 0 ? "+" : ""}
                              {diff.toFixed(1)}점
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-slate">표시 회차</p>
                          <p className="text-xl font-semibold text-ink">{chartRows.length}회</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </section>
            );
          })()}

          {/* ── 시각적 바 차트 ────────────────────────────────────────── */}
          <section className="mt-8">
            <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-ink">
                  회차별 점수 추이
                  {selectedSubject && (
                    <span className="ml-2 text-sm font-normal text-slate">
                      — {SUBJECT_LABEL[selectedSubject] ?? selectedSubject}
                    </span>
                  )}
                </h2>
                <div className="flex gap-3 text-xs text-slate">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-4 rounded-full bg-forest/60" />
                    80점 이상
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-4 rounded-full bg-amber-400" />
                    60~79점
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-4 rounded-full bg-ember/60" />
                    60점 미만
                  </span>
                </div>
              </div>

              <div className="mt-6 space-y-2">
                {trendRows.map((row) => {
                  const score = row.finalScore;
                  const isAbsent = row.attendType === AttendType.ABSENT;
                  const isExcused = row.attendType === AttendType.EXCUSED;
                  const hasScore = score !== null && !isAbsent;

                  const barWidth = hasScore
                    ? Math.round((score / maxFinalScore) * 100)
                    : 0;
                  const barColor =
                    !hasScore
                      ? "bg-ink/10"
                      : score >= 80
                        ? "bg-forest/60"
                        : score >= 60
                          ? "bg-amber-400"
                          : "bg-ember/60";

                  const subjectLabel =
                    row.displaySubjectName?.trim() ||
                    (SUBJECT_LABEL[row.subject] ?? row.subject);

                  return (
                    <div key={row.scoreId} className="flex items-center gap-3">
                      {/* 날짜 + 과목 */}
                      <div className="w-44 shrink-0">
                        <p className="text-xs font-mono text-slate">
                          {formatDate(row.examDate)}
                        </p>
                        {!selectedSubject && (
                          <p className="text-[10px] text-slate/70">{subjectLabel}</p>
                        )}
                      </div>

                      {/* 바 */}
                      <div className="flex-1 overflow-hidden rounded-full bg-ink/5">
                        {isAbsent ? (
                          <div className="flex h-7 items-center px-3">
                            <span className="text-[10px] font-semibold text-red-400">
                              무단 결시
                            </span>
                          </div>
                        ) : isExcused && score === null ? (
                          <div className="flex h-7 items-center px-3">
                            <span className="text-[10px] font-semibold text-amber-600">
                              사유 결시
                            </span>
                          </div>
                        ) : (
                          <div
                            className={`h-7 rounded-full transition-all ${barColor}`}
                            style={{ width: `${Math.max(barWidth, hasScore ? 2 : 0)}%` }}
                          />
                        )}
                      </div>

                      {/* 점수 */}
                      <div className="w-16 shrink-0 text-right">
                        {hasScore ? (
                          <span
                            className={`font-semibold ${
                              score >= 80
                                ? "text-forest"
                                : score >= 60
                                  ? "text-amber-600"
                                  : "text-ember"
                            }`}
                          >
                            {score}점
                          </span>
                        ) : (
                          <span className="text-xs text-slate">—</span>
                        )}
                      </div>

                      {/* 순위 */}
                      <div className="w-20 shrink-0 text-right text-xs text-slate">
                        {row.rank !== null && row.total !== null ? (
                          <span>
                            {row.rank}위/{row.total}
                          </span>
                        ) : (
                          "—"
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── 월별 평균 ─────────────────────────────────────────────── */}
          {monthlyAverages.size > 0 && (
            <section className="mt-8">
              <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
                <h2 className="text-base font-semibold text-ink">월별 평균 점수</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {Array.from(monthlyAverages.entries())
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, avg]) => (
                      <div
                        key={key}
                        className="rounded-[20px] border border-ink/5 bg-mist p-4"
                      >
                        <p className="text-xs text-slate">{formatMonthLabel(key)}</p>
                        <p
                          className={`mt-2 text-2xl font-semibold ${
                            avg >= 80
                              ? "text-forest"
                              : avg >= 60
                                ? "text-amber-600"
                                : "text-ember"
                          }`}
                        >
                          {avg}점
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            </section>
          )}

          {/* ── 상세 테이블 ───────────────────────────────────────────── */}
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate">
                성적 상세 이력
              </h2>
              <span className="text-xs text-slate">총 {trendRows.length}회차</span>
            </div>
            <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-ink/10">
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                        시험일
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                        기수
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                        주차
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                        과목
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                        출결
                      </th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                        점수
                      </th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                        순위
                      </th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                        상위 %
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                        추이 바
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {trendRows.map((row) => {
                      const score = row.finalScore;
                      const isAbsent = row.attendType === AttendType.ABSENT;
                      const hasScore = score !== null && !isAbsent;
                      const barWidth = hasScore
                        ? Math.round((score / maxFinalScore) * 100)
                        : 0;
                      const barColor =
                        !hasScore
                          ? "bg-ink/10"
                          : score >= 80
                            ? "bg-forest/60"
                            : score >= 60
                              ? "bg-amber-400"
                              : "bg-ember/60";
                      const subjectLabel =
                        row.displaySubjectName?.trim() ||
                        (SUBJECT_LABEL[row.subject] ?? row.subject);

                      return (
                        <tr key={row.scoreId} className="transition hover:bg-mist/40">
                          <td className="px-6 py-3 font-mono text-xs text-ink">
                            {formatDate(row.examDate)}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate">
                            {row.periodName}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate">
                            {row.week}주차
                          </td>
                          <td className="px-4 py-3 text-sm text-ink">{subjectLabel}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ATTEND_TYPE_COLOR[row.attendType]}`}
                            >
                              {ATTEND_TYPE_LABEL[row.attendType]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {hasScore ? (
                              <span
                                className={`font-semibold ${
                                  score >= 80
                                    ? "text-forest"
                                    : score >= 60
                                      ? "text-amber-600"
                                      : "text-ember"
                                }`}
                              >
                                {score}점
                              </span>
                            ) : (
                              <span className="text-slate">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-slate">
                            {row.rank !== null && row.total !== null ? (
                              <span className="font-semibold text-ink">
                                {row.rank}위
                                <span className="font-normal text-slate">
                                  /{row.total}
                                </span>
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs">
                            {row.percentileFromTop !== null ? (
                              <span
                                className={
                                  row.percentileFromTop <= 10
                                    ? "font-semibold text-forest"
                                    : row.percentileFromTop <= 30
                                      ? "text-forest"
                                      : row.percentileFromTop <= 60
                                        ? "text-ink"
                                        : "text-slate"
                                }
                              >
                                {row.percentileFromTop}%
                              </span>
                            ) : (
                              <span className="text-slate">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="w-24 overflow-hidden rounded-full bg-ink/5">
                              <div
                                className={`h-4 rounded-full ${barColor}`}
                                style={{
                                  width: `${Math.max(barWidth, hasScore ? 2 : 0)}%`,
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
