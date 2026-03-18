import { NextRequest } from "next/server";
import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "5", 10), 20);

  if (q.length < 2) {
    return Response.json({ students: [] });
  }

  const students = await getPrisma().student.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: q } },
        { examNumber: { contains: q } },
      ],
    },
    select: { examNumber: true, name: true, phone: true },
    take: limit,
    orderBy: { examNumber: "asc" },
  });

  return Response.json({ students });
}
