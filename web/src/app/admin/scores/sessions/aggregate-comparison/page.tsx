import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL, EXAM_TYPE_LABEL, getSubjectDisplayLabel } from "@/lib/constants";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { SessionSelector } from "./session-selector";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SessionStats = {
  sessionId: number;
  examDate: Date;
  subjectLabel: string;
  examTypeLabel: string;
  periodName: string;
  week: number;
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  stdDev: number | null;
  atRiskCount: number;
  passRate60: number | null;
  passRate70: number | null;
  passRate80: number | null;
  dist0_39: number;
  dist40_59: number;
  dist60_79: number;
  dist80plus: number;
};

function computeStats(scores: number[]): {
  avg: number | null;
  min: number | null;
  max: number | null;
  stdDev: number | null;
} {
  if (scores.length === 0) return { avg: null, min: null, max: null, stdDev: null };
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const variance =
    scores.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  return {
    avg: Math.round(avg * 10) / 10,
    min,
    max,
    stdDev: Math.round(stdDev * 10) / 10,
  };
}

function fmt1(v: number | null): string {
  return v === null ? "-" : String(v);
}

function pct(n: number, total: number): string {
  if (total === 0) return "-";
  return (Math.round((n / total) * 1000) / 10).toFixed(1) + "%";
}

function formatSessionDate(d: Date): string {
  return format(d, "MM/dd(E)", { locale: ko });
}

// Build CSV string from stats
function buildCsv(stats: SessionStats[]): string {
  const headers = [
    "세션ID",
    "시험일",
    "과목",
    "직렬",
    "기수",
    "주차",
    "응시자수",
    "평균",
    "최저",
    "최고",
    "표준편차",
    "위험(40미만)",
    "60+합격률",
    "70+합격률",
    "80+합격률",
    "0-39",
    "40-59",
    "60-79",
    "80+",
  ];
  const rows = stats.map((s) =>
    [
      s.sessionId,
      format(s.examDate, "yyyy-MM-dd"),
      s.subjectLabel,
      s.examTypeLabel,
      s.periodName,
      s.week,
      s.count,
      s.avg ?? "",
      s.min ?? "",
      s.max ?? "",
      s.stdDev ?? "",
      s.atRiskCount,
      s.passRate60 ?? "",
      s.passRate70 ?? "",
      s.passRate80 ?? "",
      s.dist0_39,
      s.dist40_59,
      s.dist60_79,
      s.dist80plus,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

export default async function AggregateComparisonPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const sp = await searchParams;
  const sessionsParam = typeof sp.sessions === "string" ? sp.sessions.trim() : "";
  const examTypeFilter = typeof sp.examType === "string" ? sp.examType.trim() : "";

  const prisma = getPrisma();

  // Fetch all sessions for selector + default last 6
  const allSessions = await prisma.examSession.findMany({
    where: { isCancelled: false },
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
    take: 200,
    select: {
      id: true,
      examType: true,
      subject: true,
      displaySubjectName: true,
      examDate: true,
      week: true,
      period: { select: { id: true, name: true } },
      _count: { select: { scores: true } },
    },
  });

  // Determine which session IDs to compare
  let selectedIds: number[] = [];
  if (sessionsParam) {
    selectedIds = sessionsParam
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n))
      .slice(0, 6);
  }

  // Default: last 6 sessions of same examType (or all if no filter)
  if (selectedIds.length === 0) {
    const candidates = examTypeFilter
      ? allSessions.filter((s) => s.examType === examTypeFilter)
      : allSessions;
    selectedIds = candidates.slice(0, 6).map((s) => s.id);
  }

  // Fetch score data for selected sessions
  const sessionDataList = await Promise.all(
    selectedIds.map(async (sessionId) => {
      const sessionInfo = await prisma.examSession.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          examType: true,
          subject: true,
          displaySubjectName: true,
          examDate: true,
          week: true,
          isCancelled: true,
          period: { select: { name: true } },
        },
      });
      if (!sessionInfo || sessionInfo.isCancelled) return null;

      const scores = await prisma.score.findMany({
        where: {
          sessionId,
          attendType: { in: ["NORMAL", "LIVE"] },
          finalScore: { not: null },
        },
        select: { finalScore: true },
      });

      const values = scores
        .map((s) => s.finalScore as number)
        .filter((v) => v !== null && v !== undefined);

      const { avg, min, max, stdDev } = computeStats(values);
      const atRiskCount = values.filter((v) => v < 40).length;
      const passCount60 = values.filter((v) => v >= 60).length;
      const passCount70 = values.filter((v) => v >= 70).length;
      const passCount80 = values.filter((v) => v >= 80).length;

      const stats: SessionStats = {
        sessionId,
        examDate: sessionInfo.examDate,
        subjectLabel: getSubjectDisplayLabel(sessionInfo.subject, sessionInfo.displaySubjectName),
        examTypeLabel: EXAM_TYPE_LABEL[sessionInfo.examType] ?? sessionInfo.examType,
        periodName: sessionInfo.period.name,
        week: sessionInfo.week,
        count: values.length,
        avg,
        min,
        max,
        stdDev,
        atRiskCount,
        passRate60: values.length > 0 ? Math.round((passCount60 / values.length) * 1000) / 10 : null,
        passRate70: values.length > 0 ? Math.round((passCount70 / values.length) * 1000) / 10 : null,
        passRate80: values.length > 0 ? Math.round((passCount80 / values.length) * 1000) / 10 : null,
        dist0_39: values.filter((v) => v < 40).length,
        dist40_59: values.filter((v) => v >= 40 && v < 60).length,
        dist60_79: values.filter((v) => v >= 60 && v < 80).length,
        dist80plus: values.filter((v) => v >= 80).length,
      };

      return stats;
    }),
  );

  const stats = sessionDataList.filter((s): s is SessionStats => s !== null);

  // Trend data: sort by date ascending for chart
  const trendData = [...stats].sort(
    (a, b) => a.examDate.getTime() - b.examDate.getTime(),
  );

  // SVG trend line chart (simple)
  const svgWidth = 600;
  const svgHeight = 160;
  const padL = 40;
  const padR = 20;
  const padT = 16;
  const padB = 32;
  const chartW = svgWidth - padL - padR;
  const chartH = svgHeight - padT - padB;

  const trendAvgs = trendData.map((s) => s.avg);
  const validAvgs = trendAvgs.filter((v): v is number => v !== null);
  const trendMin = validAvgs.length > 0 ? Math.min(...validAvgs) : 0;
  const trendMax = validAvgs.length > 0 ? Math.max(...validAvgs) : 100;
  const yRange = trendMax - trendMin || 10;

  function toX(i: number): number {
    if (trendData.length <= 1) return padL + chartW / 2;
    return padL + (i / (trendData.length - 1)) * chartW;
  }
  function toY(v: number): number {
    return padT + chartH - ((v - trendMin) / yRange) * chartH;
  }

  const points = trendData
    .map((s, i) => (s.avg !== null ? `${toX(i)},${toY(s.avg)}` : null))
    .filter(Boolean)
    .join(" ");

  // CSV export URL (encoded as data URL approach — actually we use a client component for that)
  // We pass stats as serialized to the export button
  const csvData = buildCsv(stats);
  const csvBase64 = Buffer.from("\uFEFF" + csvData).toString("base64");

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "성적 관리", href: "/admin/scores" },
          { label: "시험 세션 목록", href: "/admin/scores/sessions" },
          { label: "세션 비교 분석" },
        ]}
      />

      <div className="mt-4">
        <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
          성적 분석
        </div>
        <h1 className="mt-3 text-3xl font-semibold">세션 비교 분석</h1>
        <p className="mt-2 text-sm text-slate">
          최대 6개 시험 세션의 주요 지표를 나란히 비교합니다.
          검색 파라미터로 세션을 선택하거나 기본값(최근 6개)을 사용하세요.
        </p>
      </div>

      {/* 세션 선택기 */}
      <div className="mt-8">
        <SessionSelector
          allSessions={allSessions.map((s) => ({
            id: s.id,
            label: `${format(s.examDate, "MM/dd")} ${getSubjectDisplayLabel(s.subject, s.displaySubjectName)} (${s.period.name})`,
            examType: s.examType,
            hasScores: s._count.scores > 0,
          }))}
          selectedIds={selectedIds}
          examTypeFilter={examTypeFilter}
        />
      </div>

      {stats.length === 0 ? (
        <div className="mt-10 rounded-[28px] border border-dashed border-ink/10 p-12 text-center text-sm text-slate">
          비교할 세션이 없습니다. 성적이 입력된 세션을 선택해 주세요.
        </div>
      ) : (
        <>
          {/* ── 지표 비교 테이블 ─────────────────────────────────── */}
          <section className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate">
                지표 비교 ({stats.length}개 세션)
              </h2>
              {/* CSV 내보내기 */}
              <a
                href={`data:text/csv;charset=utf-8;base64,${csvBase64}`}
                download={`score-comparison-${format(new Date(), "yyyyMMdd")}.csv`}
                className="inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink"
              >
                CSV 내보내기
              </a>
            </div>

            <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/60">
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate whitespace-nowrap">
                      지표
                    </th>
                    {stats.map((s) => (
                      <th
                        key={s.sessionId}
                        className="px-4 py-4 text-center text-xs font-semibold text-ink whitespace-nowrap"
                      >
                        <div className="font-semibold">{formatSessionDate(s.examDate)}</div>
                        <div className="mt-0.5 text-slate font-normal truncate max-w-[120px]">
                          {s.subjectLabel}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate/70">{s.periodName}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {/* 직렬 */}
                  <MetricRow label="직렬" values={stats.map((s) => s.examTypeLabel)} />
                  {/* 주차 */}
                  <MetricRow label="주차" values={stats.map((s) => `${s.week}주`)} />
                  {/* 응시자수 */}
                  <MetricRow label="응시자 수" values={stats.map((s) => `${s.count}명`)} />
                  {/* 평균 */}
                  <tr className="hover:bg-mist/40">
                    <td className="px-5 py-3.5 text-xs font-semibold text-slate whitespace-nowrap">
                      평균 점수
                    </td>
                    {stats.map((s) => (
                      <td key={s.sessionId} className="px-4 py-3.5 text-center">
                        <span
                          className={`text-base font-bold ${
                            s.avg === null
                              ? "text-slate"
                              : s.avg >= 70
                                ? "text-forest"
                                : s.avg >= 60
                                  ? "text-amber-600"
                                  : "text-red-600"
                          }`}
                        >
                          {s.avg !== null ? `${s.avg}점` : "-"}
                        </span>
                      </td>
                    ))}
                  </tr>
                  {/* 최저 */}
                  <MetricRow label="최저 점수" values={stats.map((s) => fmt1(s.min) + (s.min !== null ? "점" : ""))} />
                  {/* 최고 */}
                  <MetricRow label="최고 점수" values={stats.map((s) => fmt1(s.max) + (s.max !== null ? "점" : ""))} />
                  {/* 표준편차 */}
                  <MetricRow label="표준편차" values={stats.map((s) => fmt1(s.stdDev))} />
                  {/* 위험 */}
                  <tr className="hover:bg-mist/40 bg-red-50/30">
                    <td className="px-5 py-3.5 text-xs font-semibold text-red-700 whitespace-nowrap">
                      위험 인원 (40미만)
                    </td>
                    {stats.map((s) => (
                      <td key={s.sessionId} className="px-4 py-3.5 text-center">
                        <span className={`font-semibold ${s.atRiskCount > 0 ? "text-red-600" : "text-slate"}`}>
                          {s.atRiskCount}명
                        </span>
                        {s.count > 0 && (
                          <span className="ml-1 text-xs text-slate">
                            ({pct(s.atRiskCount, s.count)})
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                  {/* 합격률 60+ */}
                  <tr className="hover:bg-mist/40">
                    <td className="px-5 py-3.5 text-xs font-semibold text-slate whitespace-nowrap">
                      합격률 (60+)
                    </td>
                    {stats.map((s) => (
                      <td key={s.sessionId} className="px-4 py-3.5 text-center">
                        <span className={`font-semibold ${(s.passRate60 ?? 0) >= 70 ? "text-forest" : "text-amber-600"}`}>
                          {s.passRate60 !== null ? `${s.passRate60}%` : "-"}
                        </span>
                      </td>
                    ))}
                  </tr>
                  {/* 합격률 70+ */}
                  <tr className="hover:bg-mist/40">
                    <td className="px-5 py-3.5 text-xs font-semibold text-slate whitespace-nowrap">
                      합격률 (70+)
                    </td>
                    {stats.map((s) => (
                      <td key={s.sessionId} className="px-4 py-3.5 text-center">
                        <span className="font-semibold text-ink">
                          {s.passRate70 !== null ? `${s.passRate70}%` : "-"}
                        </span>
                      </td>
                    ))}
                  </tr>
                  {/* 합격률 80+ */}
                  <tr className="hover:bg-mist/40">
                    <td className="px-5 py-3.5 text-xs font-semibold text-slate whitespace-nowrap">
                      합격률 (80+)
                    </td>
                    {stats.map((s) => (
                      <td key={s.sessionId} className="px-4 py-3.5 text-center">
                        <span className="font-semibold text-forest">
                          {s.passRate80 !== null ? `${s.passRate80}%` : "-"}
                        </span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ── 점수 분포 ────────────────────────────────────────── */}
          <section className="mt-10">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
              점수 분포
            </h2>
            <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/60">
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      구간
                    </th>
                    {stats.map((s) => (
                      <th
                        key={s.sessionId}
                        className="px-4 py-4 text-center text-xs font-semibold text-ink whitespace-nowrap"
                      >
                        {formatSessionDate(s.examDate)}
                        <div className="text-[10px] font-normal text-slate">{s.subjectLabel}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  <DistRow
                    label="0–39점"
                    colorClass="text-red-600"
                    values={stats.map((s) => ({ count: s.dist0_39, total: s.count }))}
                  />
                  <DistRow
                    label="40–59점"
                    colorClass="text-amber-600"
                    values={stats.map((s) => ({ count: s.dist40_59, total: s.count }))}
                  />
                  <DistRow
                    label="60–79점"
                    colorClass="text-ink"
                    values={stats.map((s) => ({ count: s.dist60_79, total: s.count }))}
                  />
                  <DistRow
                    label="80점+"
                    colorClass="text-forest"
                    values={stats.map((s) => ({ count: s.dist80plus, total: s.count }))}
                  />
                </tbody>
              </table>
            </div>
          </section>

          {/* ── 트렌드 차트 ──────────────────────────────────────── */}
          <section className="mt-10">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
              평균 점수 추이
            </h2>
            <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel p-6">
              {trendData.length < 2 ? (
                <p className="text-sm text-slate text-center py-6">
                  추이 차트는 2개 이상 세션이 필요합니다.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <svg
                    width={svgWidth}
                    height={svgHeight}
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    className="w-full max-w-3xl"
                    aria-label="평균 점수 추이 차트"
                  >
                    {/* Y 격자선 */}
                    {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                      const y = padT + chartH * (1 - t);
                      const v = trendMin + yRange * t;
                      return (
                        <g key={t}>
                          <line
                            x1={padL}
                            y1={y}
                            x2={svgWidth - padR}
                            y2={y}
                            stroke="#e5e7eb"
                            strokeWidth={1}
                          />
                          <text x={padL - 4} y={y + 4} textAnchor="end" fontSize={10} fill="#6B7280">
                            {Math.round(v)}
                          </text>
                        </g>
                      );
                    })}
                    {/* X 축 레이블 */}
                    {trendData.map((s, i) => (
                      <text
                        key={s.sessionId}
                        x={toX(i)}
                        y={svgHeight - 4}
                        textAnchor="middle"
                        fontSize={9}
                        fill="#6B7280"
                      >
                        {format(s.examDate, "MM/dd")}
                      </text>
                    ))}
                    {/* 라인 */}
                    {points && (
                      <polyline
                        points={points}
                        fill="none"
                        stroke="#C55A11"
                        strokeWidth={2.5}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    )}
                    {/* 포인트 */}
                    {trendData.map((s, i) =>
                      s.avg !== null ? (
                        <g key={s.sessionId}>
                          <circle
                            cx={toX(i)}
                            cy={toY(s.avg)}
                            r={5}
                            fill="white"
                            stroke="#C55A11"
                            strokeWidth={2}
                          />
                          <text
                            x={toX(i)}
                            y={toY(s.avg) - 9}
                            textAnchor="middle"
                            fontSize={10}
                            fontWeight="600"
                            fill="#C55A11"
                          >
                            {s.avg}
                          </text>
                        </g>
                      ) : null,
                    )}
                  </svg>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-3">
                {trendData.map((s) => (
                  <Link
                    key={s.sessionId}
                    href={`/admin/scores/sessions/${s.sessionId}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-mist/60 px-3 py-1 text-xs font-medium text-slate transition hover:border-ember/30 hover:text-ember"
                  >
                    {formatSessionDate(s.examDate)} {s.subjectLabel}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ── 공통 행 컴포넌트 ──────────────────────────────────────────────────────

function MetricRow({ label, values }: { label: string; values: string[] }) {
  return (
    <tr className="hover:bg-mist/40">
      <td className="px-5 py-3.5 text-xs font-semibold text-slate whitespace-nowrap">
        {label}
      </td>
      {values.map((v, i) => (
        <td key={i} className="px-4 py-3.5 text-center text-sm text-ink">
          {v || "-"}
        </td>
      ))}
    </tr>
  );
}

function DistRow({
  label,
  colorClass,
  values,
}: {
  label: string;
  colorClass: string;
  values: Array<{ count: number; total: number }>;
}) {
  return (
    <tr className="hover:bg-mist/40">
      <td className={`px-5 py-3.5 text-xs font-semibold whitespace-nowrap ${colorClass}`}>
        {label}
      </td>
      {values.map((v, i) => (
        <td key={i} className="px-4 py-3.5 text-center text-sm">
          <span className={`font-semibold ${colorClass}`}>{v.count}명</span>
          {v.total > 0 && (
            <span className="ml-1 text-xs text-slate">({pct(v.count, v.total)})</span>
          )}
        </td>
      ))}
    </tr>
  );
}
