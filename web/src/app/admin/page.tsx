import { AdminRole, ExamType } from "@/generated/prisma";
import { getDashboardSummary } from "@/lib/analytics/service";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireAdminContext(AdminRole.VIEWER);
  let summary;
  try {
    summary = await getDashboardSummary();
  } catch (err) {
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error("[AdminDashboard] error:", msg);
    return (
      <div className="p-8">
        <h1 className="text-xl font-bold text-red-700">대시보드 오류 (getDashboardSummary)</h1>
        <pre className="mt-4 rounded bg-red-50 p-4 text-sm text-red-800 whitespace-pre-wrap break-all">{msg}</pre>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-8 sm:p-10">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          F-12 Dashboard
        </div>
        <h1 className="mt-5 text-3xl font-semibold">관리자 대시보드</h1>
        <p className="mt-4 text-sm leading-7 text-slate">
          아직 생성된 시험 기간이 없습니다. 먼저 시험 기간과 회차를 생성해 주세요.
        </p>
        <Link
          href="/admin/periods"
          className="mt-6 inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
        >
          시험 기간 관리로 이동
        </Link>
      </div>
    );
  }

  const totalStudents =
    summary.studentCounts.gongchae + summary.studentCounts.gyeongchae;
  const totalAlerts =
    summary.statusCounts.dropout +
    summary.statusCounts.warning2 +
    summary.statusCounts.warning1;

  const kpiCards = [
    {
      label: "등록 수강생",
      value: `${totalStudents}명`,
      sub: `공채 ${summary.studentCounts.gongchae} / 경채 ${summary.studentCounts.gyeongchae}`,
      href: "/admin/students",
      color: "border-forest/30 bg-forest/5",
      valueColor: "text-forest",
    },
    {
      label: "경고·탈락",
      value: `${totalAlerts}건`,
      sub: `탈락 ${summary.statusCounts.dropout} / 2차 ${summary.statusCounts.warning2} / 1차 ${summary.statusCounts.warning1}`,
      href: "/admin/dropout",
      color: totalAlerts > 0 ? "border-red-300 bg-red-50/50" : "border-ink/10 bg-white",
      valueColor: totalAlerts > 0 ? "text-red-700" : "text-ink",
    },
    {
      label: "미처리 사유서",
      value: `${summary.pendingAbsenceCount}건`,
      sub: `알림 대기 ${summary.pendingNotificationCount}건 별도`,
      href: "/admin/absence-notes",
      color:
        summary.pendingAbsenceCount > 0
          ? "border-amber-300 bg-amber-50/50"
          : "border-ink/10 bg-white",
      valueColor: summary.pendingAbsenceCount > 0 ? "text-amber-700" : "text-ink",
    },
    {
      label: "성적 미입력 회차",
      value: `${summary.missingScoredSessionCount}건`,
      sub: "기간 내 과거 회차 기준",
      href: "/admin/scores/input",
      color:
        summary.missingScoredSessionCount > 0
          ? "border-ember/30 bg-ember/5"
          : "border-ink/10 bg-white",
      valueColor:
        summary.missingScoredSessionCount > 0 ? "text-ember" : "text-ink",
    },
  ];

  const quickLinks = [
    { href: "/admin/scores/input", title: "성적 입력", description: "오프라인·온라인 업로드" },
    { href: "/admin/scores/edit", title: "성적 수정", description: "특정 성적 조회·수정·삭제" },
    { href: "/admin/weekly", title: "주간 현황", description: "이번 주 출결·경고 상태" },
    { href: "/admin/analytics", title: "성적 분석", description: "일별·월별·과목별 차트" },
    { href: "/admin/results/integrated", title: "통합 성적표", description: "기간 전체 석차 집계" },
    { href: "/admin/absence-notes", title: "사유서 심사", description: "대기 중 사유서 처리" },
    { href: "/admin/students", title: "수강생 명단", description: "명단 조회·등록·수정" },
    { href: "/admin/export", title: "데이터 내보내기", description: "성적·수강생 명단 xlsx" },
  ];

  const pendingActions = [
    summary.pendingAbsenceCount > 0 && {
      href: "/admin/absence-notes",
      label: `미처리 사유서 ${summary.pendingAbsenceCount}건`,
      description: "승인 또는 반려가 필요합니다.",
      color: "border-amber-300 bg-amber-50 text-amber-800",
    },
    summary.pendingNotificationCount > 0 && {
      href: "/admin/notifications",
      label: `발송 대기 알림 ${summary.pendingNotificationCount}건`,
      description: "알림톡 발송 큐에 대기 중입니다.",
      color: "border-blue-300 bg-blue-50 text-blue-800",
    },
    summary.missingScoredSessionCount > 0 && {
      href: "/admin/scores/input",
      label: `성적 미입력 회차 ${summary.missingScoredSessionCount}건`,
      description: "아직 성적이 입력되지 않은 과거 회차입니다.",
      color: "border-ember/30 bg-ember/5 text-ember",
    },
    summary.statusCounts.dropout > 0 && {
      href: "/admin/dropout",
      label: `탈락 확정 대상 ${summary.statusCounts.dropout}명`,
      description: "탈락 기준 충족 수강생을 확인하세요.",
      color: "border-red-300 bg-red-50 text-red-800",
    },
  ].filter(Boolean) as Array<{
    href: string;
    label: string;
    description: string;
    color: string;
  }>;

  return (
    <div className="space-y-8 p-6 sm:p-8 lg:p-10">
      {/* 헤더 */}
      <div>
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          F-12 Dashboard
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">관리자 대시보드</h1>
        <p className="mt-2 text-sm text-slate">
          {summary.activePeriod.name} ·{" "}
          {formatDate(summary.activePeriod.startDate)} ~{" "}
          {formatDate(summary.activePeriod.endDate)} ·{" "}
          {summary.currentWeekLabel}
        </p>
      </div>

      {/* KPI 카드 */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className={`rounded-[24px] border p-5 transition hover:shadow-md ${card.color}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">
              {card.label}
            </p>
            <p className={`mt-2 text-4xl font-bold ${card.valueColor}`}>{card.value}</p>
            <p className="mt-2 text-xs text-slate">{card.sub}</p>
          </Link>
        ))}
      </div>

      {/* 처리 필요 알림 */}
      {pendingActions.length > 0 ? (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-lg font-semibold">처리 필요 항목</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {pendingActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={`rounded-2xl border px-4 py-3 text-sm transition hover:opacity-80 ${action.color}`}
              >
                <p className="font-semibold">{action.label}</p>
                <p className="mt-1 text-xs opacity-80">{action.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <div className="rounded-[28px] border border-forest/20 bg-forest/10 px-5 py-4 text-sm text-forest">
          처리 대기 중인 항목이 없습니다.
        </div>
      )}

      {/* 오늘 시험 입력 현황 */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">오늘 시험 입력 현황</h2>
          <Link
            href="/admin/scores/input"
            className="text-sm font-semibold text-slate underline transition hover:text-ember"
          >
            성적 입력 화면으로 이동 →
          </Link>
        </div>

        {summary.todaySessions.length === 0 ? (
          <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            오늘 예정된 시험이 없습니다.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {summary.todaySessions.map((session) => {
              const expectedCount =
                session.examType === ExamType.GONGCHAE
                  ? summary.studentCounts.gongchae
                  : summary.studentCounts.gyeongchae;
              const completionRate =
                expectedCount === 0
                  ? 0
                  : Math.round((session._count.scores / expectedCount) * 1000) / 10;
              const isComplete = completionRate >= 100;

              return (
                <article
                  key={session.id}
                  className={`rounded-[24px] border p-5 ${
                    isComplete
                      ? "border-forest/30 bg-forest/5"
                      : "border-ink/10 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold">
                      {EXAM_TYPE_LABEL[session.examType]}
                    </span>
                    <span className={`text-sm font-bold ${isComplete ? "text-forest" : "text-ink"}`}>
                      {completionRate.toFixed(1)}%
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold">
                    {SUBJECT_LABEL[session.subject]}
                  </h3>
                  <div className="mt-4">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isComplete ? "bg-forest" : "bg-ember"
                        }`}
                        style={{ width: `${Math.min(completionRate, 100)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-slate">
                      <span>
                        <strong className="text-ink">{session._count.scores}</strong>건 완료
                      </span>
                      <span>총 {expectedCount}명 대상</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 바로가기 */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-semibold">주요 바로가기</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-start justify-between rounded-[20px] border border-ink/10 p-4 transition hover:border-forest/30 hover:bg-forest/5"
            >
              <div>
                <p className="text-sm font-semibold text-ink">{link.title}</p>
                <p className="mt-1 text-xs text-slate">{link.description}</p>
              </div>
              <span className="ml-2 mt-0.5 shrink-0 text-slate">→</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
