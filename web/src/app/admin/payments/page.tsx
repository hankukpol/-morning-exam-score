import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  PaymentList,
  type PaymentWithRelations,
} from "@/components/payments/payment-list";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  // Quick unpaid stats for the header badge
  const [unpaidCount, overdueCount] = await Promise.all([
    getPrisma().installment.count({ where: { paidAt: null } }),
    getPrisma().installment.count({
      where: {
        paidAt: null,
        dueDate: { lt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0) },
      },
    }),
  ]);

  const payments = await getPrisma().payment.findMany({
    where: {
      processedAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    include: {
      student: { select: { name: true, phone: true } },
      processor: { select: { name: true } },
      items: true,
      refunds: { select: { amount: true, refundType: true, processedAt: true } },
    },
    orderBy: { processedAt: "desc" },
    take: 200,
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>

      {/* Header row with title + unpaid link */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">수납 내역</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">
            현금 및 계좌이체 수납을 등록하고 내역을 조회합니다. 오늘 날짜가 기본으로 표시되며 날짜 범위를
            변경하여 조회할 수 있습니다.
          </p>
        </div>

        {/* Unpaid shortcut */}
        <Link
          href="/admin/payments/unpaid"
          className={[
            "inline-flex items-center gap-2 rounded-[16px] border px-5 py-3 text-sm font-medium shadow-sm transition-colors",
            overdueCount > 0
              ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
              : unpaidCount > 0
                ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border-ink/20 bg-white text-ink hover:border-ink/40",
          ].join(" ")}
        >
          <span className="flex flex-col items-start">
            <span className="font-semibold">미납 현황</span>
            <span className="text-xs opacity-80">
              {overdueCount > 0
                ? `연체 ${overdueCount.toLocaleString()}건 포함`
                : unpaidCount > 0
                  ? `미납 ${unpaidCount.toLocaleString()}건`
                  : "미납 없음"}
            </span>
          </span>
          <span className="text-lg">→</span>
        </Link>
      </div>

      {/* Quick links */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/admin/payments/reconciliation"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ember/30 hover:text-ember"
        >
          일별 수납 대사 →
        </Link>
        <Link
          href="/admin/settlements/daily"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
        >
          일계표 →
        </Link>
        <Link
          href="/admin/settlements/monthly"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
        >
          월계표 →
        </Link>
      </div>

      <div className="mt-6">
        <PaymentList initialPayments={payments as unknown as PaymentWithRelations[]} />
      </div>
    </div>
  );
}
