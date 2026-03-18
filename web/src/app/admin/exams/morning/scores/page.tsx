import Link from "next/link";
import { AdminRole, ExamType, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { DistributionBar, DeltaBadge } from "./score-stats";
import type { ScoreDistribution } from "./score-stats";

export const dynamic = "force-dynamic";

type SessionRow = {
  id: number;
  examType: ExamType;
  week: number;
  subject: string;
  /** raw subject key, used for same-subject delta lookup */
  subjectKey: string;
  examDate: string;
  isCancelled: boolean;
  totalScores: number;
  normalCount: number;
  absentCount: number;
  avgScore: number | null;
  maxScore: number | null;
  minScore: number | null;
  distribution: ScoreDistribution;
  /** avg change vs previous session of the same subject within the same period */
  deltaVsPrev: number | null;
};

type PeriodRow = {
  id: number;
  name: string;
  isActive: boolean;
  sessions: SessionRow[];
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}.${month}.${day}(${weekdays[d.getDay()]})`;
}

function buildDistribution(scoreValues: number[]): ScoreDistribution {
  let s90 = 0, s80 = 0, s70 = 0, s60 = 0, sBelow60 = 0;
  for (const v of scoreValues) {
    if (v >= 90) s90++;
    else if (v >= 80) s80++;
    else if (v >= 70) s70++;
    else if (v >= 60) s60++;
    else sBelow60++;
  }
  return { s90, s80, s70, s60, sBelow60 };
}

export default async function MorningExamScoresPage() {
  await requireAdminContext(AdminRole.TEACHER);

  // 모든 기간 + 세션 + 성적 통계 조회
  const periods = await getPrisma().examPeriod.findMany({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      sessions: {
        orderBy: [{ examDate: "asc" }, { examType: "asc" }],
        select: {
          id: true,
          examType: true,
          week: true,
          subject: true,
          displaySubjectName: true,
          examDate: true,
          isCancelled: true,
          scores: {
            select: {
              finalScore: true,
              attendType: true,
            },
          },
        },
      },
    },
    take: 10, // 최근 10개 기간만
  });

  const periodRows: PeriodRow[] = periods.map((p) => {
    // Build per-subject ordered list for delta computation
    // Group sessions by subject key, ordered by examDate asc
    const sessionsBySubject = new Map<string, { avgScore: number | null; examDate: string }[]>();

    // First pass: build raw session data
    const rawSessions = p.sessions.map((s) => {
      const validScores = s.scores.filter(
        (sc) => sc.attendType === AttendType.NORMAL || sc.attendType === AttendType.LIVE,
      );
      const absentCount = s.scores.filter(
        (sc) => sc.attendType === AttendType.ABSENT || sc.attendType === AttendType.EXCUSED,
      ).length;
      const scoreValues = validScores
        .map((sc) => sc.finalScore)
        .filter((v): v is number => v !== null && v !== undefined);
      const avgScore =
        scoreValues.length > 0
          ? Math.round((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) * 10) / 10
          : null;
      const maxScore = scoreValues.length > 0 ? Math.max(...scoreValues) : null;
      const minScore = scoreValues.length > 0 ? Math.min(...scoreValues) : null;

      return {
        id: s.id,
        examType: s.examType,
        week: s.week,
        subjectKey: s.subject,
        subject: s.displaySubjectName ?? SUBJECT_LABEL[s.subject] ?? s.subject,
        examDate: s.examDate.toISOString(),
        isCancelled: s.isCancelled,
        totalScores: s.scores.length,
        normalCount: validScores.length,
        absentCount,
        avgScore,
        maxScore,
        minScore,
        distribution: buildDistribution(scoreValues),
        scoreValues,
      };
    });

    // Build subject-ordered avg history for delta
    for (const s of rawSessions) {
      const key = `${s.examType}:${s.subjectKey}`;
      const arr = sessionsBySubject.get(key) ?? [];
      arr.push({ avgScore: s.avgScore, examDate: s.examDate });
      sessionsBySubject.set(key, arr);
    }

    // Second pass: compute delta vs previous same-subject session
    // Track index within subject group using a counter map
    const subjectCounter = new Map<string, number>();

    const sessions: SessionRow[] = rawSessions.map((s) => {
      const key = `${s.examType}:${s.subjectKey}`;
      const idx = subjectCounter.get(key) ?? 0;
      subjectCounter.set(key, idx + 1);

      let deltaVsPrev: number | null = null;
      if (idx > 0) {
        const history = sessionsBySubject.get(key)!;
        const prev = history[idx - 1].avgScore;
        const curr = history[idx].avgScore;
        if (prev !== null && curr !== null) {
          deltaVsPrev = Math.round((curr - prev) * 10) / 10;
        }
      }

      return {
        id: s.id,
        examType: s.examType,
        week: s.week,
        subjectKey: s.subjectKey,
        subject: s.subject,
        examDate: s.examDate,
        isCancelled: s.isCancelled,
        totalScores: s.totalScores,
        normalCount: s.normalCount,
        absentCount: s.absentCount,
        avgScore: s.avgScore,
        maxScore: s.maxScore,
        minScore: s.minScore,
        distribution: s.distribution,
        deltaVsPrev,
      };
    });

    return {
      id: p.id,
      name: p.name,
      isActive: p.isActive,
      sessions,
    };
  });

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            아침 모의고사
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">회차별 성적 현황</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            기간별 아침모의고사 회차 목록과 성적 입력 현황을 조회합니다.
            성적 입력은 상단의 성적 업로드 페이지를 이용하세요.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/exams/morning"
            className="inline-flex items-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            수강 현황으로
          </Link>
          <Link
            href="/admin/scores/input"
            className="inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/20"
          >
            성적 업로드
          </Link>
          <Link
            href="/admin/scores/edit"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            성적 수정
          </Link>
        </div>
      </div>

      {/* Notice Banner */}
      <div className="mt-6 flex items-start gap-3 rounded-[20px] border border-sky-200 bg-sky-50 p-4">
        <svg
          className="mt-0.5 h-4 w-4 shrink-0 text-sky-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <p className="text-sm text-sky-700">
          아침모의고사 성적은 <strong>성적 업로드</strong> 페이지에서 기간과 회차를 선택해 입력합니다.
          아래 목록에서 회차를 클릭하면 해당 회차의 성적 편집 화면으로 이동합니다.
        </p>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate">
        <span className="font-semibold">분포 범례:</span>
        {[
          { color: "#1F4D3A", label: "90+" },
          { color: "#4ADE80", label: "80-89" },
          { color: "#FCD34D", label: "70-79" },
          { color: "#FB923C", label: "60-69" },
          { color: "#C55A11", label: "<60" },
        ].map((b) => (
          <span key={b.label} className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-4 rounded-sm"
              style={{ backgroundColor: b.color }}
            />
            {b.label}
          </span>
        ))}
        <span className="ml-2 text-ink/40">|</span>
        <span>전회차 대비: <span className="font-semibold text-forest">▲ 상승</span> / <span className="font-semibold text-ember">▼ 하락</span> (동일 직렬·과목 기준)</span>
      </div>

      {/* Period Session Tables */}
      <div className="mt-6 space-y-8">
        {periodRows.length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-mist p-10 text-center text-slate">
            등록된 시험 기간이 없습니다.
          </div>
        ) : (
          periodRows.map((period) => (
            <div key={period.id} className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
              {/* Period Header */}
              <div className="flex items-center justify-between border-b border-ink/10 bg-mist px-6 py-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold text-ink">{period.name}</h2>
                  {period.isActive && (
                    <span className="inline-flex items-center rounded-full border border-forest/30 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                      현재
                    </span>
                  )}
                  <span className="text-sm text-slate">
                    총 {period.sessions.length}회차
                  </span>
                </div>
                <Link
                  href={`/admin/scores/input`}
                  className="text-xs font-semibold text-forest transition hover:underline"
                >
                  성적 입력 →
                </Link>
              </div>

              {/* Sessions Table */}
              {period.sessions.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-slate">
                  이 기간에 등록된 회차가 없습니다.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink/10">
                        <th className="px-4 py-3 text-left font-semibold text-ink/60">날짜</th>
                        <th className="px-4 py-3 text-left font-semibold text-ink/60">주차</th>
                        <th className="px-4 py-3 text-left font-semibold text-ink/60">직렬</th>
                        <th className="px-4 py-3 text-left font-semibold text-ink/60">과목</th>
                        <th className="px-4 py-3 text-right font-semibold text-ink/60">입력수</th>
                        <th className="px-4 py-3 text-right font-semibold text-ink/60">응시</th>
                        <th className="px-4 py-3 text-right font-semibold text-ink/60">결시</th>
                        <th className="px-4 py-3 text-right font-semibold text-ink/60">평균</th>
                        <th className="px-4 py-3 text-right font-semibold text-ink/60">최고/최저</th>
                        <th className="px-4 py-3 text-right font-semibold text-ink/60">분포</th>
                        <th className="px-4 py-3 text-right font-semibold text-ink/60">전회차 대비</th>
                        <th className="px-4 py-3 text-right font-semibold text-ink/60">관리</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {period.sessions.map((session) => (
                        <tr
                          key={session.id}
                          className={`transition hover:bg-mist/60 ${session.isCancelled ? "opacity-50" : ""}`}
                        >
                          <td className="px-4 py-3 text-slate">
                            {formatDate(session.examDate)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs font-semibold text-slate">
                              {session.week}주
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                session.examType === "GONGCHAE"
                                  ? "border-forest/30 bg-forest/10 text-forest"
                                  : "border-ember/30 bg-ember/10 text-ember"
                              }`}
                            >
                              {EXAM_TYPE_LABEL[session.examType]}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-ink">
                            {session.subject}
                            {session.isCancelled && (
                              <span className="ml-2 text-xs text-red-500">[취소]</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-ink">
                            {session.totalScores}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-forest">
                            {session.normalCount}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-red-500">
                            {session.absentCount}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-ink">
                            {session.avgScore !== null ? (
                              <span>{session.avgScore}점</span>
                            ) : (
                              <span className="text-ink/25">—</span>
                            )}
                          </td>
                          {/* 최고/최저 */}
                          <td className="px-4 py-3 text-right font-mono text-sm">
                            {session.maxScore !== null && session.minScore !== null ? (
                              <span>
                                <span className="font-semibold text-forest">{session.maxScore}</span>
                                <span className="mx-0.5 text-ink/30">/</span>
                                <span className="font-semibold text-ember">{session.minScore}</span>
                              </span>
                            ) : (
                              <span className="text-ink/25">—</span>
                            )}
                          </td>
                          {/* 분포 */}
                          <td className="px-4 py-3 text-right">
                            <DistributionBar distribution={session.distribution} />
                          </td>
                          {/* 전회차 대비 */}
                          <td className="px-4 py-3 text-right">
                            <DeltaBadge delta={session.deltaVsPrev} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/admin/scores/edit?sessionId=${session.id}`}
                              className="inline-flex items-center rounded-full border border-forest/30 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/10"
                            >
                              수정
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
