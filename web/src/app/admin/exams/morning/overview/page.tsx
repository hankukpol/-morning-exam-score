import Link from "next/link";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

type SessionSummary = {
  sessionId: number;
  examDate: string;
  examType: string;
  subject: string;
  avgScore: number | null;
  participantCount: number;
  absentCount: number;
};

type SubjectSessionAvg = {
  subject: string;
  /** sessionId → avg or null */
  bySession: Record<number, number | null>;
};

type TopScorer = {
  examNumber: string;
  name: string;
  avgScore: number;
  sessionCount: number;
};

type LowParticipant = {
  examNumber: string;
  name: string;
  lastSessionDate: string | null;
  sessionCountLast2Weeks: number;
  totalSessionsLast2Weeks: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function round1(val: number) {
  return Math.round(val * 10) / 10;
}

function getSubjectLabel(subject: string): string {
  return SUBJECT_LABEL[subject as keyof typeof SUBJECT_LABEL] ?? subject;
}

// ── Server Component ──────────────────────────────────────────────────────────

export default async function MorningExamOverviewPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();
  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // ── 1. Last 5 morning exam sessions (across all active periods) ────────────
  const recentSessions = await prisma.examSession.findMany({
    where: { isCancelled: false },
    orderBy: { examDate: "desc" },
    take: 5,
    select: {
      id: true,
      examType: true,
      subject: true,
      displaySubjectName: true,
      examDate: true,
      scores: {
        select: {
          finalScore: true,
          attendType: true,
          examNumber: true,
        },
      },
    },
  });

  // Build session summaries (latest 5, displayed chronologically)
  const sessionSummaries: SessionSummary[] = recentSessions
    .slice()
    .reverse()
    .map((s) => {
      const present = s.scores.filter(
        (sc) =>
          sc.attendType === AttendType.NORMAL ||
          sc.attendType === AttendType.LIVE,
      );
      const absent = s.scores.filter(
        (sc) =>
          sc.attendType === AttendType.ABSENT ||
          sc.attendType === AttendType.EXCUSED,
      );
      const scoreVals = present
        .map((sc) => sc.finalScore)
        .filter((v): v is number => v !== null && v !== undefined);
      const avg =
        scoreVals.length > 0
          ? round1(scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length)
          : null;

      return {
        sessionId: s.id,
        examDate: s.examDate.toISOString(),
        examType: s.examType,
        subject: s.displaySubjectName?.trim() || getSubjectLabel(s.subject),
        avgScore: avg,
        participantCount: present.length,
        absentCount: absent.length,
      };
    });

  const sessionIds = sessionSummaries.map((s) => s.sessionId);

  // ── 2. Subject-vs-session average matrix ──────────────────────────────────
  // Collect unique subjects from the 5 sessions
  const subjectSet = new Set(
    recentSessions.map(
      (s) => s.displaySubjectName?.trim() || getSubjectLabel(s.subject),
    ),
  );
  const subjects = Array.from(subjectSet);

  // Build subject → { sessionId → avg }
  const subjectSessionAvgs: SubjectSessionAvg[] = subjects.map((subj) => {
    const bySession: Record<number, number | null> = {};
    for (const s of recentSessions) {
      const label = s.displaySubjectName?.trim() || getSubjectLabel(s.subject);
      if (label !== subj) continue;
      const present = s.scores.filter(
        (sc) =>
          sc.attendType === AttendType.NORMAL ||
          sc.attendType === AttendType.LIVE,
      );
      const vals = present
        .map((sc) => sc.finalScore)
        .filter((v): v is number => v !== null && v !== undefined);
      bySession[s.id] =
        vals.length > 0
          ? round1(vals.reduce((a, b) => a + b, 0) / vals.length)
          : null;
    }
    return { subject: subj, bySession };
  });

  // ── 3. Top 5 scorers this month ────────────────────────────────────────────
  const monthScores = await prisma.score.findMany({
    where: {
      session: {
        examDate: { gte: monthStart },
        isCancelled: false,
      },
      attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
      finalScore: { not: null },
    },
    select: {
      examNumber: true,
      finalScore: true,
      student: { select: { name: true } },
    },
  });

  // Aggregate per student
  const studentScoreMap = new Map<
    string,
    { name: string; sum: number; count: number }
  >();
  for (const sc of monthScores) {
    if (sc.finalScore === null) continue;
    const entry = studentScoreMap.get(sc.examNumber);
    if (entry) {
      entry.sum += sc.finalScore;
      entry.count += 1;
    } else {
      studentScoreMap.set(sc.examNumber, {
        name: sc.student.name,
        sum: sc.finalScore,
        count: 1,
      });
    }
  }

  const topScorers: TopScorer[] = Array.from(studentScoreMap.entries())
    .map(([examNumber, { name, sum, count }]) => ({
      examNumber,
      name,
      avgScore: round1(sum / count),
      sessionCount: count,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 5);

  // ── 4. Low participation alert (no exam in last 2 weeks) ──────────────────
  // Find sessions in the last 2 weeks
  const recentSessionsForParticipation = await prisma.examSession.findMany({
    where: {
      examDate: { gte: twoWeeksAgo },
      isCancelled: false,
    },
    select: {
      id: true,
      examDate: true,
    },
  });
  const recentSessionIdsForParticipation = recentSessionsForParticipation.map(
    (s) => s.id,
  );
  const totalRecentSessions = recentSessionIdsForParticipation.length;

  let lowParticipants: LowParticipant[] = [];

  if (totalRecentSessions > 0) {
    // Find all students with an active period enrollment in any active exam period
    // We use PeriodEnrollment joined to the active ExamPeriod
    const activeEnrollments = await prisma.periodEnrollment.findMany({
      where: {
        period: { isActive: true },
      },
      select: {
        examNumber: true,
        student: { select: { name: true } },
      },
      distinct: ["examNumber"],
    });

    // For each student, count how many of the recent sessions they participated in
    const participationScores = await prisma.score.findMany({
      where: {
        sessionId: { in: recentSessionIdsForParticipation },
        attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
      },
      select: { examNumber: true, session: { select: { examDate: true } } },
    });

    const studentParticipationMap = new Map<
      string,
      { count: number; lastDate: string | null }
    >();
    for (const sc of participationScores) {
      const entry = studentParticipationMap.get(sc.examNumber);
      const dateStr = sc.session.examDate.toISOString();
      if (entry) {
        entry.count += 1;
        if (!entry.lastDate || dateStr > entry.lastDate) {
          entry.lastDate = dateStr;
        }
      } else {
        studentParticipationMap.set(sc.examNumber, {
          count: 1,
          lastDate: dateStr,
        });
      }
    }

    // Students with 0 participations in the last 2 weeks
    lowParticipants = activeEnrollments
      .filter((e) => {
        const participation = studentParticipationMap.get(e.examNumber);
        return !participation || participation.count === 0;
      })
      .map((e) => {
        const participation = studentParticipationMap.get(e.examNumber);
        return {
          examNumber: e.examNumber,
          name: e.student.name,
          lastSessionDate: participation?.lastDate ?? null,
          sessionCountLast2Weeks: participation?.count ?? 0,
          totalSessionsLast2Weeks: totalRecentSessions,
        };
      })
      .slice(0, 20); // cap at 20 for display
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <Breadcrumbs
        items={[
          { label: "성적 관리" },
          { label: "아침모의고사 수강 현황", href: "/admin/exams/morning" },
          { label: "성적 개요" },
        ]}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            아침 모의고사
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">성적 개요</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            최근 5회차 평균 성적, 과목별 추이, 이달의 우수 수강생, 2주간 미응시
            학생 현황을 한눈에 확인합니다.
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
            href="/admin/exams/morning/scores"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            회차별 성적 현황
          </Link>
          <Link
            href="/admin/exams/morning/compare"
            className="inline-flex items-center rounded-full border border-ember/30 bg-ember/5 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10"
          >
            기간 비교
          </Link>
          <Link
            href="/admin/scores/input"
            className="inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/20"
          >
            성적 입력
          </Link>
        </div>
      </div>

      {sessionSummaries.length === 0 ? (
        <div className="mt-12 rounded-[28px] border border-dashed border-ink/10 p-12 text-center text-slate">
          아직 등록된 시험 회차가 없습니다.
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          {/* ── Section 1: Recent 5 sessions ─────────────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-ink">최근 5회차 요약</h2>
            <div className="mt-4 overflow-hidden rounded-[28px] border border-ink/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/80">
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                      날짜
                    </th>
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                      직렬
                    </th>
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                      과목
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      응시
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      결시
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      평균
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      보기
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {sessionSummaries.map((s) => (
                    <tr key={s.sessionId} className="hover:bg-mist/30">
                      <td className="px-5 py-3.5 text-slate">
                        {formatDate(s.examDate)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            s.examType === "GONGCHAE"
                              ? "border-forest/30 bg-forest/10 text-forest"
                              : "border-ember/30 bg-ember/10 text-ember"
                          }`}
                        >
                          {EXAM_TYPE_LABEL[s.examType as keyof typeof EXAM_TYPE_LABEL] ?? s.examType}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-medium text-ink">
                        {s.subject}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-forest">
                        {s.participantCount}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-red-500">
                        {s.absentCount}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                        {s.avgScore !== null ? (
                          `${s.avgScore}점`
                        ) : (
                          <span className="text-ink/25">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={`/admin/scores/edit?sessionId=${s.sessionId}`}
                          className="text-xs font-semibold text-forest transition hover:underline"
                        >
                          수정
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Section 2: Subject × Session average matrix ───────────────── */}
          {subjectSessionAvgs.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-ink">
                과목별 평균 비교{" "}
                <span className="text-sm font-normal text-slate">
                  (최근 5회차)
                </span>
              </h2>
              <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 bg-mist/80">
                      <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                        과목
                      </th>
                      {sessionSummaries.map((s) => (
                        <th
                          key={s.sessionId}
                          className="px-4 py-3.5 text-right font-semibold text-ink/60"
                        >
                          {formatDate(s.examDate)}
                          <br />
                          <span className="text-xs font-normal text-slate">
                            {s.examType === "GONGCHAE" ? "공채" : "경채"}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {subjectSessionAvgs.map(({ subject, bySession }) => (
                      <tr key={subject} className="hover:bg-mist/30">
                        <td className="px-5 py-3.5 font-medium text-ink">
                          {subject}
                        </td>
                        {sessionSummaries.map((s) => {
                          const avg = bySession[s.sessionId];
                          return (
                            <td
                              key={s.sessionId}
                              className="px-4 py-3.5 text-right font-mono"
                            >
                              {avg !== undefined && avg !== null ? (
                                <span
                                  className={
                                    avg >= 80
                                      ? "font-semibold text-forest"
                                      : avg >= 60
                                        ? "text-ink"
                                        : "text-red-500"
                                  }
                                >
                                  {avg}
                                </span>
                              ) : (
                                <span className="text-ink/20">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate">
                * 80점 이상 <span className="font-semibold text-forest">녹색</span>
                , 60점 미만{" "}
                <span className="font-semibold text-red-500">빨간색</span>으로 표시됩니다.
              </p>
            </section>
          )}

          {/* ── Section 3: Top 5 scorers this month ─────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-ink">
              이달의 우수 수강생 TOP 5{" "}
              <span className="text-sm font-normal text-slate">
                ({now.getFullYear()}년 {now.getMonth() + 1}월, 응시 기준
                평균)
              </span>
            </h2>
            {topScorers.length === 0 ? (
              <div className="mt-4 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
                이달 응시 기록이 없습니다.
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
                        평균 점수
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {topScorers.map((t, idx) => (
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
                        <td className="px-5 py-3.5 text-right text-slate">
                          {t.sessionCount}회
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-ember">
                          {t.avgScore}점
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Section 4: Low participation alert ───────────────────────── */}
          <section>
            <h2 className="text-lg font-semibold text-ink">
              2주간 미응시 학생 알림{" "}
              <span className="text-sm font-normal text-slate">
                (최근 14일 기준, 활성 수강생 중)
              </span>
            </h2>
            {lowParticipants.length === 0 ? (
              <div className="mt-4 flex items-center gap-3 rounded-[28px] border border-forest/20 bg-forest/10 p-6">
                <svg
                  className="h-5 w-5 shrink-0 text-forest"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <p className="text-sm font-medium text-forest">
                  최근 2주간 모든 활성 수강생이 응시 기록이 있습니다.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-4 mb-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  </svg>
                  <span>
                    최근 2주 동안 아침모의고사 응시 기록이 없는 수강생이{" "}
                    <strong>{lowParticipants.length}명</strong> 있습니다.
                    (전체 회차 수:{" "}
                    {lowParticipants[0]?.totalSessionsLast2Weeks ?? 0}회)
                  </span>
                </div>
                <div className="overflow-hidden rounded-[28px] border border-ink/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink/10 bg-mist/80">
                        <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                          학생
                        </th>
                        <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                          2주간 응시
                        </th>
                        <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                          관리
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {lowParticipants.map((lp) => (
                        <tr key={lp.examNumber} className="hover:bg-mist/30">
                          <td className="px-5 py-3.5">
                            <Link
                              href={`/admin/students/${lp.examNumber}`}
                              className="font-medium text-ink transition hover:text-ember"
                            >
                              {lp.name}
                            </Link>{" "}
                            <span className="text-xs text-slate">
                              {lp.examNumber}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono">
                            <span className="font-semibold text-red-500">
                              {lp.sessionCountLast2Weeks}
                            </span>
                            <span className="text-slate">
                              /{lp.totalSessionsLast2Weeks}회
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <Link
                              href={`/admin/students/${lp.examNumber}?tab=scores`}
                              className="text-xs font-semibold text-forest transition hover:underline"
                            >
                              성적 보기
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
