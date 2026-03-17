import Link from "next/link";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

function nowKST(): Date {
  // Returns current wall-clock time (server locale = KST in prod, UTC+0 in dev)
  return new Date();
}

function startOfDayOffset(base: Date, offsetDays: number): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function formatDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}.${month}.${day}(${weekdays[d.getDay()]})`;
}

export default async function ScoresHubPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const now = nowKST();
  const todayStart = startOfDayOffset(now, 0);
  const weekAgo = startOfDayOffset(now, -7);
  const monthAgo = startOfDayOffset(now, -30);

  // ── 이번 주 응시 세션 수 ───────────────────────────────────────────
  const weekSessionCount = await getPrisma().examSession.count({
    where: {
      examDate: { gte: weekAgo, lt: todayStart },
      isCancelled: false,
    },
  });

  // ── 이번 달 총 성적 입력 건수 ─────────────────────────────────────
  const monthScoreCount = await getPrisma().score.count({
    where: {
      createdAt: { gte: monthAgo },
    },
  });

  // ── 미입력 세션 수 (최근 30일, 취소 안 된 세션 중 score가 0건) ──────
  const recentSessions = await getPrisma().examSession.findMany({
    where: {
      examDate: { gte: monthAgo, lt: todayStart },
      isCancelled: false,
    },
    select: {
      id: true,
      _count: { select: { scores: true } },
    },
  });
  const missingEntryCount = recentSessions.filter((s) => s._count.scores === 0).length;

  // ── 현재 기수 수 (isActive = true) ────────────────────────────────
  const activePeriodCount = await getPrisma().examPeriod.count({
    where: { isActive: true },
  });

  // ── 최근 10개 세션 (날짜 내림차순) ────────────────────────────────
  const recentSessionRows = await getPrisma().examSession.findMany({
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
      isCancelled: true,
      isLocked: true,
      period: { select: { id: true, name: true, isActive: true } },
      scores: {
        select: { finalScore: true, attendType: true },
      },
    },
  });

  type RecentRow = {
    id: number;
    examType: string;
    week: number;
    subject: string;
    examDate: Date;
    isLocked: boolean;
    periodName: string;
    periodIsActive: boolean;
    totalScores: number;
    avgScore: number | null;
  };

  const recentRows: RecentRow[] = recentSessionRows.map((s) => {
    const validScores = s.scores.filter(
      (sc) => sc.attendType === AttendType.NORMAL || sc.attendType === AttendType.LIVE,
    );
    const scoreValues = validScores
      .map((sc) => sc.finalScore)
      .filter((v): v is number => v !== null && v !== undefined);
    const avgScore =
      scoreValues.length > 0
        ? Math.round((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) * 10) / 10
        : null;

    return {
      id: s.id,
      examType: s.examType,
      week: s.week,
      subject: s.displaySubjectName ?? SUBJECT_LABEL[s.subject] ?? s.subject,
      examDate: s.examDate,
      isLocked: s.isLocked,
      periodName: s.period.name,
      periodIsActive: s.period.isActive,
      totalScores: s.scores.length,
      avgScore,
    };
  });

  // ── 미입력 세션 알림 (최근 30일, score 0건) ──────────────────────
  const missingSessions = await getPrisma().examSession.findMany({
    where: {
      examDate: { gte: monthAgo, lt: todayStart },
      isCancelled: false,
      scores: { none: {} },
    },
    orderBy: { examDate: "desc" },
    take: 20,
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

  return (
    <div className="p-8 sm:p-10">
      {/* ── 헤더 ──────────────────────────────────────────────────────── */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        성적 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">성적 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        아침 모의고사 성적 입력·수정·일괄 처리의 허브 페이지입니다.
        KPI와 최근 세션 현황을 확인하고, 각 기능 페이지로 바로 이동합니다.
      </p>

      {/* ── KPI 카드 ─────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          현황 요약
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
              이번 주 응시 세션
            </p>
            <p className="mt-3 text-3xl font-semibold text-ink">{weekSessionCount}</p>
            <p className="mt-1 text-xs text-slate">최근 7일 비취소 세션</p>
          </article>

          <article className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-forest">
              이번 달 성적 입력
            </p>
            <p className="mt-3 text-3xl font-semibold text-forest">{monthScoreCount}</p>
            <p className="mt-1 text-xs text-slate">최근 30일 누적 입력 건수</p>
          </article>

          <article
            className={`rounded-[28px] border p-6 shadow-panel ${
              missingEntryCount > 0
                ? "border-amber-200 bg-amber-50/60"
                : "border-ink/10 bg-white"
            }`}
          >
            <p
              className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                missingEntryCount > 0 ? "text-amber-700" : "text-slate"
              }`}
            >
              미입력 세션
            </p>
            <p
              className={`mt-3 text-3xl font-semibold ${
                missingEntryCount > 0 ? "text-amber-700" : "text-ink"
              }`}
            >
              {missingEntryCount}
            </p>
            <p className="mt-1 text-xs text-slate">최근 30일 기준 성적 없는 세션</p>
          </article>

          <article className="rounded-[28px] border border-ember/20 bg-ember/5 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember">
              현재 기수
            </p>
            <p className="mt-3 text-3xl font-semibold text-ember">{activePeriodCount}</p>
            <p className="mt-1 text-xs text-slate">활성(isActive) 시험 기간 수</p>
          </article>
        </div>
      </section>

      {/* ── 빠른 이동 ─────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          빠른 이동
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* 성적 입력 */}
          <Link
            href="/admin/scores/input"
            className="group rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel transition hover:border-ember/30 hover:shadow-md"
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-ember/10 text-ember transition group-hover:bg-ember/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                />
              </svg>
            </div>
            <p className="font-semibold text-ink">성적 입력</p>
            <p className="mt-1 text-xs leading-5 text-slate">
              XLS·HTML·붙여넣기로 회차별 성적 업로드
            </p>
          </Link>

          {/* 일괄 입력 */}
          <Link
            href="/admin/scores/bulk"
            className="group rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel transition hover:border-forest/30 hover:shadow-md"
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-forest/10 text-forest transition group-hover:bg-forest/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C6.504 8.25 7 7.746 7 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.5 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-9.75 0h9.75"
                />
              </svg>
            </div>
            <p className="font-semibold text-ink">성적 일괄 입력</p>
            <p className="mt-1 text-xs leading-5 text-slate">
              표 형식으로 학생별 점수를 한 번에 입력
            </p>
          </Link>

          {/* 성적 수정 */}
          <Link
            href="/admin/scores/edit"
            className="group rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel transition hover:border-ember/30 hover:shadow-md"
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-ember/10 text-ember transition group-hover:bg-ember/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                />
              </svg>
            </div>
            <p className="font-semibold text-ink">성적 수정</p>
            <p className="mt-1 text-xs leading-5 text-slate">
              기존 성적 조회·수정·삭제
            </p>
          </Link>

          {/* 성적 일괄 업로드 (CSV) */}
          <Link
            href="/admin/scores/bulk-import"
            className="group rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel transition hover:border-forest/30 hover:shadow-md"
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-forest/10 text-forest transition group-hover:bg-forest/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
            </div>
            <p className="font-semibold text-ink">성적 일괄 업로드</p>
            <p className="mt-1 text-xs leading-5 text-slate">
              CSV 파일로 대량 성적 일괄 등록
            </p>
          </Link>

          {/* 아침 모의고사 현황 */}
          <Link
            href="/admin/exams/morning/scores"
            className="group rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel transition hover:border-forest/30 hover:shadow-md"
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 transition group-hover:bg-sky-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
                />
              </svg>
            </div>
            <p className="font-semibold text-ink">아침 모의고사 현황</p>
            <p className="mt-1 text-xs leading-5 text-slate">
              기간별 회차 성적 현황 조회
            </p>
          </Link>

          {/* 시험 기간 관리 */}
          <Link
            href="/admin/periods"
            className="group rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel transition hover:border-ink/20 hover:shadow-md"
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-ink/5 text-ink/60 transition group-hover:bg-ink/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                />
              </svg>
            </div>
            <p className="font-semibold text-ink">시험 기간 관리</p>
            <p className="mt-1 text-xs leading-5 text-slate">
              기수·기간·회차 설정 및 활성화
            </p>
          </Link>
        </div>
      </section>

      {/* ── 미입력 세션 알림 ──────────────────────────────────────────── */}
      {missingSessions.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
            미입력 세션 알림 (최근 30일)
          </h2>
          <div className="rounded-[28px] border border-amber-200 bg-amber-50/60 shadow-panel">
            <div className="flex items-start gap-3 border-b border-amber-200 px-6 py-4">
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
              <p className="text-sm text-amber-800">
                아래 {missingSessions.length}개 세션에 성적이 입력되지 않았습니다.{" "}
                <Link href="/admin/scores/input" className="font-semibold underline hover:text-amber-900">
                  성적 입력 →
                </Link>
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-amber-200/60">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                      날짜
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                      기수
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                      직렬
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                      주차
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                      과목
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                      바로가기
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-200/40">
                  {missingSessions.map((s) => (
                    <tr key={s.id} className="transition hover:bg-amber-100/40">
                      <td className="px-6 py-3 text-slate">{formatDate(s.examDate)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-sm text-ink">
                          {s.period.name}
                          {s.period.isActive && (
                            <span className="rounded-full bg-forest/10 px-1.5 py-0.5 text-[10px] font-semibold text-forest">
                              현재
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            s.examType === "GONGCHAE"
                              ? "border-forest/30 bg-forest/10 text-forest"
                              : "border-ember/30 bg-ember/10 text-ember"
                          }`}
                        >
                          {EXAM_TYPE_LABEL[s.examType as keyof typeof EXAM_TYPE_LABEL] ?? s.examType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs font-semibold text-slate">
                          {s.week}주
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">
                        {s.displaySubjectName ?? SUBJECT_LABEL[s.subject as keyof typeof SUBJECT_LABEL] ?? s.subject}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/scores/input?sessionId=${s.id}`}
                          className="inline-flex items-center rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                        >
                          입력
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ── 최근 세션 현황 ────────────────────────────────────────────── */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate">
            최근 세션 현황 (최근 10건)
          </h2>
          <Link
            href="/admin/exams/morning/scores"
            className="text-xs font-semibold text-forest transition hover:underline"
          >
            전체 보기 →
          </Link>
        </div>

        {recentRows.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            등록된 세션이 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      날짜
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      기수
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      직렬
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      주차
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      과목
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      입력 수
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      평균
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      관리
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {recentRows.map((row) => (
                    <tr key={row.id} className="transition hover:bg-mist/60">
                      <td className="px-6 py-3 text-slate">{formatDate(row.examDate)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-sm text-ink">
                          {row.periodName}
                          {row.periodIsActive && (
                            <span className="rounded-full bg-forest/10 px-1.5 py-0.5 text-[10px] font-semibold text-forest">
                              현재
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            row.examType === "GONGCHAE"
                              ? "border-forest/30 bg-forest/10 text-forest"
                              : "border-ember/30 bg-ember/10 text-ember"
                          }`}
                        >
                          {EXAM_TYPE_LABEL[row.examType as keyof typeof EXAM_TYPE_LABEL] ?? row.examType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs font-semibold text-slate">
                          {row.week}주
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">{row.subject}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink">
                        {row.totalScores > 0 ? (
                          row.totalScores
                        ) : (
                          <span className="text-amber-600 font-semibold">미입력</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-ink">
                        {row.avgScore !== null ? (
                          <span>{row.avgScore}점</span>
                        ) : (
                          <span className="font-normal text-ink/25">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/admin/scores/sessions/${row.id}`}
                            className="inline-flex items-center rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink"
                          >
                            상세
                          </Link>
                          {row.totalScores === 0 ? (
                            <Link
                              href={`/admin/scores/input?sessionId=${row.id}`}
                              className="inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember transition hover:bg-ember/20"
                            >
                              입력
                            </Link>
                          ) : (
                            <Link
                              href={`/admin/scores/edit?sessionId=${row.id}`}
                              className="inline-flex items-center rounded-full border border-forest/30 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/10"
                            >
                              수정
                            </Link>
                          )}
                          {row.isLocked && (
                            <span className="inline-flex items-center rounded-full border border-ink/10 bg-ink/5 px-2.5 py-0.5 text-[10px] font-semibold text-slate">
                              잠김
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
