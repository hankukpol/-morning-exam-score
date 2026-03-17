import { AdminRole, NotificationType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const size = Math.min(100, Math.max(1, parseInt(searchParams.get("size") ?? "20", 10)));
  const typeParam = searchParams.get("type");
  const statusParam = searchParams.get("status");
  const dateParam = searchParams.get("date"); // "yyyy-MM" format

  const typeFilter =
    typeParam && Object.values(NotificationType).includes(typeParam as NotificationType)
      ? (typeParam as NotificationType)
      : undefined;

  const statusFilter = statusParam && statusParam !== "ALL" ? statusParam : undefined;

  let sentAtFilter: { gte?: Date; lte?: Date } | undefined;
  if (dateParam && /^\d{4}-\d{2}$/.test(dateParam)) {
    const [year, month] = dateParam.split("-").map(Number);
    sentAtFilter = {
      gte: new Date(year, month - 1, 1, 0, 0, 0),
      lte: new Date(year, month, 0, 23, 59, 59),
    };
  }

  const where = {
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(sentAtFilter ? { sentAt: sentAtFilter } : {}),
  };

  const prisma = getPrisma();

  // Current month for KPI stats
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [total, notifications, monthTotal, monthFail] = await Promise.all([
    prisma.notificationLog.count({ where }),
    prisma.notificationLog.findMany({
      where,
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { sentAt: "desc" },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.notificationLog.count({
      where: { sentAt: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.notificationLog.count({
      where: {
        sentAt: { gte: monthStart, lte: monthEnd },
        status: "failed",
      },
    }),
  ]);

  const monthSuccess = monthTotal - monthFail;
  const successRate =
    monthTotal > 0 ? Math.round((monthSuccess / monthTotal) * 100) : 100;

  return NextResponse.json({
    data: {
      notifications,
      total,
      stats: {
        monthTotal,
        monthFail,
        successRate,
      },
    },
  });
}
