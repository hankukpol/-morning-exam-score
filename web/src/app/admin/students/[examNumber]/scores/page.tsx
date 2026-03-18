import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL, EXAM_TYPE_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const ATTEND_TYPE_LABEL = {
  NORMAL: "출석",
  LIVE: "라이브",
  EXCUSED: "사유 결시",
  ABSENT: "무단 결시",
} as const;

const ATTEND_TYPE_COLOR = {
  NORMAL: "bg-forest/10 text-forest border-forest/20",
  LIVE: "bg-sky-50 text-sky-700 border-sky-200",
  EXCUSED: "bg-amber-50 text-amber-700 border-amber-200",
  ABSENT: "bg-red-50 text-red-600 border-red-200",
} as const;

const SUB_NAV = [
  { href: "enrollments", label: "수업" },
  { href: "payments", label: "수납" },
  { href: "scores", label: "성적" },
  { href: "attendance", label: "출결" },
] as const;

type PageProps = {
  params: Promise<{ examNumber: string }>;
};

export default async function StudentScoresPage({ params }: PageProps) {
  const { examNumber } = await params;

  await requireAdminContext(AdminRole.TEACHER);

  // Fetch student basic info
  const student = await getPrisma().student.findUnique({
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

  // Fetch all score records with session + period info
  const scores = await getPrisma().score.findMany({
    where: { examNumber },
    include: {
      session: {
        include: {
          period: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ session: { examDate: "desc" } }],
  });

  // ── KPI calculations ─────────────────────────────────────────────────────
  const attendedScores = scores.filter(
    (s) => s.attendType !== "ABSENT" && s.finalScore !== null,
  );
  const scoredCount = attendedScores.length;
  const avgScore =
    scoredCount > 0
      ? Math.round(
          (attendedScores.reduce((sum, s) => sum + (s.finalScore ?? 0), 0) /
            scoredCount) *
            10,
        ) / 10
      : null;
  const maxScore =
    scoredCount > 0
      ? Math.max(...attendedScores.map((s) => s.finalScore ?? 0))
      : null;

  // ── Group by period ───────────────────────────────────────────────────────
  type PeriodGroup = {
    periodId: number;
    periodName: string;
    scores: typeof scores;
  };

  const periodMap = new Map<number, PeriodGroup>();
  for (const score of scores) {
    const pid = score.session.period.id;
    if (!periodMap.has(pid)) {
      periodMap.set(pid, {
        periodId: pid,
        periodName: score.session.period.name,
        scores: [],
      });
    }
    periodMap.get(pid)!.scores.push(score);
  }
  const periodGroups = Array.from(periodMap.values());

  return (
    <div className="p-8 sm:p-10">
      {/* ── 헤더 ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/admin/students/${examNumber}`}
            className="text-sm text-slate transition hover:text-ember"
          >
            ← {student.name} ({examNumber})
          </Link>
          <h1 className="mt-3 text-3xl font-semibold">
            {student.name}
            <span className="ml-3 text-xl font-normal text-slate">
              {examNumber}
            </span>
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
        <a
          href={`/api/students/${examNumber}/scores/export`}
          download
          className="mt-6 inline-flex items-center rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/40 hover:bg-ink/5"
        >
          Excel 내보내기
        </a>
      </div>

      {/* ── 서브 내비게이션 ──────────────────────────────────────────────── */}
      <div className="mt-6 flex gap-1 border-b border-ink/10">
        {SUB_NAV.map((item) => {
          const active = item.href === "scores";
          return (
            <Link
              key={item.href}
              href={`/admin/students/${examNumber}/${item.href}`}
              className={`rounded-t-2xl px-5 py-2.5 text-sm font-semibold transition ${
                active
                  ? "-mb-px border border-b-white border-ink/10 bg-white text-ink"
                  : "text-slate hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* ── KPI 카드 ─────────────────────────────────────────────────────── */}
      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            평균 점수
          </p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              avgScore === null
                ? "text-slate"
                : avgScore >= 80
                  ? "text-forest"
                  : avgScore >= 60
                    ? "text-amber-600"
                    : "text-red-600"
            }`}
          >
            {avgScore !== null ? `${avgScore}점` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">응시 회차 기준</p>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            최고 점수
          </p>
          <p className="mt-3 text-3xl font-semibold text-ember">
            {maxScore !== null ? `${maxScore}점` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">전체 기간 최고점</p>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            응시 횟수
          </p>
          <p className="mt-3 text-3xl font-semibold text-ink">
            {scoredCount}
            <span className="ml-1 text-base font-normal text-slate">
              / {scores.length}회
            </span>
          </p>
          <p className="mt-1 text-xs text-slate">응시 / 전체 회차</p>
        </article>
      </section>

      {/* ── 기간별 그룹 테이블 ───────────────────────────────────────────── */}
      <div className="mt-8 space-y-8">
        {periodGroups.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-12 text-center text-sm text-slate">
            성적 데이터가 없습니다.
          </div>
        ) : (
          periodGroups.map((group) => {
            const groupAttended = group.scores.filter(
              (s) => s.attendType !== "ABSENT" && s.finalScore !== null,
            );
            const groupAvg =
              groupAttended.length > 0
                ? Math.round(
                    (groupAttended.reduce(
                      (sum, s) => sum + (s.finalScore ?? 0),
                      0,
                    ) /
                      groupAttended.length) *
                      10,
                  ) / 10
                : null;

            return (
              <section
                key={group.periodId}
                className="rounded-[28px] border border-ink/10 bg-white shadow-panel"
              >
                {/* 기간 헤더 */}
                <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
                  <div>
                    <h2 className="text-base font-semibold text-ink">
                      {group.periodName}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate">
                      {group.scores.length}회차 ·{" "}
                      {groupAvg !== null
                        ? `평균 ${groupAvg}점`
                        : "응시 기록 없음"}
                    </p>
                  </div>
                  <span className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-slate">
                    {groupAttended.length}/{group.scores.length} 응시
                  </span>
                </div>

                {/* 테이블 */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-ink/5 text-left text-xs text-slate">
                        <th className="px-6 py-3 font-semibold">시험일</th>
                        <th className="px-4 py-3 font-semibold">주차</th>
                        <th className="px-4 py-3 font-semibold">과목</th>
                        <th className="px-4 py-3 font-semibold">출결</th>
                        <th className="px-4 py-3 text-right font-semibold">
                          점수
                        </th>
                        <th className="px-4 py-3 font-semibold">비고</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {group.scores.map((score) => (
                        <tr
                          key={score.id}
                          className="transition hover:bg-mist/40"
                        >
                          <td className="px-6 py-3 font-mono text-xs text-ink">
                            {formatDate(score.session.examDate)}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate">
                            {score.session.week}주차
                          </td>
                          <td className="px-4 py-3">
                            {SUBJECT_LABEL[score.session.subject] ??
                              score.session.subject}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ATTEND_TYPE_COLOR[score.attendType]}`}
                            >
                              {ATTEND_TYPE_LABEL[score.attendType]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {score.finalScore !== null ? (
                              <span
                                className={`font-semibold ${
                                  score.finalScore >= 80
                                    ? "text-forest"
                                    : score.finalScore >= 60
                                      ? "text-ink"
                                      : "text-red-600"
                                }`}
                              >
                                {score.finalScore}
                              </span>
                            ) : (
                              <span className="text-slate">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate">
                            {score.note ?? ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
