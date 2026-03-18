import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { InstallmentManager, type InstallmentItem } from "./installment-manager";
import {
  InstallmentClient,
  type InstallmentDashboardRow,
  type InstallmentDashboardStats,
} from "./installment-client";

export const dynamic = "force-dynamic";

export default async function InstallmentsPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const weekLater = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  // ── Dashboard data ────────────────────────────────────────────────────────
  // Fetch all installments (with enrollment/cohort info)
  const allInstallments = await prisma.installment.findMany({
    include: {
      payment: {
        select: {
          id: true,
          examNumber: true,
          enrollmentId: true,
          student: { select: { name: true } },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { seq: "asc" }],
    take: 500,
  });

  // Collect enrollmentIds to look up cohort info
  const enrollmentIds = [
    ...new Set(
      allInstallments
        .map((i) => i.payment.enrollmentId)
        .filter((id): id is string => id !== null),
    ),
  ];

  const enrollments = await prisma.courseEnrollment.findMany({
    where: { id: { in: enrollmentIds } },
    select: {
      id: true,
      cohort: { select: { name: true } },
    },
  });

  const enrollmentMap: Record<string, string | null> = {};
  for (const e of enrollments) {
    enrollmentMap[e.id] = e.cohort?.name ?? null;
  }

  // Build dashboard rows
  const dashboardRows: InstallmentDashboardRow[] = allInstallments.map((item) => {
    const dueDate = item.dueDate;
    const isOverdue = item.paidAt === null && dueDate < todayStart;
    const daysOverdue = isOverdue
      ? Math.floor((todayStart.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const cohortName = item.payment.enrollmentId
      ? (enrollmentMap[item.payment.enrollmentId] ?? null)
      : null;

    return {
      id: item.id,
      paymentId: item.paymentId,
      seq: item.seq,
      amount: item.amount,
      dueDate: item.dueDate.toISOString(),
      paidAt: item.paidAt?.toISOString() ?? null,
      examNumber: item.payment.examNumber ?? null,
      studentName: item.payment.student?.name ?? null,
      cohortName,
      daysOverdue,
    };
  });

  // Stats
  const unpaidRows = dashboardRows.filter((r) => r.paidAt === null);
  const overdueRows = dashboardRows.filter(
    (r) => r.paidAt === null && new Date(r.dueDate) < todayStart,
  );
  const upcomingRows = dashboardRows.filter(
    (r) =>
      r.paidAt === null &&
      new Date(r.dueDate) >= todayStart &&
      new Date(r.dueDate) <= weekLater,
  );
  const paidRows = dashboardRows.filter((r) => r.paidAt !== null);

  const totalOutstanding = unpaidRows.reduce((s, r) => s + r.amount, 0);
  const collectionRate =
    dashboardRows.length > 0
      ? (paidRows.length / dashboardRows.length) * 100
      : 0;

  const stats: InstallmentDashboardStats = {
    totalOutstanding,
    overdueCount: overdueRows.length,
    upcomingWeekCount: upcomingRows.length,
    collectionRate,
  };

  // ── Management data (initial overdue items) ───────────────────────────────
  const initialItems = await prisma.installment.findMany({
    where: { paidAt: null, dueDate: { lt: todayStart } },
    include: {
      payment: {
        select: {
          id: true,
          examNumber: true,
          category: true,
          netAmount: true,
          note: true,
          student: { select: { name: true, phone: true } },
          items: { select: { itemName: true }, take: 1 },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { seq: "asc" }],
    take: 100,
  });

  const [overdueCount, upcomingCount, paidCount] = await Promise.all([
    prisma.installment.count({
      where: { paidAt: null, dueDate: { lt: todayStart } },
    }),
    prisma.installment.count({
      where: { paidAt: null, dueDate: { gte: todayStart } },
    }),
    prisma.installment.count({
      where: { paidAt: { not: null } },
    }),
  ]);

  const serialized: InstallmentItem[] = initialItems.map((item) => ({
    id: item.id,
    paymentId: item.paymentId,
    seq: item.seq,
    amount: item.amount,
    dueDate: item.dueDate.toISOString(),
    paidAt: item.paidAt?.toISOString() ?? null,
    paidPaymentId: item.paidPaymentId,
    payment: {
      id: item.payment.id,
      examNumber: item.payment.examNumber,
      category: item.payment.category,
      netAmount: item.payment.netAmount,
      note: item.payment.note,
      student: item.payment.student ?? null,
      firstItemName: item.payment.items[0]?.itemName ?? null,
    },
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>

      {/* Header */}
      <div className="mt-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">분납 관리 대시보드</h1>
          <p className="mt-1 text-sm text-slate">
            분할납부 약정 현황 조회 및 수납 처리
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {overdueCount > 0 ? (
            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
              연체 {overdueCount.toLocaleString()}건
            </span>
          ) : null}
          <Link
            href="/admin/payments/installments/reminders"
            className="inline-flex items-center gap-2 rounded-full border border-forest/30 bg-forest/5 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            분납 알림 관리
          </Link>
          <Link
            href="/admin/payments/installments/calendar"
            className="inline-flex items-center gap-2 rounded-full border border-ember/30 bg-ember/5 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            달력 보기
          </Link>
        </div>
      </div>

      {/* Breadcrumb */}
      <nav className="mt-4 flex items-center gap-1.5 text-xs text-slate">
        <Link href="/admin/payments" className="hover:text-ember hover:underline">
          수납 관리
        </Link>
        <span>/</span>
        <span className="font-medium text-ink">분납 관리</span>
      </nav>

      {/* ── Dashboard (stats + table with filter tabs) ── */}
      <div className="mt-8">
        <InstallmentClient rows={dashboardRows} stats={stats} />
      </div>

      {/* Divider */}
      <div className="mt-12 border-t border-ink/10 pt-8">
        <h2 className="text-xl font-semibold text-ink">납부 처리</h2>
        <p className="mt-1 text-sm text-slate">
          개별 분납 회차 납부 처리 및 상태 관리
        </p>
      </div>

      {/* Legacy management table */}
      <div className="mt-6">
        <InstallmentManager
          initialItems={serialized}
          initialStatus="overdue"
          summary={{ overdueCount, upcomingCount, paidCount }}
        />
      </div>

      <div className="mt-6">
        <Link
          href="/admin/payments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          &larr; 수납 이력으로
        </Link>
      </div>
    </div>
  );
}
