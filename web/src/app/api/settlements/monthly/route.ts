import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

function parseMonthParam(param: string | null): { year: number; month: number } {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const { year, month } = parseMonthParam(sp.get("month"));

  const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999); // last day of month

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const paidStatuses = ["APPROVED", "PARTIAL_REFUNDED"] as const;

  const allPayments = await getPrisma().payment.findMany({
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
  });

  // Refunds for the month
  const allRefunds = await getPrisma().refund.findMany({
    where: {
      processedAt: { gte: startOfMonth, lte: endOfMonth },
    },
    select: {
      amount: true,
      processedAt: true,
    },
  });

  const refundTotal = allRefunds.reduce((s, r) => s + r.amount, 0);
  const grossTotal = allPayments.reduce((s, p) => s + p.grossAmount, 0);
  const netTotal = grossTotal - refundTotal;
  const totalCount = allPayments.length;

  // Category breakdown
  const categoryMap: Record<string, { count: number; gross: number; refund: number }> = {};
  for (const p of allPayments) {
    if (!categoryMap[p.category]) {
      categoryMap[p.category] = { count: 0, gross: 0, refund: 0 };
    }
    categoryMap[p.category].count += 1;
    categoryMap[p.category].gross += p.grossAmount;
  }

  // Method breakdown
  const methodMap: Record<string, { count: number; amount: number }> = {};
  for (const p of allPayments) {
    if (!methodMap[p.method]) {
      methodMap[p.method] = { count: 0, amount: 0 };
    }
    methodMap[p.method].count += 1;
    methodMap[p.method].amount += p.netAmount;
  }

  // Daily breakdown
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyBreakdown: Array<{
    date: string;
    count: number;
    gross: number;
    refund: number;
    net: number;
  }> = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0);
    const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999);

    const dayPayments = allPayments.filter((p) => {
      const t = new Date(p.processedAt).getTime();
      return t >= dayStart.getTime() && t <= dayEnd.getTime();
    });
    const dayRefunds = allRefunds.filter((r) => {
      const t = new Date(r.processedAt).getTime();
      return t >= dayStart.getTime() && t <= dayEnd.getTime();
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

  const summary = {
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
  };

  const methods = {
    cash: methodMap["CASH"] ?? { count: 0, amount: 0 },
    card: methodMap["CARD"] ?? { count: 0, amount: 0 },
    transfer: methodMap["TRANSFER"] ?? { count: 0, amount: 0 },
  };

  return NextResponse.json({
    month: monthStr,
    summary,
    methods,
    dailyBreakdown,
  });
}
