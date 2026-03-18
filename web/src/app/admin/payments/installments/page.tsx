import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { InstallmentManager, type InstallmentItem } from "./installment-manager";

export const dynamic = "force-dynamic";

export default async function InstallmentsPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  // Initial data: overdue items
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

  // Summary counts
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

  // Serialize: convert Date objects to ISO strings for client component
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
      {/* Header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수강 관리
      </div>
      <div className="mt-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">할부 관리</h1>
          <p className="mt-1 text-sm text-slate">
            분할납부 약정 회차별 납부 현황 조회 및 납부 처리
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {overdueCount > 0 ? (
            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
              연체 {overdueCount.toLocaleString()}건
            </span>
          ) : null}
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

      {/* Summary cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-red-600">연체</p>
          <p className="mt-2 text-3xl font-semibold text-red-700">
            {overdueCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-red-500">건 — 예정일 초과, 미납</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">예정</p>
          <p className="mt-2 text-3xl font-semibold text-ink">
            {upcomingCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건 — 오늘 이후 납부 예정</p>
        </div>

        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-forest">완납</p>
          <p className="mt-2 text-3xl font-semibold text-forest">
            {paidCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-forest/60">건 — 납부 완료</p>
        </div>
      </div>

      {/* Client component (filter tabs + table + actions) */}
      <div className="mt-8">
        <InstallmentManager
          initialItems={serialized}
          initialStatus="overdue"
          summary={{ overdueCount, upcomingCount, paidCount }}
        />
      </div>

      <div className="mt-6">
        <a
          href="/admin/payments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          &larr; 수납 이력으로
        </a>
      </div>
    </div>
  );
}
