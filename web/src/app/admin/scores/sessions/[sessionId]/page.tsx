import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL, ATTEND_TYPE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ sessionId: string }> };

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${year}년 ${month}월 ${day}일 (${weekdays[d.getDay()]})`;
}

function scoreColorClass(score: number, top10Threshold: number, bottom20Threshold: number): string {
  if (score >= top10Threshold) return "text-forest font-semibold";
  if (score <= bottom20Threshold) return "text-amber-600 font-semibold";
  return "text-ink";
}

export default async function ScoreSessionDetailPage({ params }: PageProps) {
  const { sessionId } = await params;
  await requireAdminContext(AdminRole.TEACHER);

  const id = Number(sessionId);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const session = await getPrisma().examSession.findUnique({
    where: { id },
    include: {
      period: true,
      scores: {
        include: {
          student: {
            select: {
              examNumber: true,
              name: true,
              phone: true,
              examType: true,
            },
          },
        },
        orderBy: { examNumber: "asc" },
      },
    },
  });

  if (!session) notFound();

  // ── 통계 계산 ──────────────────────────────────────────────────────
  // 정상 응시자 (NORMAL / LIVE) 만 집계
  const presentScores = session.scores.filter(
    (s) => s.attendType === AttendType.NORMAL || s.attendType === AttendType.LIVE,
  );

  const scoreValues = presentScores
    .map((s) => s.finalScore)
    .filter((v): v is number => v !== null && v !== undefined);

  const totalParticipants = session.scores.length;
  const presentCount = presentScores.length;
  const avgScore =
    scoreValues.length > 0
      ? Math.round((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) * 10) / 10
      : null;
  const highestScore = scoreValues.length > 0 ? Math.max(...scoreValues) : null;
  const lowestScore = scoreValues.length > 0 ? Math.min(...scoreValues) : null;

  // 100점 만점 기준 40점 미만을 과락으로 표시 (단, finalScore 없으면 제외)
  const failThreshold = 40;
  const failCount = scoreValues.filter((v) => v < failThreshold).length;

  // 상위 10% / 하위 20% 컷오프
  const sorted = [...scoreValues].sort((a, b) => b - a);
  const top10Index = Math.max(0, Math.ceil(sorted.length * 0.1) - 1);
  const bottom20Index = Math.max(0, Math.floor(sorted.length * 0.8));
  const top10Threshold = sorted.length > 0 ? sorted[top10Index] : Infinity;
  const bottom20Threshold = sorted.length > 0 ? sorted[bottom20Index] : -Infinity;

  // ── 순위 부여: finalScore가 있는 응시자만 ──────────────────────────
  const rankedScores = session.scores
    .map((s) => {
      const score = s.finalScore ?? null;
      return { ...s, rank: null as number | null, computedScore: score };
    })
    .sort((a, b) => {
      if (a.computedScore === null && b.computedScore === null) return 0;
      if (a.computedScore === null) return 1;
      if (b.computedScore === null) return -1;
      return b.computedScore - a.computedScore;
    });

  // dense rank
  let currentRank = 0;
  let prevScore: number | null = undefined as unknown as number | null;
  for (const row of rankedScores) {
    if (
      row.attendType === AttendType.NORMAL ||
      row.attendType === AttendType.LIVE
    ) {
      if (row.computedScore !== prevScore) {
        currentRank += 1;
        prevScore = row.computedScore;
      }
      row.rank = currentRank;
    }
  }

  const subjectLabel =
    session.displaySubjectName?.trim() ||
    SUBJECT_LABEL[session.subject] ||
    session.subject;

  const examTypeLabel =
    EXAM_TYPE_LABEL[session.examType as keyof typeof EXAM_TYPE_LABEL] ??
    session.examType;

  return (
    <div className="p-8 sm:p-10">
      {/* ── 헤더 ──────────────────────────────────────────────────────── */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        성적 관리
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Link
          href="/admin/scores"
          className="text-sm text-slate transition hover:text-ember"
        >
          ← 성적 허브
        </Link>
        <Link
          href={`/admin/scores/sessions/${session.id}/edit`}
          className="inline-flex items-center rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-slate transition hover:border-ember/30 hover:text-ember"
        >
          회차 수정
        </Link>
      </div>

      <h1 className="mt-3 text-2xl font-semibold text-ink sm:text-3xl">
        {formatDate(session.examDate)} — {examTypeLabel}
      </h1>
      <p className="mt-1 text-sm text-slate">
        {session.period.name} &middot; {session.week}주차 &middot; {subjectLabel}
        {session.isLocked && (
          <span className="ml-2 inline-flex items-center rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-[10px] font-semibold text-slate">
            잠김
          </span>
        )}
        {session.isCancelled && (
          <span className="ml-2 inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
            취소됨
          </span>
        )}
      </p>

      {/* ── KPI 카드 ─────────────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
              응시자 수
            </p>
            <p className="mt-3 text-3xl font-semibold text-ink">{presentCount}</p>
            <p className="mt-1 text-xs text-slate">전체 등록 {totalParticipants}명</p>
          </article>

          <article className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-forest">
              평균 점수
            </p>
            <p className="mt-3 text-3xl font-semibold text-forest">
              {avgScore !== null ? `${avgScore}점` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate">정상 응시자 기준</p>
          </article>

          <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
              최고점 / 최저점
            </p>
            <p className="mt-3 text-xl font-semibold text-ink">
              {highestScore !== null ? `${highestScore}점` : "—"}
              <span className="mx-1.5 text-ink/30">/</span>
              {lowestScore !== null ? `${lowestScore}점` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate">정상 응시자 기준</p>
          </article>

          <article
            className={`rounded-[28px] border p-6 shadow-panel ${
              failCount > 0
                ? "border-amber-200 bg-amber-50/60"
                : "border-ink/10 bg-white"
            }`}
          >
            <p
              className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                failCount > 0 ? "text-amber-700" : "text-slate"
              }`}
            >
              40점 미만 (과락)
            </p>
            <p
              className={`mt-3 text-3xl font-semibold ${
                failCount > 0 ? "text-amber-700" : "text-ink"
              }`}
            >
              {failCount}명
            </p>
            <p className="mt-1 text-xs text-slate">finalScore &lt; 40점</p>
          </article>
        </div>
      </section>

      {/* ── 성적 테이블 ──────────────────────────────────────────────── */}
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate">
            성적 목록 ({rankedScores.length}명)
          </h2>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/scores/sessions/${session.id}/print`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/40 hover:bg-ink/5"
            >
              성적표 인쇄
            </Link>
            <Link
              href={`/admin/scores/edit?sessionId=${session.id}`}
              className="inline-flex items-center rounded-full border border-forest/30 px-4 py-1.5 text-xs font-semibold text-forest transition hover:bg-forest/10"
            >
              수정
            </Link>
            <Link
              href={`/admin/scores/input?sessionId=${session.id}`}
              className="inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-4 py-1.5 text-xs font-semibold text-ember transition hover:bg-ember/20"
            >
              성적 입력
            </Link>
          </div>
        </div>

        {rankedScores.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            등록된 성적이 없습니다.{" "}
            <Link
              href={`/admin/scores/input?sessionId=${session.id}`}
              className="font-semibold text-ember hover:underline"
            >
              성적 입력 →
            </Link>
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            {/* 범례 */}
            <div className="flex flex-wrap items-center gap-4 border-b border-ink/5 px-6 py-3">
              <span className="text-xs text-slate">색상 기준:</span>
              <span className="flex items-center gap-1.5 text-xs">
                <span className="h-2 w-2 rounded-full bg-forest"></span>
                <span className="text-forest font-semibold">상위 10%</span>
              </span>
              <span className="flex items-center gap-1.5 text-xs">
                <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                <span className="text-amber-600 font-semibold">하위 20%</span>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      순위
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      학번
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      이름
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      직렬
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      원점수
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      OX 점수
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      최종 점수
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      출결
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {rankedScores.map((row) => {
                    const score = row.computedScore;
                    const colorClass =
                      score !== null &&
                      (row.attendType === AttendType.NORMAL ||
                        row.attendType === AttendType.LIVE)
                        ? scoreColorClass(score, top10Threshold, bottom20Threshold)
                        : "text-ink/40";

                    const isAbsent =
                      row.attendType === AttendType.ABSENT ||
                      row.attendType === AttendType.EXCUSED;

                    return (
                      <tr
                        key={row.id}
                        className={`transition hover:bg-mist/60 ${isAbsent ? "opacity-60" : ""}`}
                      >
                        <td className="px-5 py-3 text-right">
                          {row.rank !== null ? (
                            <span
                              className={`font-mono text-sm font-semibold ${
                                row.rank === 1
                                  ? "text-amber-600"
                                  : row.rank <= 3
                                  ? "text-forest"
                                  : "text-slate"
                              }`}
                            >
                              {row.rank}
                            </span>
                          ) : (
                            <span className="text-ink/25">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate">
                          <Link
                            href={`/admin/students/${row.student.examNumber}`}
                            className="hover:text-ember hover:underline"
                          >
                            {row.student.examNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">
                          <Link
                            href={`/admin/students/${row.student.examNumber}`}
                            className="hover:text-ember hover:underline"
                          >
                            {row.student.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                              row.student.examType === "GONGCHAE"
                                ? "border-forest/30 bg-forest/10 text-forest"
                                : "border-ember/30 bg-ember/10 text-ember"
                            }`}
                          >
                            {EXAM_TYPE_LABEL[
                              row.student.examType as keyof typeof EXAM_TYPE_LABEL
                            ] ?? row.student.examType}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono ${colorClass}`}>
                          {row.rawScore !== null && row.rawScore !== undefined
                            ? row.rawScore
                            : <span className="text-ink/25">—</span>}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono ${colorClass}`}>
                          {row.oxScore !== null && row.oxScore !== undefined
                            ? row.oxScore
                            : <span className="text-ink/25">—</span>}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono text-base ${colorClass}`}>
                          {score !== null
                            ? score
                            : <span className="text-ink/25">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                              row.attendType === AttendType.NORMAL
                                ? "border-forest/20 bg-forest/5 text-forest"
                                : row.attendType === AttendType.LIVE
                                ? "border-sky-200 bg-sky-50 text-sky-700"
                                : row.attendType === AttendType.EXCUSED
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-red-200 bg-red-50 text-red-600"
                            }`}
                          >
                            {ATTEND_TYPE_LABEL[row.attendType] ?? row.attendType}
                          </span>
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

      {/* ── 하단 액션 ─────────────────────────────────────────────────── */}
      <section className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href={`/api/scores/export?sessionId=${session.id}`}
          className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-white px-5 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-forest/40 hover:bg-forest/5 hover:text-forest"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-4 w-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
          Excel 내보내기
        </Link>
        <Link
          href="/admin/scores"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 성적 허브로
        </Link>
      </section>
    </div>
  );
}
