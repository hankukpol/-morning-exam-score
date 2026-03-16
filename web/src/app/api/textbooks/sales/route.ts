import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = request.nextUrl;
  const dateStr = searchParams.get("date"); // YYYY-MM-DD

  let dateFilter = {};
  if (dateStr) {
    const d = new Date(dateStr);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    dateFilter = { soldAt: { gte: start, lte: end } };
  }

  const sales = await getPrisma().textbookSale.findMany({
    where: { ...dateFilter },
    include: {
      textbook: { select: { title: true, subject: true } },
      staff: { select: { name: true } },
    },
    orderBy: { soldAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ sales });
}
