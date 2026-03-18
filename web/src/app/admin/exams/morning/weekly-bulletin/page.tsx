import { AdminRole, AttendType, Subject } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL } from "@/lib/constants";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateKR(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

export default async function WeeklyBulletinPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);
  const prisma = getPrisma();

  const resolvedParams = searchParams ? await searchParams : {};

  // Determine selected week start
  let weekStartDate: Date;
  const weekParam = Array.isArray(resolvedParams.weekStart)
    ? resolvedParams.weekStart[0]
    : resolvedParams.weekStart;

  if (weekParam) {
    weekStartDate = new Date(weekParam + "T00:00:00");
    if (isNaN(weekStartDate.getTime())) {
      weekStartDate = getWeekStart(new Date());
    }
  } else {
    // Find most recent week that has sessions
    const latestSession = await prisma.examSession.findFirst({
      where: { isCancelled: false },
      orderBy: { examDate: "desc" },
      select: { examDate: true },
    });
    weekStartDate = latestSession
      ? getWeekStart(latestSession.examDate)
      : getWeekStart(new Date());
  }

  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  weekEndDate.setHours(23, 59, 59, 999);

  // Load sessions within the selected week
  const sessions = await prisma.examSession.findMany({
    where: {
      examDate: { gte: weekStartDate, lte: weekEndDate },
      isCancelled: false,
    },
    select: {
      id: true,
      examType: true,
      subject: true,
      displaySubjectName: true,
      examDate: true,
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

  // Aggregate stats
  const validAttendTypes = [AttendType.NORMAL, AttendType.LIVE] as AttendType[];
  const absentTypes = [AttendType.ABSENT, AttendType.EXCUSED] as AttendType[];

  let totalPresent = 0;
  let totalAbsent = 0;
  let allPresentScores: { examNumber: string; score: number }[] = [];

  // Per-subject aggregation
  const subjectMap = new Map<
    Subject,
    { label: string; scores: number[]; present: number; absent: number }
  >();

  for (const session of sessions) {
    for (const sc of session.scores) {
      if (validAttendTypes.includes(sc.attendType)) {
        totalPresent++;
        const score = sc.finalScore ?? sc.rawScore;
        if (score !== null && score !== undefined) {
          allPresentScores.push({ examNumber: sc.examNumber, score });

          const existing = subjectMap.get(session.subject) ?? {
            label:
              session.displaySubjectName?.trim() ||
              SUBJECT_LABEL[session.subject] ||
              session.subject,
            scores: [],
            present: 0,
            absent: 0,
          };
          existing.scores.push(score);
          existing.present++;
          subjectMap.set(session.subject, existing);
        }
      } else if (absentTypes.includes(sc.attendType)) {
        totalAbsent++;
        const existing = subjectMap.get(session.subject) ?? {
          label:
            session.displaySubjectName?.trim() ||
            SUBJECT_LABEL[session.subject] ||
            session.subject,
          scores: [],
          present: 0,
          absent: 0,
        };
        existing.absent++;
        subjectMap.set(session.subject, existing);
      }
    }
  }

  const overallAvg =
    allPresentScores.length > 0
      ? Math.round(
          (allPresentScores.reduce((a, b) => a + b.score, 0) /
            allPresentScores.length) *
            10,
        ) / 10
      : null;

  const topScore =
    allPresentScores.length > 0
      ? Math.max(...allPresentScores.map((s) => s.score))
      : null;

  // Per-student weekly avg
  const studentScoreMap = new Map<string, number[]>();
  for (const { examNumber, score } of allPresentScores) {
    const arr = studentScoreMap.get(examNumber) ?? [];
    arr.push(score);
    studentScoreMap.set(examNumber, arr);
  }

  const studentAvgs: { examNumber: string; avg: number }[] = [];
  for (const [examNumber, scores] of studentScoreMap) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    studentAvgs.push({ examNumber, avg: Math.round(avg * 10) / 10 });
  }
  studentAvgs.sort((a, b) => b.avg - a.avg);

  const top5ExamNumbers = studentAvgs.slice(0, 5).map((s) => s.examNumber);
  const atRiskExamNumbers = studentAvgs
    .filter((s) => s.avg < 60)
    .map((s) => s.examNumber);

  // Fetch student names
  const allFetchNums = [
    ...new Set([...top5ExamNumbers, ...atRiskExamNumbers]),
  ];
  const studentDetails =
    allFetchNums.length > 0
      ? await prisma.student.findMany({
          where: { examNumber: { in: allFetchNums } },
          select: { examNumber: true, name: true },
        })
      : [];
  const studentNameMap = new Map(
    studentDetails.map((s) => [s.examNumber, s.name]),
  );

  const top5 = studentAvgs.slice(0, 5).map((s, i) => ({
    rank: i + 1,
    examNumber: s.examNumber,
    name: studentNameMap.get(s.examNumber) ?? "-",
    avg: s.avg,
  }));

  const atRisk = studentAvgs
    .filter((s) => s.avg < 60)
    .map((s) => ({
      examNumber: s.examNumber,
      name: studentNameMap.get(s.examNumber) ?? "-",
      avg: s.avg,
    }));

  // Subject rows
  const subjectRows = [...subjectMap.entries()].map(([subject, data]) => {
    const avg =
      data.scores.length > 0
        ? Math.round(
            (data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 10,
          ) / 10
        : null;
    // Mini distribution: 5 buckets
    const counts = {
      s90: data.scores.filter((v) => v >= 90).length,
      s80: data.scores.filter((v) => v >= 80 && v < 90).length,
      s70: data.scores.filter((v) => v >= 70 && v < 80).length,
      s60: data.scores.filter((v) => v >= 60 && v < 70).length,
      sBelow60: data.scores.filter((v) => v < 60).length,
    };
    return {
      subject,
      label: data.label,
      avg,
      present: data.present,
      absent: data.absent,
      counts,
    };
  });
  subjectRows.sort((a, b) => a.label.localeCompare(b.label, "ko"));

  const weekLabel = `${formatDateKR(weekStartDate)} ~ ${formatDateKR(weekEndDate)}`;

  return (
    <div className="p-8 sm:p-10">
      {/* Header — hidden on print */}
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            아침 모의고사
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">주간 성적 현황 보고</h1>
          <p className="mt-4 max-w-2xl text-sm leading-8 text-slate">
            선택한 주간의 전체 성적 현황을 확인하고 인쇄합니다.
          </p>
        </div>
        <PrintButton />
      </div>

      {/* Week Selector — hidden on print */}
      <form method="get" className="mt-8 print:hidden">
        <div className="flex flex-wrap items-end gap-3 rounded-[28px] border border-ink/10 bg-mist p-6">
          <div>
            <label
              htmlFor="weekStart"
              className="mb-2 block text-sm font-medium text-ink"
            >
              주차 선택 (월요일 기준)
            </label>
            <input
              type="date"
              id="weekStart"
              name="weekStart"
              defaultValue={isoDate(weekStartDate)}
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

      {/* ─── Printable Area ──────────────────────────────── */}
      <div className="mt-8 space-y-8">
        {/* Print Header */}
        <div className="hidden print:block">
          <h2 className="text-2xl font-bold text-ink">
            주간 성적 현황 보고 — {weekLabel}
          </h2>
          <p className="mt-1 text-sm text-slate">한국경찰학원</p>
          <hr className="mt-4 border-ink/10" />
        </div>

        {/* Week range badge — visible screen */}
        <div className="flex items-center gap-3 print:hidden">
          <span className="rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-semibold text-ink">
            {weekLabel}
          </span>
          {sessions.length === 0 && (
            <span className="text-sm text-slate">이 주에 등록된 회차가 없습니다.</span>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-slate">
            선택한 주간에 등록된 시험 회차가 없습니다. 다른 주를 선택해 주세요.
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate">
                  총 응시
                </p>
                <p className="mt-3 text-3xl font-bold text-ink">{totalPresent}</p>
                <p className="mt-1 text-xs text-slate">건</p>
              </div>
              <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate">
                  평균 점수
                </p>
                {overallAvg !== null ? (
                  <p className="mt-3 text-3xl font-bold text-forest">{overallAvg}점</p>
                ) : (
                  <p className="mt-3 text-3xl font-bold text-ink/25">—</p>
                )}
                <p className="mt-1 text-xs text-slate">전 과목·직렬 통합</p>
              </div>
              <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate">
                  최고 점수
                </p>
                {topScore !== null ? (
                  <p className="mt-3 text-3xl font-bold text-ember">{topScore}점</p>
                ) : (
                  <p className="mt-3 text-3xl font-bold text-ink/25">—</p>
                )}
                <p className="mt-1 text-xs text-slate">응시자 중 최고</p>
              </div>
              <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate">
                  미응시
                </p>
                <p className="mt-3 text-3xl font-bold text-red-600">{totalAbsent}</p>
                <p className="mt-1 text-xs text-slate">무단·공결</p>
              </div>
            </div>

            {/* Subject Table */}
            <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
              <div className="border-b border-ink/10 px-6 py-4">
                <h2 className="text-base font-semibold text-ink">과목별 성적 현황</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 bg-mist">
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">과목</th>
                      <th className="px-4 py-3 text-right font-semibold text-ink/60">응시</th>
                      <th className="px-4 py-3 text-right font-semibold text-ink/60">결석</th>
                      <th className="px-4 py-3 text-right font-semibold text-ink/60">평균</th>
                      <th className="px-4 py-3 font-semibold text-ink/60">분포</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {subjectRows.map((row) => {
                      const total =
                        row.counts.s90 +
                        row.counts.s80 +
                        row.counts.s70 +
                        row.counts.s60 +
                        row.counts.sBelow60;
                      return (
                        <tr key={row.subject} className="hover:bg-mist/60">
                          <td className="px-4 py-3 font-medium text-ink">{row.label}</td>
                          <td className="px-4 py-3 text-right font-mono text-forest">
                            {row.present}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-red-500">
                            {row.absent}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-ink">
                            {row.avg !== null ? `${row.avg}점` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {total > 0 ? (
                              <div className="flex h-3 w-32 overflow-hidden rounded-full">
                                {[
                                  { c: row.counts.s90, color: "#1F4D3A" },
                                  { c: row.counts.s80, color: "#4ADE80" },
                                  { c: row.counts.s70, color: "#FCD34D" },
                                  { c: row.counts.s60, color: "#FB923C" },
                                  { c: row.counts.sBelow60, color: "#C55A11" },
                                ]
                                  .filter((seg) => seg.c > 0)
                                  .map((seg, i) => (
                                    <div
                                      key={i}
                                      style={{
                                        width: `${Math.round((seg.c / total) * 100)}%`,
                                        backgroundColor: seg.color,
                                      }}
                                      title={`${seg.c}명`}
                                    />
                                  ))}
                              </div>
                            ) : (
                              <span className="text-ink/25 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top 5 Students */}
            <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
              <div className="border-b border-ink/10 px-6 py-4">
                <h2 className="text-base font-semibold text-ink">상위 5인</h2>
                <p className="text-xs text-slate">이번 주 응시 과목 평균 기준</p>
              </div>
              {top5.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-slate">
                  응시 데이터가 없습니다.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 bg-mist">
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">순위</th>
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">학번</th>
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">이름</th>
                      <th className="px-4 py-3 text-right font-semibold text-ink/60">주간 평균</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {top5.map((s) => (
                      <tr key={s.examNumber} className="hover:bg-mist/60">
                        <td className="px-4 py-3 font-bold text-ember">{s.rank}</td>
                        <td className="px-4 py-3 font-mono text-forest">{s.examNumber}</td>
                        <td className="px-4 py-3 font-medium text-ink">{s.name}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-forest">
                          {s.avg}점
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* At-risk Students */}
            {atRisk.length > 0 && (
              <div className="overflow-hidden rounded-[28px] border border-red-100 bg-white shadow-panel">
                <div className="border-b border-red-100 bg-red-50 px-6 py-4">
                  <h2 className="text-base font-semibold text-red-700">
                    주의 학생 ({atRisk.length}명)
                  </h2>
                  <p className="text-xs text-red-500">이번 주 평균 60점 미만</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-red-100 bg-red-50/50">
                      <th className="px-4 py-3 text-left font-semibold text-red-700/60">학번</th>
                      <th className="px-4 py-3 text-left font-semibold text-red-700/60">이름</th>
                      <th className="px-4 py-3 text-right font-semibold text-red-700/60">
                        주간 평균
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-50">
                    {atRisk.map((s) => (
                      <tr key={s.examNumber} className="hover:bg-red-50/50">
                        <td className="px-4 py-3 font-mono text-slate">{s.examNumber}</td>
                        <td className="px-4 py-3 font-medium text-ink">{s.name}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-red-600">
                          {s.avg}점
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Attendance Summary */}
            <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <h2 className="text-base font-semibold text-ink">출결 요약</h2>
              <div className="mt-4 flex flex-wrap gap-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate">
                    총 응시
                  </p>
                  <p className="mt-1 text-2xl font-bold text-forest">{totalPresent}건</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate">
                    총 미응시
                  </p>
                  <p className="mt-1 text-2xl font-bold text-red-600">{totalAbsent}건</p>
                </div>
                {totalPresent + totalAbsent > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate">
                      출석률
                    </p>
                    <p className="mt-1 text-2xl font-bold text-ink">
                      {Math.round(
                        (totalPresent / (totalPresent + totalAbsent)) * 1000,
                      ) / 10}
                      %
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
