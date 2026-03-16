import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const status = sp.get("status") ?? "all"; // "all" | "overdue" | "upcoming" | "paid"
  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
  const limit = 50;
  const skip = (page - 1) * limit;

  // today at 00:00:00 local time (server), converted to UTC
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  type WhereClause = {
    paidAt?: null;
    dueDate?: { lt?: Date; gte?: Date };
  };

  const where: WhereClause = (() => {
    if (status === "overdue") {
      return { paidAt: null, dueDate: { lt: todayStart } };
    }
    if (status === "upcoming") {
      return { paidAt: null, dueDate: { gte: todayStart } };
    }
    if (status === "paid") {
      // paidAt is NOT null — omit paidAt filter to get all, then filter in query
      return {} as WhereClause;
    }
    // "all"
    return {} as WhereClause;
  })();

  // For "paid" we need paidAt != null
  const paidFilter = status === "paid" ? { paidAt: { not: null } } : {};

  const combinedWhere = { ...where, ...paidFilter };

  const [items, total] = await getPrisma().$transaction([
    getPrisma().installment.findMany({
      where: combinedWhere,
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
      skip,
      take: limit,
    }),
    getPrisma().installment.count({ where: combinedWhere }),
  ]);

  // Summary counts (always computed fresh regardless of filter)
  const [overdueCount, upcomingCount, paidCount] = await getPrisma().$transaction([
    getPrisma().installment.count({
      where: { paidAt: null, dueDate: { lt: todayStart } },
    }),
    getPrisma().installment.count({
      where: { paidAt: null, dueDate: { gte: todayStart } },
    }),
    getPrisma().installment.count({
      where: { paidAt: { not: null } },
    }),
  ]);

  return NextResponse.json({
    data: {
      items,
      total,
      summary: { overdueCount, upcomingCount, paidCount },
    },
  });
}
