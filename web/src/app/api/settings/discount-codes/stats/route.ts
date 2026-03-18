import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type RecentUsageRow = {
  id: number;
  examNumber: string;
  studentName: string;
  usedAt: string; // ISO string
  discountAmount: number;
  codeId: number;
  code: string;
};

export type CodeStatRow = {
  id: number;
  code: string;
  type: string;
  discountType: string;
  discountValue: number;
  usageCount: number;
  maxUsage: number | null;
  isActive: boolean;
  totalDiscountAmount: number;
  recentUsages: Array<{
    id: number;
    examNumber: string;
    studentName: string;
    usedAt: string;
    discountAmount: number;
  }>;
};

export type StatsResponse = {
  data: {
    totalCodes: number;
    activeCodes: number;
    monthlyUsages: number;
    totalDiscountAmount: number;
    stats: CodeStatRow[];
    recentUsages: RecentUsageRow[];
  };
};

export async function GET() {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const prisma = getPrisma();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const codes = await prisma.discountCode.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: {
      usages: {
        select: {
          id: true,
          examNumber: true,
          usedAt: true,
          payment: { select: { discountAmount: true } },
          student: { select: { name: true } },
        },
        orderBy: { usedAt: "desc" },
      },
    },
  });

  let totalDiscountAmount = 0;
  let monthlyUsages = 0;

  const stats: CodeStatRow[] = codes.map((c) => {
    let codeTotal = 0;
    let codeMonthly = 0;

    const recentUsages = c.usages.slice(0, 5).map((u) => {
      const amount = u.payment?.discountAmount ?? 0;
      return {
        id: u.id,
        examNumber: u.examNumber,
        studentName: u.student.name,
        usedAt: u.usedAt.toISOString(),
        discountAmount: amount,
      };
    });

    for (const u of c.usages) {
      const amount = u.payment?.discountAmount ?? 0;
      codeTotal += amount;
      if (u.usedAt >= startOfMonth) {
        codeMonthly += 1;
      }
    }

    totalDiscountAmount += codeTotal;
    monthlyUsages += codeMonthly;

    return {
      id: c.id,
      code: c.code,
      type: c.type,
      discountType: c.discountType,
      discountValue: c.discountValue,
      usageCount: c.usages.length,
      maxUsage: c.maxUsage,
      isActive: c.isActive,
      totalDiscountAmount: codeTotal,
      recentUsages,
    };
  });

  // Build flat list of recent usages across all codes (latest 10)
  const allUsages: RecentUsageRow[] = codes.flatMap((c) =>
    c.usages.map((u) => ({
      id: u.id,
      examNumber: u.examNumber,
      studentName: u.student.name,
      usedAt: u.usedAt.toISOString(),
      discountAmount: u.payment?.discountAmount ?? 0,
      codeId: c.id,
      code: c.code,
    })),
  );
  allUsages.sort((a, b) => new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime());
  const recentUsages = allUsages.slice(0, 10);

  return NextResponse.json({
    data: {
      totalCodes: codes.length,
      activeCodes: codes.filter((c) => c.isActive).length,
      monthlyUsages,
      totalDiscountAmount,
      stats,
      recentUsages,
    },
  } satisfies StatsResponse);
}
