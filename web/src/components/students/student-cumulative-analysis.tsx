"use client";

import Link from "next/link";
import { Subject, StudentStatus } from "@/generated/prisma";
import { SUBJECT_LABEL, ATTEND_TYPE_LABEL } from "@/lib/constants";
import { TrendLineChart, BarComparisonChart, RadarComparisonChart } from "@/components/analytics/charts";
import type { CumulativeAnalysisData } from "@/lib/analytics/analysis";

const STATUS_LABEL: Record<StudentStatus, string> = {
  NORMAL: "정상",
  WARNING_1: "1차 경고",
  WARNING_2: "2차 경고",
  DROPOUT: "탈락",
};

const STATUS_CLASS: Record<StudentStatus, string> = {
  NORMAL: "border-green-200 bg-green-50 text-green-700",
  WARNING_1: "border-yellow-300 bg-yellow-50 text-yellow-700",
  WARNING_2: "border-orange-300 bg-orange-50 text-orange-700",
  DROPOUT: "border-red-300 bg-red-50 text-red-700",
};

const SUBJECT_COLORS: Record<string, string> = {
  CONSTITUTIONAL_LAW: "#EA580C",
  CRIMINAL_LAW: "#2563EB",
  CRIMINAL_PROCEDURE: "#0F766E",
  POLICE_SCIENCE: "#7C3AED",
  CRIMINOLOGY: "#D97706",
  CUMULATIVE: "#64748B",
};

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") return <span className="text-green-600 font-bold">↑</span>;
  if (trend === "down") return <span className="text-red-500 font-bold">↓</span>;
  return <span className="text-slate-400">—</span>;
}

type Props = {
  data: CumulativeAnalysisData;
};

export function StudentCumulativeAnalysis({ data }: Props) {
  const { student, periods, trend, subjectStats, statusHistory, totalSessions, attendedCount, overallAvg, attendanceRate, bestPeriod } = data;

  // Build trend chart data grouped by subject
  const trendBySubject = new Map<Subject, { label: string; score: number | null }[]>();
  for (const entry of trend) {
    const list = trendBySubject.get(entry.subject) ?? [];
    list.push({ label: entry.label, score: entry.finalScore });
    trendBySubject.set(entry.subject, list);
  }

  // Build all unique labels for the trend chart (date-based)
  const uniqueLabels = Array.from(new Set(trend.map((t) => t.label)));

  // Build trend chart data: each row has label + one key per subject
  const trendChartData = uniqueLabels.map((label) => {
    const row: Record<string, string | number | null> = { label };
    for (const subject of Array.from(trendBySubject.keys())) {
      const entry = trend.find((t) => t.label === label && t.subject === subject);
      row[subject] = entry?.finalScore ?? null;
    }
    return row;
  });

  const trendLines = Array.from(trendBySubject.keys()).map((subject) => ({
    dataKey: subject,
    color: SUBJECT_COLORS[subject] ?? "#94A3B8",
    name: SUBJECT_LABEL[subject],
  }));

  // Period comparison bar data
  const periodBarData = periods.map((p) => ({
    label: p.name.length > 6 ? p.name.slice(0, 6) + "…" : p.name,
    평균: p.avg ?? 0,
  }));

  // Radar data (cumulative averages vs targets)
  const radarData = subjectStats
    .filter((s) => s.sessionCount > 0)
    .map((s) => ({
      subject: s.subject,
      studentAverage: s.avg ?? 0,
      cohortAverage: 0,
      targetScore: s.target ?? 0,
    }));

  const weakStats = subjectStats.filter((s) => s.isWeak);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            누적 성적 분석
          </div>
          <h2 className="mt-4 text-2xl font-semibold">
            {student.name}
            <span className="ml-2 text-lg font-normal text-slate">({student.examNumber})</span>
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate">
            {student.className && <span>{student.className}</span>}
            {student.generation && <span>{student.generation}기</span>}
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[student.currentStatus]}`}
            >
              {STATUS_LABEL[student.currentStatus]}
            </span>
            {!student.isActive && (
              <span className="rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold text-slate">
                비활성
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
                    prefetch={false}
                    href={`/admin/students/${student.examNumber}?tab=history`}
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            성적 이력
          </Link>
          <Link
                    prefetch={false}
                    href={`/admin/students/${student.examNumber}?tab=analysis`}
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            기간별 분석
          </Link>
          <Link
                    prefetch={false}
                    href={`/admin/students/${student.examNumber}?tab=counseling`}
            className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest"
          >
            면담
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">총 응시 횟수</p>
          <p className="mt-2 text-3xl font-bold">{attendedCount}<span className="ml-1 text-base font-normal text-slate">/ {totalSessions}회</span></p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">전체 평균</p>
          <p className="mt-2 text-3xl font-bold">
            {overallAvg !== null ? overallAvg.toFixed(1) : "-"}
            <span className="ml-1 text-base font-normal text-slate">점</span>
          </p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">출결률</p>
          <p className="mt-2 text-3xl font-bold">
            {attendanceRate.toFixed(1)}
            <span className="ml-1 text-base font-normal text-slate">%</span>
          </p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">최고 성적 기간</p>
          <p className="mt-2 text-xl font-bold leading-tight">
            {bestPeriod ? (
              <>
                {bestPeriod.name}
                <span className="ml-2 text-base font-normal text-slate">
                  ({bestPeriod.avg?.toFixed(1)}점)
                </span>
              </>
            ) : (
              <span className="text-slate text-base font-normal">데이터 없음</span>
            )}
          </p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h3 className="text-xl font-semibold">전체 성적 추이</h3>
          <p className="mt-1 text-xs text-slate">전체 기간에 걸친 과목별 점수 변화</p>
          <div className="mt-4">
            <TrendLineChart data={trendChartData} xKey="label" lines={trendLines} />
          </div>
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h3 className="text-xl font-semibold">기간별 평균 비교</h3>
          <p className="mt-1 text-xs text-slate">각 수강 기간의 평균 점수</p>
          <div className="mt-4">
            <BarComparisonChart
              data={periodBarData}
              xKey="label"
              bars={[{ dataKey: "평균", color: "#C55A11", name: "기간 평균" }]}
            />
          </div>
        </section>
      </div>

      {/* Radar chart */}
      {radarData.length > 0 && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h3 className="text-xl font-semibold">과목별 레이더 (누적 평균)</h3>
          <p className="mt-1 text-xs text-slate">전체 기간 누적 과목별 평균과 목표 점수 비교</p>
          <div className="mt-4">
            <RadarComparisonChart data={radarData} />
          </div>
        </section>
      )}

      {/* Subject stats table */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h3 className="text-xl font-semibold">과목별 누적 통계</h3>
        <div className="mt-6 overflow-x-auto rounded-[24px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">과목</th>
                <th className="px-4 py-3 font-semibold">응시</th>
                <th className="px-4 py-3 font-semibold">누적 평균</th>
                <th className="px-4 py-3 font-semibold">목표 점수</th>
                <th className="px-4 py-3 font-semibold">최고점</th>
                <th className="px-4 py-3 font-semibold">최저점</th>
                <th className="px-4 py-3 font-semibold">추이</th>
                <th className="px-4 py-3 font-semibold">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {subjectStats.map((row) => (
                <tr key={row.subject} className={row.isWeak ? "bg-red-50/40" : undefined}>
                  <td className="px-4 py-3 font-medium">{SUBJECT_LABEL[row.subject]}</td>
                  <td className="px-4 py-3">{row.scoredCount} / {row.sessionCount}회</td>
                  <td className="px-4 py-3 font-semibold">{row.avg !== null ? row.avg.toFixed(1) : "-"}</td>
                  <td className="px-4 py-3">{row.target ?? "-"}</td>
                  <td className="px-4 py-3">{row.highest ?? "-"}</td>
                  <td className="px-4 py-3">{row.lowest ?? "-"}</td>
                  <td className="px-4 py-3"><TrendIcon trend={row.trend} /></td>
                  <td className="px-4 py-3">
                    {row.isWeak ? (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                        목표 미달
                      </span>
                    ) : row.avg !== null ? (
                      <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                        달성
                      </span>
                    ) : (
                      <span className="text-slate text-xs">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Weak point analysis */}
      {weakStats.length > 0 && (
        <section className="rounded-[28px] border border-red-100 bg-red-50/30 p-6">
          <h3 className="flex items-center gap-2 text-xl font-semibold text-red-700">
            <span>취약점 분석</span>
          </h3>
          <p className="mt-1 text-sm text-red-600/80">목표 점수에 미달하는 과목입니다. 집중 학습이 필요합니다.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {weakStats.map((s) => (
              <div key={s.subject} className="rounded-[20px] border border-red-200 bg-white p-4">
                <p className="font-semibold text-red-700">{SUBJECT_LABEL[s.subject]}</p>
                <div className="mt-2 flex items-center gap-3 text-sm">
                  <div>
                    <span className="text-slate">현재 평균</span>
                    <p className="text-xl font-bold text-red-600">{s.avg?.toFixed(1) ?? "-"}</p>
                  </div>
                  <div className="text-slate/40 text-2xl">→</div>
                  <div>
                    <span className="text-slate">목표</span>
                    <p className="text-xl font-bold">{s.target ?? "-"}</p>
                  </div>
                </div>
                {s.avg !== null && s.target !== null && (
                  <p className="mt-2 text-xs text-red-500">
                    목표까지 {(s.target - s.avg).toFixed(1)}점 부족
                    {s.trend === "up" ? " · 상승 추세" : s.trend === "down" ? " · 하락 추세" : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Status history */}
      {statusHistory.length > 0 && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h3 className="text-xl font-semibold">상태 변화 이력</h3>
          <p className="mt-1 text-xs text-slate">주차별 출결 상태 추적 기록</p>
          <div className="mt-4 overflow-x-auto rounded-[24px] border border-ink/10">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">주차</th>
                  <th className="px-4 py-3 font-semibold">주간 시작</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {statusHistory.map((snap, i) => (
                  <tr
                    key={i}
                    className={
                      snap.status === "DROPOUT"
                        ? "bg-red-50/40"
                        : snap.status === "WARNING_2"
                        ? "bg-orange-50/30"
                        : snap.status === "WARNING_1"
                        ? "bg-yellow-50/30"
                        : undefined
                    }
                  >
                    <td className="px-4 py-3 font-medium">{snap.weekKey}</td>
                    <td className="px-4 py-3">
                      {new Date(snap.weekStartDate).toLocaleDateString("ko-KR", {
                        month: "numeric",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[snap.status]}`}>
                        {STATUS_LABEL[snap.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Score history table */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h3 className="text-xl font-semibold">전체 성적 이력</h3>
        <p className="mt-1 text-xs text-slate">모든 기간의 응시 기록</p>
        <div className="mt-4 overflow-x-auto rounded-[24px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">기간</th>
                <th className="px-4 py-3 font-semibold">날짜</th>
                <th className="px-4 py-3 font-semibold">주차</th>
                <th className="px-4 py-3 font-semibold">과목</th>
                <th className="px-4 py-3 font-semibold">점수</th>
                <th className="px-4 py-3 font-semibold">응시 유형</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {trend.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate">
                    성적 데이터가 없습니다.
                  </td>
                </tr>
              ) : null}
              {trend.map((entry, i) => (
                <tr
                  key={i}
                  className={
                    entry.finalScore === null
                      ? "opacity-50"
                      : undefined
                  }
                >
                  <td className="px-4 py-3 text-xs text-slate">{entry.periodName}</td>
                  <td className="px-4 py-3">
                    {new Date(entry.date).toLocaleDateString("ko-KR", {
                      month: "numeric",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">{entry.week}주차</td>
                  <td className="px-4 py-3">{SUBJECT_LABEL[entry.subject]}</td>
                  <td className="px-4 py-3 font-semibold">
                    {entry.finalScore !== null ? entry.finalScore : "-"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {entry.attendType ? (ATTEND_TYPE_LABEL[entry.attendType as keyof typeof ATTEND_TYPE_LABEL] ?? entry.attendType) : "미응시"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
