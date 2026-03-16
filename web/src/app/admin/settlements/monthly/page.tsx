import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { MonthlySettlementView } from "@/components/settlements/monthly-settlement-view";

export const dynamic = "force-dynamic";

export default async function MonthlySettlementPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  const paidStatuses = ["APPROVED", "PARTIAL_REFUNDED"] as const;

  const [allPayments, allRefunds] = await getPrisma().$transaction([
    getPrisma().payment.findMany({
      where: {
        status: { in: [...paidStatuses] },
        processedAt: { gte: startOfMonth, lte: endOfMonth },
      },
      select: {
        category: true,
        method: true,
        grossAmount: true,
        netAmount: true,
        processedAt: true,
      },
    }),
    getPrisma().refund.findMany({
      where: {
        processedAt: { gte: startOfMonth, lte: endOfMonth },
      },
      select: {
        amount: true,
        processedAt: true,
      },
    }),
  ]);

  const refundTotal = allRefunds.reduce((s, r) => s + r.amount, 0);
  const grossTotal = allPayments.reduce((s, p) => s + p.grossAmount, 0);
  const netTotal = grossTotal - refundTotal;
  const totalCount = allPayments.length;

  const categoryMap: Record<string, { count: number; gross: number; refund: number }> = {};
  for (const p of allPayments) {
    if (!categoryMap[p.category]) categoryMap[p.category] = { count: 0, gross: 0, refund: 0 };
    categoryMap[p.category].count += 1;
    categoryMap[p.category].gross += p.grossAmount;
  }

  const methodMap: Record<string, { count: number; amount: number }> = {};
  for (const p of allPayments) {
    if (!methodMap[p.method]) methodMap[p.method] = { count: 0, amount: 0 };
    methodMap[p.method].count += 1;
    methodMap[p.method].amount += p.netAmount;
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyBreakdown: Array<{
    date: string;
    count: number;
    gross: number;
    refund: number;
    net: number;
  }> = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();

    const dayPayments = allPayments.filter((p) => {
      const t = new Date(p.processedAt).getTime();
      return t >= dayStart && t <= dayEnd;
    });
    const dayRefunds = allRefunds.filter((r) => {
      const t = new Date(r.processedAt).getTime();
      return t >= dayStart && t <= dayEnd;
    });

    const dayCount = dayPayments.length;
    const dayGross = dayPayments.reduce((s, p) => s + p.grossAmount, 0);
    const dayRefund = dayRefunds.reduce((s, r) => s + r.amount, 0);
    const dayNet = dayGross - dayRefund;

    if (dayCount > 0 || dayRefund > 0) {
      dailyBreakdown.push({
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        count: dayCount,
        gross: dayGross,
        refund: dayRefund,
        net: dayNet,
      });
    }
  }

  const initialData = {
    month: monthStr,
    summary: {
      tuition: categoryMap["TUITION"] ?? { count: 0, gross: 0, refund: 0 },
      facility: categoryMap["FACILITY"] ?? { count: 0, gross: 0, refund: 0 },
      textbook: categoryMap["TEXTBOOK"] ?? { count: 0, gross: 0, refund: 0 },
      material: categoryMap["MATERIAL"] ?? { count: 0, gross: 0, refund: 0 },
      singleCourse: categoryMap["SINGLE_COURSE"] ?? { count: 0, gross: 0, refund: 0 },
      penalty: categoryMap["PENALTY"] ?? { count: 0, gross: 0, refund: 0 },
      etc: categoryMap["ETC"] ?? { count: 0, gross: 0, refund: 0 },
      totalCount,
      grossTotal,
      refundTotal,
      netTotal,
    },
    methods: {
      cash: methodMap["CASH"] ?? { count: 0, amount: 0 },
      card: methodMap["CARD"] ?? { count: 0, amount: 0 },
      transfer: methodMap["TRANSFER"] ?? { count: 0, amount: 0 },
    },
    dailyBreakdown,
  };

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 정산
      </div>
      <h1 className="mt-5 text-3xl font-semibold">월계표</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        월별 수납 집계 및 일별 수납 추이를 조회합니다.
      </p>
      <div className="mt-8">
        <MonthlySettlementView initialData={initialData} />
      </div>
    </div>
  );
}
