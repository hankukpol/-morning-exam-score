import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SendReminderButton } from "./send-reminder-button";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReminderItem = {
  id: string;
  paymentId: string;
  seq: number;
  amount: number;
  dueDate: string;
  overdueDays: number; // negative = upcoming
  payment: {
    id: string;
    examNumber: string | null;
    netAmount: number;
    note: string | null;
    student: {
      name: string;
      phone: string | null;
      notificationConsent: boolean;
    } | null;
    firstItemName: string | null;
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

function getDueDayLabel(overdueDays: number): { label: string; className: string } {
  if (overdueDays > 0) {
    return {
      label: `${overdueDays}일 연체`,
      className: "text-red-600 font-semibold",
    };
  }
  if (overdueDays === 0) {
    return { label: "오늘 만기", className: "text-amber-700 font-semibold" };
  }
  return { label: `D-${Math.abs(overdueDays)}`, className: "text-slate" };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function InstallmentRemindersPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const sevenDaysLater = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thisWeekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Query all unpaid installments that are overdue or due within 7 days
  const installments = await prisma.installment.findMany({
    where: {
      paidAt: null,
      dueDate: { lte: sevenDaysLater },
    },
    include: {
      payment: {
        select: {
          id: true,
          examNumber: true,
          netAmount: true,
          note: true,
          student: {
            select: {
              name: true,
              phone: true,
              notificationConsent: true,
            },
          },
          items: { select: { itemName: true }, take: 1 },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { seq: "asc" }],
    take: 200,
  });

  // KPI counts
  const [thisWeekCount, d7Count, overdueCount] = await Promise.all([
    prisma.installment.count({
      where: {
        paidAt: null,
        dueDate: { gte: todayStart, lte: thisWeekEnd },
      },
    }),
    prisma.installment.count({
      where: {
        paidAt: null,
        dueDate: { gte: todayStart, lte: sevenDaysLater },
      },
    }),
    prisma.installment.count({
      where: { paidAt: null, dueDate: { lt: todayStart } },
    }),
  ]);

  // Serialize with overdueDays
  const items: ReminderItem[] = installments.map((item) => {
    const due = item.dueDate;
    const diffMs = due.getTime() - todayStart.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    const overdueDays = diffDays <= 0 ? -diffDays : -diffDays; // positive = overdue

    // If dueDate < today => overdue (positive), else upcoming (negative-like)
    const isOverdue = due < todayStart;
    const computedDays = isOverdue
      ? Math.round((todayStart.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
      : -Math.round((due.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

    return {
      id: item.id,
      paymentId: item.paymentId,
      seq: item.seq,
      amount: item.amount,
      dueDate: formatDate(due),
      overdueDays: computedDays,
      payment: {
        id: item.payment.id,
        examNumber: item.payment.examNumber,
        netAmount: item.payment.netAmount,
        note: item.payment.note,
        student: item.payment.student ?? null,
        firstItemName: item.payment.items[0]?.itemName ?? null,
      },
    };
  });

  const overdueItems = items.filter((i) => i.overdueDays > 0).sort((a, b) => b.overdueDays - a.overdueDays);
  const upcomingItems = items.filter((i) => i.overdueDays <= 0).sort((a, b) => a.overdueDays - b.overdueDays);

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>
      <div className="mt-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold text-ink">분납 알림 현황</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate">
            연체 중이거나 7일 이내 만기 예정인 분납 회차를 확인하고 카카오 알림톡을 발송합니다.
          </p>
        </div>
        <Link
          href="/admin/payments/installments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
        >
          &larr; 할부 관리로
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-sky-200 bg-sky-50 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-sky-600">이번 주 만기</p>
          <p className="mt-2 text-3xl font-semibold text-sky-700">
            {thisWeekCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-sky-500">건 — 오늘 ~ D+7 만기</p>
        </div>

        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-amber-600">D-7 이내 예정</p>
          <p className="mt-2 text-3xl font-semibold text-amber-700">
            {d7Count.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-amber-500">건 — 7일 이내 납부 예정</p>
        </div>

        <div
          className={[
            "rounded-[28px] p-6 shadow-sm",
            overdueCount > 0
              ? "border border-red-200 bg-red-50"
              : "border border-ink/10 bg-white",
          ].join(" ")}
        >
          <p
            className={[
              "text-xs font-medium uppercase tracking-widest",
              overdueCount > 0 ? "text-red-600" : "text-slate",
            ].join(" ")}
          >
            연체 중
          </p>
          <p
            className={[
              "mt-2 text-3xl font-semibold",
              overdueCount > 0 ? "text-red-700" : "text-ink",
            ].join(" ")}
          >
            {overdueCount.toLocaleString()}
          </p>
          <p
            className={["mt-1 text-xs", overdueCount > 0 ? "text-red-500" : "text-slate"].join(
              " ",
            )}
          >
            건 — 납부 기한 초과
          </p>
        </div>
      </div>

      {/* Overdue section */}
      {overdueItems.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-ink">긴급 — 연체 분납</h2>
            <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
              {overdueItems.length}건
            </span>
          </div>
          <p className="mt-1 text-sm text-slate">납부 기한이 지난 미납 분납 회차입니다. 즉시 알림을 발송하세요.</p>

          <div className="mt-5 overflow-x-auto rounded-[28px] border border-red-200 bg-white shadow-panel">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-red-100 bg-red-50/60">
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">학생명</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">수강 정보</th>
                  <th className="px-5 py-3.5 text-right font-semibold text-ink">금액</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">만기일</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">연체</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">수신동의</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">상세</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">알림</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {overdueItems.map((item) => {
                  const dueLabel = getDueDayLabel(item.overdueDays);
                  const canSend = !!item.payment.student?.notificationConsent && !!item.payment.examNumber;
                  return (
                    <tr key={item.id} className="transition hover:bg-red-50/30">
                      <td className="px-5 py-4">
                        {item.payment.examNumber ? (
                          <Link
                            href={`/admin/students/${item.payment.examNumber}`}
                            className="font-medium text-ink hover:text-ember hover:underline"
                          >
                            {item.payment.student?.name ?? "-"}
                          </Link>
                        ) : (
                          <span className="font-medium text-ink">
                            {item.payment.student?.name ?? "-"}
                          </span>
                        )}
                        <div className="mt-0.5 text-xs text-slate">
                          {item.payment.examNumber ?? "학번 없음"}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate">
                        <div>{item.payment.firstItemName ?? "-"}</div>
                        <div className="text-xs text-slate/70">
                          {item.seq}회차 / 합계 {formatKRW(item.payment.netAmount)}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-semibold text-ink">
                        {formatKRW(item.amount)}
                      </td>
                      <td className="px-5 py-4 text-slate">{item.dueDate}</td>
                      <td className="px-5 py-4">
                        <span className={dueLabel.className}>{dueLabel.label}</span>
                      </td>
                      <td className="px-5 py-4">
                        {item.payment.student?.notificationConsent ? (
                          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                            동의
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-slate/20 bg-slate/10 px-2 py-0.5 text-xs font-medium text-slate">
                            미동의
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/payments/installments/${item.id}`}
                          className="inline-flex items-center rounded-full border border-ink/20 px-3 py-1 text-xs font-medium text-ink transition hover:border-ember/40 hover:text-ember"
                        >
                          상세보기
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <SendReminderButton
                          installmentId={item.id}
                          studentName={item.payment.student?.name ?? "학생"}
                          disabled={!canSend}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Upcoming section */}
      {upcomingItems.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-ink">D-7 이내 만기 예정</h2>
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
              {upcomingItems.length}건
            </span>
          </div>
          <p className="mt-1 text-sm text-slate">
            7일 이내에 납부 기한이 도래하는 분납 회차입니다. 사전 알림을 발송하세요.
          </p>

          <div className="mt-5 overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/5 bg-mist/40">
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">학생명</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">수강 정보</th>
                  <th className="px-5 py-3.5 text-right font-semibold text-ink">금액</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">만기일</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">D-Day</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">수신동의</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">상세</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">알림</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {upcomingItems.map((item) => {
                  const dueLabel = getDueDayLabel(item.overdueDays);
                  const canSend = !!item.payment.student?.notificationConsent && !!item.payment.examNumber;
                  return (
                    <tr key={item.id} className="transition hover:bg-mist/30">
                      <td className="px-5 py-4">
                        {item.payment.examNumber ? (
                          <Link
                            href={`/admin/students/${item.payment.examNumber}`}
                            className="font-medium text-ink hover:text-ember hover:underline"
                          >
                            {item.payment.student?.name ?? "-"}
                          </Link>
                        ) : (
                          <span className="font-medium text-ink">
                            {item.payment.student?.name ?? "-"}
                          </span>
                        )}
                        <div className="mt-0.5 text-xs text-slate">
                          {item.payment.examNumber ?? "학번 없음"}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate">
                        <div>{item.payment.firstItemName ?? "-"}</div>
                        <div className="text-xs text-slate/70">
                          {item.seq}회차 / 합계 {formatKRW(item.payment.netAmount)}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-semibold text-ink">
                        {formatKRW(item.amount)}
                      </td>
                      <td className="px-5 py-4 text-slate">{item.dueDate}</td>
                      <td className="px-5 py-4">
                        <span className={dueLabel.className}>{dueLabel.label}</span>
                      </td>
                      <td className="px-5 py-4">
                        {item.payment.student?.notificationConsent ? (
                          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                            동의
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-slate/20 bg-slate/10 px-2 py-0.5 text-xs font-medium text-slate">
                            미동의
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/payments/installments/${item.id}`}
                          className="inline-flex items-center rounded-full border border-ink/20 px-3 py-1 text-xs font-medium text-ink transition hover:border-ember/40 hover:text-ember"
                        >
                          상세보기
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <SendReminderButton
                          installmentId={item.id}
                          studentName={item.payment.student?.name ?? "학생"}
                          disabled={!canSend}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="mt-10 rounded-[28px] border border-ink/10 bg-white p-12 text-center shadow-panel">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-forest/10">
            <svg className="h-7 w-7 text-forest" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-ink">알림 발송 대상이 없습니다</h3>
          <p className="mt-2 text-sm text-slate">
            연체 분납 또는 7일 이내 만기 예정인 미납 회차가 없습니다.
          </p>
        </div>
      )}

      {/* Footer nav */}
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/admin/payments/installments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          &larr; 할부 관리로
        </Link>
        <Link
          href="/admin/payments/installments/calendar"
          className="inline-flex items-center gap-2 rounded-full border border-ember/20 bg-ember/5 px-5 py-2.5 text-sm font-medium text-ember transition hover:bg-ember/10"
        >
          달력 보기
        </Link>
      </div>
    </div>
  );
}
