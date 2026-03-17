import Link from "next/link";
import { AdminRole, ExamType } from "@prisma/client";
import { DashboardInboxPanel } from "@/components/dashboard/dashboard-inbox-panel";
import { AdminMemoDashboardPanel } from "@/components/memos/admin-memo-dashboard-panel";
import { Sparkline } from "@/components/ui/sparkline";
import { getDashboardSummary } from "@/lib/analytics/service";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { listDashboardInboxData } from "@/lib/dashboard/inbox";
import {
  getDisplayErrorDetails,
  getDisplayErrorMessage,
  getServerErrorLogMessage,
} from "@/lib/error-display";
import { formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const context = await requireAdminContext(AdminRole.VIEWER);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const in7Days = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [summaryResult, inboxResult, enrollmentKpi, urgentKpi] = await Promise.all([
    getDashboardSummary()
      .then((data) => ({ ok: true as const, data }))
      .catch((err: unknown) => ({ ok: false as const, err })),
    listDashboardInboxData({
      includeFailedNotifications: context.adminUser.role !== AdminRole.VIEWER,
    })
      .then((data) => ({ ok: true as const, data }))
      .catch((err: unknown) => ({ ok: false as const, err })),
    getPrisma()
      .$transaction([
        getPrisma().courseEnrollment.count({ where: { status: "ACTIVE" } }),
        getPrisma().courseEnrollment.count({ where: { status: "WAITING" } }),
        getPrisma().courseEnrollment.count({ where: { createdAt: { gte: weekAgo } } }),
        getPrisma().payment.count({
          where: { processedAt: { gte: todayStart, lte: todayEnd } },
        }),
        getPrisma().payment.aggregate({
          where: { processedAt: { gte: todayStart, lte: todayEnd } },
          _sum: { netAmount: true },
        }),
      ])
      .then(([activeCount, waitingCount, newThisWeek, todayCount, todayAgg]) => ({
        activeCount,
        waitingCount,
        newThisWeek,
        todayCount,
        todayNet: todayAgg._sum.netAmount ?? 0,
      }))
      .catch(() => null),
    getPrisma()
      .$transaction([
        getPrisma().courseEnrollment.count({
          where: { status: "ACTIVE", endDate: { gte: todayStart, lte: in7Days } },
        }),
        getPrisma().installment.count({
          where: { paidAt: null, dueDate: { lt: todayStart } },
        }),
        getPrisma().courseEnrollment.count({
          where: { createdAt: { gte: todayStart } },
        }),
      ])
      .then(([expiringCount, overdueInstallments, todayNewEnrollments]) => ({
        expiringCount,
        overdueInstallments,
        todayNewEnrollments,
      }))
      .catch(() => null),
  ]);

  if (!summaryResult.ok) {
    const err = summaryResult.err;
    const details = getDisplayErrorDetails(err);
    console.error("[AdminDashboard] error:", getServerErrorLogMessage(err));
    return (
      <div className="p-8">
        <h1 className="text-xl font-bold text-red-700">대시보드 오류</h1>
        <p className="mt-4 text-sm text-slate">
          {getDisplayErrorMessage(err, "대시보드를 불러오는 중 오류가 발생했습니다.")}
        </p>
        {details ? (
          <pre className="mt-4 whitespace-pre-wrap break-all rounded bg-red-50 p-4 text-sm text-red-800">
            {details}
          </pre>
        ) : null}
      </div>
    );
  }

  const summary = summaryResult.data;
  const dashboardInbox = inboxResult.ok ? inboxResult.data : null;

  if (!inboxResult.ok) {
    console.error("[AdminDashboardInbox] error:", getServerErrorLogMessage(inboxResult.err));
  }

  if (!summary) {
    return (
      <div className="p-8 sm:p-10">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          F-12 대시보드
        </div>
        <h1 className="mt-5 text-3xl font-semibold">관리자 대시보드</h1>
        <p className="mt-4 text-sm leading-7 text-slate">
          아직 시험 기간이 없습니다. 먼저 기간과 회차를 등록해 주세요.
        </p>
        <Link
          href="/admin/periods"
          className="btn-ripple mt-6 inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
        >
          기간 관리 열기
        </Link>
      </div>
    );
  }

  const totalStudents = summary.studentCounts.gongchae + summary.studentCounts.gyeongchae;
  const totalAlerts =
    summary.statusCounts.dropout + summary.statusCounts.warning2 + summary.statusCounts.warning1;
  const recentScoreWeekCount = summary.weeklyAvgScoreTrend.length;

  const kpiCards = [
    {
      label: "주간 평균 점수",
      value: summary.weeklyAvgScore !== null ? `${summary.weeklyAvgScore.toFixed(1)}점` : "-",
      sub:
        recentScoreWeekCount > 0
          ? `최근 완료된 ${recentScoreWeekCount}주 기준`
          : "최근 주간 데이터가 없습니다.",
      href: "/admin/analytics",
      color: "border-ember/30 bg-ember/5",
      valueColor: "text-ember",
      trend: summary.weeklyAvgScoreTrend,
      trendColor: "#C55A11",
      trendCaption: "최근 주간 점수 추이",
      trendPositiveIsGood: true,
    },
    {
      label: "활성 학생",
      value: `${totalStudents}`,
      sub: `공채 ${summary.studentCounts.gongchae} / 경채 ${summary.studentCounts.gyeongchae}`,
      href: "/admin/students",
      color: "border-forest/30 bg-forest/5",
      valueColor: "text-forest",
    },
    {
      label: "경고 · 탈락",
      value: `${totalAlerts}`,
      sub: `탈락 ${summary.statusCounts.dropout} / 2차 경고 ${summary.statusCounts.warning2} / 1차 경고 ${summary.statusCounts.warning1}`,
      href: "/admin/dropout",
      color: totalAlerts > 0 ? "border-red-300 bg-red-50/50" : "border-ink/10 bg-white",
      valueColor: totalAlerts > 0 ? "text-red-700" : "text-ink",
      trend: summary.alertCountTrend,
      trendColor: "#DC2626",
      trendCaption: "최근 8주 경고 추이",
      trendPositiveIsGood: false,
    },
    {
      label: "검토 대기 사유서",
      value: `${summary.pendingAbsenceCount}`,
      sub:
        context.adminUser.role !== AdminRole.VIEWER
          ? `${summary.pendingNotificationCount}건 알림이 별도로 대기 중`
          : "검토 대기 사유서 현황",
      href: "/admin/absence-notes",
      color:
        summary.pendingAbsenceCount > 0
          ? "border-amber-300 bg-amber-50/50"
          : "border-ink/10 bg-white",
      valueColor: summary.pendingAbsenceCount > 0 ? "text-amber-700" : "text-ink",
    },
    {
      label: "성적 미입력 회차",
      value: `${summary.missingScoredSessionCount}`,
      sub: "활성 기간 내 과거 회차 기준",
      href: "/admin/scores/input",
      color:
        summary.missingScoredSessionCount > 0
          ? "border-ember/30 bg-ember/5"
          : "border-ink/10 bg-white",
      valueColor: summary.missingScoredSessionCount > 0 ? "text-ember" : "text-ink",
    },
  ];

  const quickLinks = [
    { href: "/admin/memos", title: "운영 메모", description: "오늘의 메모 스트림과 작업 보드" },
    { href: "/admin/scores/input", title: "성적 입력", description: "오프라인과 온라인 업로드" },
    { href: "/admin/scores/edit", title: "성적 수정", description: "기록 조회, 수정, 삭제" },
    { href: "/admin/dropout", title: "경고 · 탈락", description: "위험 학생 필터와 안내 발송" },
    { href: "/admin/analytics", title: "분석", description: "일별, 월별, 과목별 분석" },
    { href: "/admin/results/integrated", title: "통합 결과표", description: "기간 전체 석차 출력" },
    { href: "/admin/absence-notes", title: "사유서 검토", description: "대기 중인 사유서 처리" },
    context.adminUser.role !== AdminRole.VIEWER
      ? { href: "/admin/notifications", title: "알림 센터", description: "대기·실패 알림과 발송 이력" }
      : null,
    { href: "/admin/students", title: "학생 목록", description: "학생 조회, 등록, 수정" },
    { href: "/admin/export", title: "내보내기", description: "성적과 학생 데이터 xlsx 다운로드" },
    context.adminUser.role !== AdminRole.VIEWER
      ? { href: "/admin/settings/courses", title: "강좌 마스터", description: "강좌 생성, 수정, 기수 관리" }
      : null,
    context.adminUser.role !== AdminRole.VIEWER
      ? { href: "/admin/settings/textbooks", title: "교재 관리", description: "교재 등록, 재고 조정" }
      : null,
  ].filter((item): item is { href: string; title: string; description: string } => item !== null);

  const fallbackAttentionLinks = [
    {
      href: "/admin/absence-notes",
      label: "검토 대기 사유서",
      value: summary.pendingAbsenceCount,
      valueLabel: `${summary.pendingAbsenceCount}`,
      description: "검토 대기 목록 열기",
      className: "border-amber-200 bg-amber-50/70 text-amber-800",
    },
    {
      href: "/admin/notifications",
      label: "대기·실패 알림",
      value: context.adminUser.role !== AdminRole.VIEWER ? summary.pendingNotificationCount : 0,
      valueLabel:
        context.adminUser.role !== AdminRole.VIEWER && summary.pendingNotificationCount === 0
          ? "확인"
          : `${context.adminUser.role !== AdminRole.VIEWER ? summary.pendingNotificationCount : 0}`,
      description: "알림 센터에서 대기·실패 건 확인",
      className: "border-red-200 bg-red-50/70 text-red-800",
      alwaysShow: context.adminUser.role !== AdminRole.VIEWER,
    },
    {
      href: "/admin/scores/input",
      label: "성적 미입력 회차",
      value: summary.missingScoredSessionCount,
      valueLabel: `${summary.missingScoredSessionCount}`,
      description: "성적 입력 화면 열기",
      className: "border-sky-200 bg-sky-50/70 text-sky-800",
    },
  ].filter((item) => item.alwaysShow || item.value > 0);

  return (
    <div className="space-y-8 p-6 sm:p-8 lg:p-10">
      <div>
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          F-12 대시보드
        </div>

        <h1 className="mt-4 text-3xl font-semibold text-ink">관리자 대시보드</h1>
        <p className="mt-2 text-sm text-slate">
          {summary.activePeriod.name} / {formatDate(summary.activePeriod.startDate)} ~ {formatDate(summary.activePeriod.endDate)} / {summary.currentWeekLabel}
        </p>
      </div>

      <AdminMemoDashboardPanel
        currentAdminId={context.adminUser.id}
        currentAdminRole={context.adminUser.role}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpiCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className={`card-lift btn-ripple rounded-[24px] border p-5 transition hover:shadow-md ${card.color}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">{card.label}</p>
            <p className={`count-animated mt-2 text-4xl font-bold ${card.valueColor}`}>{card.value}</p>
            <p className="mt-2 text-xs text-slate">{card.sub}</p>
            {card.trend && card.trend.length > 0 ? (
              <div className="mt-4 rounded-[18px] border border-ink/10 bg-white/70 px-3 py-2">
                <Sparkline
                  data={card.trend}
                  color={card.trendColor}
                  positiveIsGood={card.trendPositiveIsGood}
                />
                <p className="mt-1 text-[11px] text-slate">{card.trendCaption}</p>
              </div>
            ) : null}
          </Link>
        ))}
      </div>

      {dashboardInbox ? (
        <DashboardInboxPanel
          initialData={dashboardInbox}
          canRetry={context.adminUser.role !== AdminRole.VIEWER}
        />
      ) : (
        <section className="rounded-[28px] border border-red-200 bg-red-50/70 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-red-800">즉시 처리 필요</h2>
              <p className="mt-2 text-sm leading-7 text-red-700">
                인박스 데이터를 불러오지 못했습니다. 아래 요약 기반 바로가기에서 운영 작업을 계속 진행할 수 있습니다.
              </p>
            </div>
            <div className="inline-flex rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700">
              요약 기반 안내
            </div>
          </div>

          {fallbackAttentionLinks.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-red-200 bg-white/80 px-5 py-8 text-sm text-red-700">
              현재 요약 기준으로 바로 처리할 항목은 없습니다.
            </div>
          ) : (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {fallbackAttentionLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-[24px] border p-5 transition hover:shadow-sm ${item.className}`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wider">{item.label}</p>
                  <p className="mt-2 text-3xl font-bold">{item.valueLabel}</p>
                  <p className="mt-2 text-sm">{item.description}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">오늘 성적 입력 현황</h2>
          <Link
            href="/admin/scores/input"
            className="text-sm font-semibold text-slate underline transition hover:text-ember"
          >
            성적 입력 열기
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
                  className={`card-lift rounded-[24px] border p-5 ${
                    isComplete ? "border-forest/30 bg-forest/5" : "border-ink/10 bg-white"
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
                  <h3 className="mt-3 text-lg font-semibold">{SUBJECT_LABEL[session.subject]}</h3>
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
                        <strong className="text-ink">{session._count.scores}</strong> 입력 완료
                      </span>
                      <span>{expectedCount} 대상 학생</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-mist/60 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">수강관리 현황</h2>
            <p className="mt-1 text-xs text-slate">오늘 기준 실시간 수강·수납 현황</p>
          </div>
          <Link
            href="/admin/enrollments"
            className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/20"
          >
            수강 목록 열기
          </Link>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/admin/enrollments"
            className="card-lift rounded-[20px] border border-forest/20 bg-white p-5 transition hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">총 수강생</p>
            <p className="count-animated mt-2 text-4xl font-bold text-forest">
              {enrollmentKpi ? enrollmentKpi.activeCount.toLocaleString() : "—"}
            </p>
            <p className="mt-2 text-xs text-slate">현재 수강 중인 전체 학생</p>
          </Link>
          <Link
            href="/admin/payments"
            className="card-lift rounded-[20px] border border-ember/20 bg-white p-5 transition hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">오늘 수납</p>
            <p className="count-animated mt-2 text-4xl font-bold text-ember">
              {enrollmentKpi ? enrollmentKpi.todayCount.toLocaleString() : "—"}
            </p>
            <p className="mt-2 text-xs text-slate">
              {enrollmentKpi
                ? `합계 ${enrollmentKpi.todayNet.toLocaleString()}원`
                : "오늘 수납 건수"}
            </p>
          </Link>
          <Link
            href="/admin/enrollments"
            className={`card-lift rounded-[20px] border bg-white p-5 transition hover:shadow-md ${
              enrollmentKpi && enrollmentKpi.waitingCount > 0
                ? "border-amber-200"
                : "border-ink/10"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">대기자</p>
            <p
              className={`count-animated mt-2 text-4xl font-bold ${
                enrollmentKpi && enrollmentKpi.waitingCount > 0 ? "text-amber-600" : "text-ink"
              }`}
            >
              {enrollmentKpi ? enrollmentKpi.waitingCount.toLocaleString() : "—"}
            </p>
            <p className="mt-2 text-xs text-slate">등록 대기 중인 학생 수</p>
          </Link>
          <Link
            href="/admin/enrollments"
            className="card-lift rounded-[20px] border border-ink/10 bg-white p-5 transition hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">이번 주 신규</p>
            <p className="count-animated mt-2 text-4xl font-bold text-ink">
              {enrollmentKpi ? enrollmentKpi.newThisWeek.toLocaleString() : "—"}
            </p>
            <p className="mt-2 text-xs text-slate">최근 7일 신규 수강 등록</p>
          </Link>
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">오늘 처리 필요</h2>
            <p className="mt-1 text-xs text-slate">만료 예정·미납·신규 등록 현황</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {/* 만료 예정 수강생 */}
          <Link
            href="/admin/enrollments/expiring?days=7"
            className={`card-lift rounded-[20px] border p-5 transition hover:shadow-md ${
              urgentKpi && urgentKpi.expiringCount > 0
                ? "border-red-200 bg-red-50"
                : "border-forest/20 bg-forest/5"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">
              만료 예정 수강생
            </p>
            <p
              className={`count-animated mt-2 text-4xl font-bold ${
                urgentKpi && urgentKpi.expiringCount > 0 ? "text-red-700" : "text-forest"
              }`}
            >
              {urgentKpi ? urgentKpi.expiringCount.toLocaleString() : "—"}
            </p>
            <p className="mt-2 text-xs text-slate">
              {urgentKpi && urgentKpi.expiringCount > 0
                ? "7일 이내 수강 만료 예정"
                : "7일 이내 만료 없음"}
            </p>
            <p className="mt-3 text-xs font-semibold text-slate underline">목록 보기 →</p>
          </Link>

          {/* 미납 분할납부 */}
          <Link
            href="/admin/payments/unpaid"
            className={`card-lift rounded-[20px] border p-5 transition hover:shadow-md ${
              urgentKpi && urgentKpi.overdueInstallments > 0
                ? "border-red-200 bg-red-50"
                : "border-ink/10 bg-white"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">
              미납 분할납부
            </p>
            <p
              className={`count-animated mt-2 text-4xl font-bold ${
                urgentKpi && urgentKpi.overdueInstallments > 0 ? "text-red-700" : "text-ink"
              }`}
            >
              {urgentKpi ? urgentKpi.overdueInstallments.toLocaleString() : "—"}
            </p>
            <p className="mt-2 text-xs text-slate">
              {urgentKpi && urgentKpi.overdueInstallments > 0
                ? "납부 기한 초과 미납 건"
                : "미납 분할납부 없음"}
            </p>
            <p className="mt-3 text-xs font-semibold text-slate underline">미납 목록 →</p>
          </Link>

          {/* 오늘 신규 등록 */}
          <Link
            href="/admin/enrollments"
            className="card-lift rounded-[20px] border border-forest/20 bg-forest/5 p-5 transition hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">
              오늘 신규 등록
            </p>
            <p className="count-animated mt-2 text-4xl font-bold text-forest">
              {urgentKpi ? urgentKpi.todayNewEnrollments.toLocaleString() : "—"}
            </p>
            <p className="mt-2 text-xs text-slate">오늘 새로 등록된 수강 건수</p>
            <p className="mt-3 text-xs font-semibold text-slate underline">전체 목록 →</p>
          </Link>
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-semibold">바로가기</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="card-lift btn-ripple flex items-start justify-between rounded-[20px] border border-ink/10 p-4 transition hover:border-forest/30 hover:bg-forest/5"
            >
              <div>
                <p className="text-sm font-semibold text-ink">{link.title}</p>
                <p className="mt-1 text-xs text-slate">{link.description}</p>
              </div>
              <span className="ml-2 mt-0.5 shrink-0 text-slate">-&gt;</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}