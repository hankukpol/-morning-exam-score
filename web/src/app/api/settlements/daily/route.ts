import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

function parseDateParam(param: string | null): Date {
  if (param) {
    const parsed = new Date(param + "T00:00:00");
    if (!isNaN(parsed.getTime())) return parsed;
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const date = parseDateParam(sp.get("date"));

  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const paidStatuses = ["APPROVED", "PARTIAL_REFUNDED"] as const;

  const [payments, settlement] = await getPrisma().$transaction([
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
      where: { date: new Date(dateStr) },
    }),
  ]);

  // Aggregate all payments for the day (not just top 20)
  const allPayments = await getPrisma().payment.findMany({
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
  });

  // Category breakdown
  const categoryMap: Record<
    string,
    { count: number; gross: number }
  > = {};
  for (const p of allPayments) {
    if (!categoryMap[p.category]) {
      categoryMap[p.category] = { count: 0, gross: 0 };
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

  // Refunds from Refund table for the day
  const refundAgg = await getPrisma().refund.aggregate({
    where: {
      processedAt: { gte: startOfDay, lte: endOfDay },
    },
    _sum: { amount: true },
  });
  const refundTotal = refundAgg._sum.amount ?? 0;

  const grossTotal = allPayments.reduce((s, p) => s + p.grossAmount, 0);
  const netTotal = grossTotal - refundTotal;
  const totalCount = allPayments.length;

  const summary = {
    tuition: categoryMap["TUITION"] ?? { count: 0, gross: 0 },
    facility: categoryMap["FACILITY"] ?? { count: 0, gross: 0 },
    textbook: categoryMap["TEXTBOOK"] ?? { count: 0, gross: 0 },
    material: categoryMap["MATERIAL"] ?? { count: 0, gross: 0 },
    singleCourse: categoryMap["SINGLE_COURSE"] ?? { count: 0, gross: 0 },
    penalty: categoryMap["PENALTY"] ?? { count: 0, gross: 0 },
    etc: categoryMap["ETC"] ?? { count: 0, gross: 0 },
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
    date: dateStr,
    summary,
    methods,
    settlement,
    recentPayments: payments,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { date, cashActual } = body as { date: string; cashActual: number };

    if (!date) throw new Error("날짜를 입력하세요.");
    if (cashActual === undefined || cashActual === null)
      throw new Error("현금 실제액을 입력하세요.");

    const dateObj = new Date(date + "T00:00:00");
    if (isNaN(dateObj.getTime())) throw new Error("날짜 형식이 올바르지 않습니다.");

    const startOfDay = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 23, 59, 59, 999);

    const paidStatuses = ["APPROVED", "PARTIAL_REFUNDED"] as const;

    // Check if already closed
    const existing = await getPrisma().dailySettlement.findUnique({
      where: { date: dateObj },
    });

    const userRole = auth.context.adminUser.role;
    const canReopen =
      userRole === AdminRole.SUPER_ADMIN || userRole === AdminRole.DIRECTOR;

    if (existing?.closedAt && !canReopen) {
      return NextResponse.json(
        { error: "이미 마감된 일계표입니다. 원장 이상만 재마감할 수 있습니다." },
        { status: 403 },
      );
    }

    // Aggregate payments
    const allPayments = await getPrisma().payment.findMany({
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
    });

    const refundAgg = await getPrisma().refund.aggregate({
      where: { processedAt: { gte: startOfDay, lte: endOfDay } },
      _sum: { amount: true },
    });
    const refundTotal = refundAgg._sum.amount ?? 0;

    const grossTotal = allPayments.reduce((s, p) => s + p.grossAmount, 0);
    const netTotal = grossTotal - refundTotal;

    const byCategory = (cat: string) =>
      allPayments.filter((p) => p.category === cat).reduce((s, p) => s + p.grossAmount, 0);

    const byMethod = (method: string) =>
      allPayments.filter((p) => p.method === method).reduce((s, p) => s + p.netAmount, 0);

    const tuitionTotal = byCategory("TUITION");
    const facilityTotal = byCategory("FACILITY");
    const textbookTotal = byCategory("TEXTBOOK");
    const posTotal = byCategory("SINGLE_COURSE");
    const etcTotal =
      byCategory("ETC") + byCategory("MATERIAL") + byCategory("PENALTY");

    const cashAmount = byMethod("CASH");
    const cardAmount = byMethod("CARD");
    const transferAmount = byMethod("TRANSFER");
    const cashDiff = Number(cashActual) - cashAmount;

    const settlement = await getPrisma().dailySettlement.upsert({
      where: { date: dateObj },
      create: {
        date: dateObj,
        tuitionTotal,
        facilityTotal,
        textbookTotal,
        posTotal,
        etcTotal,
        grossTotal,
        refundTotal,
        netTotal,
        cashAmount,
        cardAmount,
        transferAmount,
        cashActual: Number(cashActual),
        cashDiff,
        closedAt: new Date(),
        closedBy: auth.context.adminUser.id,
      },
      update: {
        tuitionTotal,
        facilityTotal,
        textbookTotal,
        posTotal,
        etcTotal,
        grossTotal,
        refundTotal,
        netTotal,
        cashAmount,
        cardAmount,
        transferAmount,
        cashActual: Number(cashActual),
        cashDiff,
        closedAt: new Date(),
        closedBy: auth.context.adminUser.id,
      },
    });

    return NextResponse.json({ settlement });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "마감 처리 실패" },
      { status: 400 },
    );
  }
}
