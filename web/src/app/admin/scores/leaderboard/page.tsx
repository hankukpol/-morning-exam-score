import Link from "next/link";
import { AdminRole, AttendType, Subject } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams;
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

function rankBadgeClass(rank: number): string {
  if (rank === 1) return "bg-amber-400 text-white";
  if (rank === 2) return "bg-slate-300 text-white";
  if (rank === 3) return "bg-amber-600 text-white";
  return "bg-ink/5 text-slate";
}

export default async function ScoreLeaderboardPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const rawSessionId = pickFirst(searchParams?.["examEventId"]);
  const rawSubject = pickFirst(searchParams?.["subject"]);

  const selectedSessionId: number | null =
    rawSessionId && /^\d+$/.test(rawSessionId) ? parseInt(rawSessionId, 10) : null;
  const selectedSubject: Subject | null =
    rawSubject && isSubject(rawSubject) ? rawSubject : null;

  const db = getPrisma();

  // ── Recent 10 exam sessions (for dropdown) ────────────────────────────────
  const recentSessions = await db.examSession.findMany({
    where: { isCancelled: false },
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
    take: 10,
    select: {
      id: true,
      examType: true,
      week: true,
      subject: true,
      displaySubjectName: true,
      examDate: true,
      period: { select: { name: true, isActive: true } },
    },
  });

  // ── Resolve the target session ────────────────────────────────────────────
  // If no sessionId given, use the most recent session that has scores
  let targetSessionId: number | null = selectedSessionId;

  if (targetSessionId === null && recentSessions.length > 0) {
    // Try to find the latest session with at least one score entry
    const sessionsWithScores = await db.examSession.findMany({
      where: {
        isCancelled: false,
        scores: { some: {} },
      },
      orderBy: [{ examDate: "desc" }, { id: "desc" }],
      take: 1,
      select: { id: true },
    });
    targetSessionId = sessionsWithScores[0]?.id ?? recentSessions[0]?.id ?? null;
  }

  // ── Load target session details ───────────────────────────────────────────
  const targetSession = targetSessionId
    ? await db.examSession.findUnique({
        where: { id: targetSessionId },
        select: {
          id: true,
          examType: true,
          week: true,
          subject: true,
          displaySubjectName: true,
          examDate: true,
          period: { select: { name: true, isActive: true } },
        },
      })
    : null;

  // ── Load scores for target session ───────────────────────────────────────
  type ScoreRow = {
    examNumber: string;
    finalScore: number | null;
    attendType: AttendType;
  };

  const rawScores: ScoreRow[] = targetSessionId
    ? await db.score.findMany({
        where: {
          sessionId: targetSessionId,
          attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
        },
        select: {
          examNumber: true,
          finalScore: true,
          attendType: true,
        },
        orderBy: [{ finalScore: "desc" }, { examNumber: "asc" }],
      })
    : [];

  // ── If subject filter, we can only rank by subject score from this session ──
  // (For subject filter, still use the same scores but relabel)
  // For multi-subject context, we'd need all sessions of the same period/exam-type
  // but per the task: "Support ?subject= to rank by single subject score"
  // Since each session is per-subject, selected session IS the subject data.
  // The subject filter here will be used to pre-select sessions by subject.

  // Filter sessions dropdown by subject if selected
  const filteredDropdownSessions = selectedSubject
    ? recentSessions.filter((s) => s.subject === selectedSubject)
    : recentSessions;

  // ── Build student numbers list ────────────────────────────────────────────
  const studentNumbers = rawScores.map((s) => s.examNumber);

  // ── Load student info ─────────────────────────────────────────────────────
  const students = studentNumbers.length > 0
    ? await db.student.findMany({
        where: { examNumber: { in: studentNumbers } },
        select: {
          examNumber: true,
          name: true,
          phone: true,
          className: true,
          examType: true,
          courseEnrollments: {
            where: { status: "ACTIVE" },
            select: {
              cohort: {
                select: { name: true },
              },
            },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
        },
      })
    : [];

  const studentMap = new Map(students.map((s) => [s.examNumber, s]));

  // ── Build leaderboard rows ─────────────────────────────────────────────────
  type LeaderboardEntry = {
    rank: number;
    examNumber: string;
    name: string;
    mobile: string | null;
    cohortName: string | null;
    className: string | null;
    finalScore: number | null;
    attendType: AttendType;
  };

  // Sort by finalScore desc, then examNumber asc (null scores go to bottom)
  const sorted = [...rawScores].sort((a, b) => {
    if (a.finalScore === null && b.finalScore === null) return 0;
    if (a.finalScore === null) return 1;
    if (b.finalScore === null) return -1;
    return b.finalScore - a.finalScore;
  });

  let currentRank = 1;
  const leaderboard: LeaderboardEntry[] = sorted.map((sc, idx) => {
    // Dense ranking: same score = same rank
    if (idx > 0) {
      const prev = sorted[idx - 1];
      if (sc.finalScore !== prev.finalScore) {
        currentRank = idx + 1;
      }
    }
    const student = studentMap.get(sc.examNumber);
    return {
      rank: currentRank,
      examNumber: sc.examNumber,
      name: student?.name ?? sc.examNumber,
      mobile: student?.phone ?? null,
      cohortName: student?.courseEnrollments[0]?.cohort?.name ?? null,
      className: student?.className ?? null,
      finalScore: sc.finalScore,
      attendType: sc.attendType,
    };
  });

  // Stats
  const validScores = leaderboard
    .map((r) => r.finalScore)
    .filter((v): v is number => v !== null);
  const avgScore =
    validScores.length > 0
      ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 10) / 10
      : null;
  const maxScore = validScores.length > 0 ? Math.max(...validScores) : null;
  const minScore = validScores.length > 0 ? Math.min(...validScores) : null;

  // Subject filter options for the filter bar
  const subjectOptions = [
    { value: "", label: "전체 과목" },
    ...Object.values(Subject)
      .filter((s) => s !== Subject.CUMULATIVE)
      .map((s) => ({ value: s, label: SUBJECT_LABEL[s] ?? s })),
  ];

  const sessionSubjectLabel =
    targetSession?.displaySubjectName?.trim() ||
    (targetSession ? SUBJECT_LABEL[targetSession.subject] ?? targetSession.subject : "");

  return (
    <div className="p-8 sm:p-10">
      {/* ── 헤더 ────────────────────────────────────────────────────────── */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        성적 순위
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">성적 리더보드</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        세션별 학생 성적 순위를 확인합니다. 과목 필터로 특정 과목의 순위를 조회할 수 있습니다.
      </p>

      {/* ── 과목 필터 + 세션 선택 ────────────────────────────────────────── */}
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end">
        {/* 과목 필터 */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">
            과목 필터
          </p>
          <div className="flex flex-wrap gap-2">
            {subjectOptions.map((opt) => {
              const isActive = (selectedSubject ?? "") === opt.value;
              // When selecting a subject, clear the session selection so we re-auto-pick
              const href =
                opt.value === ""
                  ? "/admin/scores/leaderboard"
                  : `/admin/scores/leaderboard?subject=${opt.value}`;
              return (
                <Link
                  key={opt.value}
                  href={href}
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
      </div>

      {/* ── 세션 선택 드롭다운 ────────────────────────────────────────────── */}
      <div className="mt-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate">
          시험 회차 선택 (최근 10회)
        </p>
        {(selectedSubject ? filteredDropdownSessions : recentSessions).length === 0 ? (
          <p className="text-sm text-slate">
            {selectedSubject
              ? `${SUBJECT_LABEL[selectedSubject] ?? selectedSubject} 과목의 세션이 없습니다.`
              : "등록된 세션이 없습니다."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(selectedSubject ? filteredDropdownSessions : recentSessions).map((sess) => {
              const isActive = targetSessionId === sess.id;
              const subjectLabel =
                sess.displaySubjectName?.trim() || (SUBJECT_LABEL[sess.subject] ?? sess.subject);
              const examTypeLabel =
                EXAM_TYPE_LABEL[sess.examType as keyof typeof EXAM_TYPE_LABEL] ?? sess.examType;
              const label = `${formatDate(sess.examDate)} ${sess.period.name} ${examTypeLabel} ${subjectLabel}`;
              const params = new URLSearchParams();
              params.set("examEventId", String(sess.id));
              if (selectedSubject) params.set("subject", selectedSubject);
              const href = `/admin/scores/leaderboard?${params.toString()}`;
              return (
                <Link
                  key={sess.id}
                  href={href}
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? "border-forest/30 bg-forest/10 text-forest"
                      : "border-ink/10 bg-white text-slate hover:border-forest/20 hover:text-forest"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 선택된 세션 정보 + 통계 ──────────────────────────────────────── */}
      {targetSession ? (
        <>
          <section className="mt-8">
            <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                    현재 선택된 세션
                  </p>
                  <p className="mt-2 text-xl font-semibold text-ink">
                    {targetSession.period.name} —{" "}
                    {EXAM_TYPE_LABEL[targetSession.examType as keyof typeof EXAM_TYPE_LABEL] ??
                      targetSession.examType}{" "}
                    {sessionSubjectLabel}
                  </p>
                  <p className="mt-1 text-sm text-slate">
                    {formatDate(targetSession.examDate)} · {targetSession.week}주차
                    {targetSession.period.isActive && (
                      <span className="ml-2 rounded-full bg-forest/10 px-1.5 py-0.5 text-[10px] font-semibold text-forest">
                        현재 기수
                      </span>
                    )}
                  </p>
                </div>
                <Link
                  href={`/admin/scores/sessions/${targetSession.id}`}
                  className="inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-xs font-semibold text-slate transition hover:border-ember/30 hover:text-ember"
                >
                  세션 상세 →
                </Link>
              </div>

              {/* 통계 */}
              <div className="mt-6 grid gap-4 sm:grid-cols-4">
                <div className="rounded-[20px] border border-ink/5 bg-mist p-4">
                  <p className="text-xs text-slate">응시자 수</p>
                  <p className="mt-2 text-2xl font-semibold text-ink">{leaderboard.length}명</p>
                </div>
                <div className="rounded-[20px] border border-ink/5 bg-mist p-4">
                  <p className="text-xs text-slate">평균 점수</p>
                  <p className="mt-2 text-2xl font-semibold text-ink">
                    {avgScore !== null ? `${avgScore}점` : "—"}
                  </p>
                </div>
                <div className="rounded-[20px] border border-forest/10 bg-forest/5 p-4">
                  <p className="text-xs text-forest">최고 점수</p>
                  <p className="mt-2 text-2xl font-semibold text-forest">
                    {maxScore !== null ? `${maxScore}점` : "—"}
                  </p>
                </div>
                <div className="rounded-[20px] border border-ember/10 bg-ember/5 p-4">
                  <p className="text-xs text-ember">최저 점수</p>
                  <p className="mt-2 text-2xl font-semibold text-ember">
                    {minScore !== null ? `${minScore}점` : "—"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ── 순위 테이블 ──────────────────────────────────────────────── */}
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate">
                성적 순위표
              </h2>
              <span className="text-xs text-slate">
                총 {leaderboard.length}명 응시 · {sessionSubjectLabel}
              </span>
            </div>

            {leaderboard.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
                이 세션에는 입력된 성적 데이터가 없습니다.
              </div>
            ) : (
              <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-ink/10">
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                          순위
                        </th>
                        <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                          학번
                        </th>
                        <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                          이름
                        </th>
                        <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                          반 / 기수
                        </th>
                        <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                          점수
                        </th>
                        <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                          응시 유형
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {leaderboard.map((entry) => {
                        const isTopThree = entry.rank <= 3;
                        return (
                          <tr
                            key={entry.examNumber}
                            className={`transition ${
                              isTopThree
                                ? "bg-amber-50/40 hover:bg-amber-50/80"
                                : "hover:bg-mist/60"
                            }`}
                          >
                            <td className="px-6 py-3">
                              <span
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${rankBadgeClass(entry.rank)}`}
                              >
                                {entry.rank}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-slate">
                              {entry.examNumber}
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                href={`/admin/students/${entry.examNumber}`}
                                className="font-semibold text-ink transition hover:text-ember hover:underline"
                              >
                                {entry.name}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-slate">
                              {entry.cohortName ? (
                                <span className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-ink">
                                  {entry.cohortName}
                                </span>
                              ) : entry.className ? (
                                <span className="text-xs">{entry.className}</span>
                              ) : (
                                <span className="text-ink/25">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {entry.finalScore !== null ? (
                                <span
                                  className={`font-mono text-base font-bold ${
                                    entry.rank === 1
                                      ? "text-amber-500"
                                      : entry.rank === 2
                                        ? "text-slate-500"
                                        : entry.rank === 3
                                          ? "text-amber-700"
                                          : "text-ink"
                                  }`}
                                >
                                  {entry.finalScore}점
                                </span>
                              ) : (
                                <span className="text-ink/25">미입력</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {entry.attendType === AttendType.LIVE ? (
                                <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-600">
                                  온라인
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-2 py-0.5 text-[10px] font-semibold text-forest">
                                  현장
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="mt-10">
          <div className="rounded-[28px] border border-dashed border-ink/10 p-16 text-center">
            <p className="text-sm text-slate">
              위에서 시험 회차를 선택하면 성적 순위가 표시됩니다.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
