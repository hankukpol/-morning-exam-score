import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { DailySettlementView } from "@/components/settlements/daily-settlement-view";

export const dynamic = "force-dynamic";

export default async function DailySettlementPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const paidStatuses = ["APPROVED", "PARTIAL_REFUNDED"] as const;

  const [recentPayments, settlement, allPaymentsForDay] = await getPrisma().$transaction([
    getPrisma().payment.findMany({
      where: {
        status: { in: [...paidStatuses] },
        processedAt: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        student: { select: { name: true, examNumber: true } },
        processor: { select: { name: true } },
        items: true,
        refunds: { select: { amount: true, refundType: true, processedAt: true } },
      },
      orderBy: { processedAt: "desc" },
      take: 20,
    }),
    getPrisma().dailySettlement.findUnique({
      where: { date: new Date(todayStr) },
    }),
    getPrisma().payment.findMany({
      where: {
        status: { in: [...paidStatuses] },
        processedAt: { gte: startOfDay, lte: endOfDay },
      },
      select: {
        category: true,
        method: true,
        grossAmount: true,
        netAmount: true,
      },
    }),
  ]);

  const refundAgg = await getPrisma().refund.aggregate({
    where: { processedAt: { gte: startOfDay, lte: endOfDay } },
    _sum: { amount: true },
  });
  const refundTotal = refundAgg._sum.amount ?? 0;

  const categoryMap: Record<string, { count: number; gross: number }> = {};
  for (const p of allPaymentsForDay) {
    if (!categoryMap[p.category]) categoryMap[p.category] = { count: 0, gross: 0 };
    categoryMap[p.category].count += 1;
    categoryMap[p.category].gross += p.grossAmount;
  }

  const methodMap: Record<string, { count: number; amount: number }> = {};
  for (const p of allPaymentsForDay) {
    if (!methodMap[p.method]) methodMap[p.method] = { count: 0, amount: 0 };
    methodMap[p.method].count += 1;
    methodMap[p.method].amount += p.netAmount;
  }

  const grossTotal = allPaymentsForDay.reduce((s, p) => s + p.grossAmount, 0);

  const initialData = {
    date: todayStr,
    summary: {
      tuition: categoryMap["TUITION"] ?? { count: 0, gross: 0 },
      facility: categoryMap["FACILITY"] ?? { count: 0, gross: 0 },
      textbook: categoryMap["TEXTBOOK"] ?? { count: 0, gross: 0 },
      material: categoryMap["MATERIAL"] ?? { count: 0, gross: 0 },
      singleCourse: categoryMap["SINGLE_COURSE"] ?? { count: 0, gross: 0 },
      penalty: categoryMap["PENALTY"] ?? { count: 0, gross: 0 },
      etc: categoryMap["ETC"] ?? { count: 0, gross: 0 },
      totalCount: allPaymentsForDay.length,
      grossTotal,
      refundTotal,
      netTotal: grossTotal - refundTotal,
    },
    methods: {
      cash: methodMap["CASH"] ?? { count: 0, amount: 0 },
      card: methodMap["CARD"] ?? { count: 0, amount: 0 },
      transfer: methodMap["TRANSFER"] ?? { count: 0, amount: 0 },
    },
    settlement: settlement
      ? {
          ...settlement,
          date: settlement.date.toISOString(),
          closedAt: settlement.closedAt?.toISOString() ?? null,
          closedByName: null,
          reopenedAt: settlement.reopenedAt?.toISOString() ?? null,
          reopenedByName: null,
          cashActual: settlement.cashActual ?? null,
          cashDiff: settlement.cashDiff ?? null,
        }
      : null,
    recentPayments: recentPayments.map((p) => ({
      ...p,
      processedAt: p.processedAt.toISOString(),
      refunds: p.refunds.map((r) => ({
        ...r,
        processedAt: r.processedAt.toISOString(),
      })),
    })),
  };

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 정산
      </div>
      <h1 className="mt-5 text-3xl font-semibold">일계표</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        날짜별 수납 집계 및 현금 시재 마감을 처리합니다.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          prefetch={false}
          href={`/admin/payments/reconciliation?month=${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`}
          className="inline-flex items-center gap-2 rounded-full border border-ember/20 bg-ember/10 px-5 py-2.5 text-sm font-semibold text-ember transition hover:border-ember/40 hover:bg-ember/20"
        >
          대사 확인 →
        </Link>
        <Link
          prefetch={false}
          href="/admin/settlements/monthly"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/30"
        >
          월계표 →
        </Link>
      </div>
      <div className="mt-8">
        <DailySettlementView initialData={initialData} />
      </div>
    </div>
  );
}
