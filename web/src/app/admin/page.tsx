import { AdminRole, ExamType } from "@/generated/prisma";
import { requireAdminContext } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/analytics/service";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireAdminContext(AdminRole.VIEWER);
  const summary = await getDashboardSummary();

  if (!summary) {
    return (
      <div className="p-8 sm:p-10">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          F-12 Dashboard
        </div>
        <h1 className="mt-5 text-3xl font-semibold">대시보드</h1>
        <p className="mt-4 text-sm leading-7 text-slate">
          아직 생성된 시험 기간이 없습니다. 먼저 시험 기간을 만들고 회차를 생성하세요.
        </p>
      </div>
    );
  }

  const cards = [
    {
      label: "활성 기간",
      value: summary.activePeriod.name,
      helper: `${formatDate(summary.activePeriod.startDate)} ~ ${formatDate(summary.activePeriod.endDate)}`,
    },
    {
      label: "활성 수강생",
      value: `${summary.studentCounts.gongchae + summary.studentCounts.gyeongchae}명`,
      helper: `공채 ${summary.studentCounts.gongchae}명 / 경채 ${summary.studentCounts.gyeongchae}명`,
    },
    {
      label: "경고 · 탈락",
      value: `${summary.statusCounts.dropout + summary.statusCounts.warning2 + summary.statusCounts.warning1}명`,
      helper: `탈락 ${summary.statusCounts.dropout} / 2차 ${summary.statusCounts.warning2} / 1차 ${summary.statusCounts.warning1}`,
    },
    {
      label: "미처리 알림",
      value: `${summary.pendingNotificationCount}건`,
      helper: `대기 사유서 ${summary.pendingAbsenceCount}건`,
    },
  ];

  const quickLinks = [
    {
      href: "/admin/weekly",
      title: "주간현황",
      description: "주차별 응시, 결시, 경고 상태를 한 번에 확인합니다.",
    },
    {
      href: "/admin/dropout",
      title: "탈락/경고 관리",
      description: "주 3회, 월 8회 기준 자동 판정을 검토합니다.",
    },
    {
      href: "/admin/results/integrated",
      title: "통합 성적",
      description: "기존생/신규생 통합 및 분리 석차를 확인합니다.",
    },
    {
      href: "/admin/points",
      title: "포인트 관리",
      description: "개근 장학 자동 대상과 수동 지급 이력을 관리합니다.",
    },
    {
      href: "/admin/notifications",
      title: "알림 발송",
      description: "자동 큐와 수신 동의, 수동 발송 이력을 관리합니다.",
    },
    {
      href: "/admin/absence-notes",
      title: "사유서 관리",
      description: "사유 결시 등록과 승인, 개근 인정 여부를 처리합니다.",
    },
  ];

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-12 Dashboard
      </div>
      <h1 className="mt-5 text-3xl font-semibold">운영 대시보드</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        오늘 시험, 점수 입력 진행률, 경고/탈락 현황, 대기 중인 운영 이슈를 한 화면에서 확인합니다.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article key={card.label} className="rounded-[28px] border border-ink/10 bg-mist p-6">
            <p className="text-sm text-slate">{card.label}</p>
            <p className="mt-4 text-2xl font-semibold leading-tight">{card.value}</p>
            <p className="mt-3 text-xs leading-6 text-slate">{card.helper}</p>
          </article>
        ))}
      </div>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">오늘 시험</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              오늘 날짜에 잡힌 회차별로 현재 점수 입력 수를 집계합니다.
            </p>
          </div>
          <Link
            href="/admin/scores/input"
            className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            성적 입력으로 이동
          </Link>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {summary.todaySessions.length === 0 ? (
            <article className="rounded-[24px] border border-dashed border-ink/10 p-6 text-sm text-slate lg:col-span-2">
              오늘 예정된 시험이 없습니다.
            </article>
          ) : null}
          {summary.todaySessions.map((session) => {
            const expectedCount =
              session.examType === ExamType.GONGCHAE
                ? summary.studentCounts.gongchae
                : summary.studentCounts.gyeongchae;
            const completionRate =
              expectedCount === 0
                ? 0
                : Math.round((session._count.scores / expectedCount) * 1000) / 10;

            return (
              <article key={session.id} className="rounded-[24px] border border-ink/10 bg-mist p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{EXAM_TYPE_LABEL[session.examType]}</p>
                  <p className="text-xs text-slate">{formatDate(session.examDate)}</p>
                </div>
                <h3 className="mt-3 text-2xl font-semibold">{SUBJECT_LABEL[session.subject]}</h3>
                <p className="mt-4 text-sm text-slate">
                  입력 완료 {session._count.scores} / 예상 {expectedCount}명
                </p>
                <p className="mt-2 text-sm font-semibold text-ink">{completionRate.toFixed(1)}%</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        {quickLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-[28px] border border-ink/10 bg-white p-6 transition hover:border-ember/30 hover:bg-mist"
          >
            <h2 className="text-xl font-semibold">{item.title}</h2>
            <p className="mt-3 text-sm leading-7 text-slate">{item.description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
