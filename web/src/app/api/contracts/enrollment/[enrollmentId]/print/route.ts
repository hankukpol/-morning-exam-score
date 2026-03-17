import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ enrollmentId: string }> };

/**
 * POST /api/contracts/enrollment/[enrollmentId]/print
 * 계약서 출력 시각(printedAt) 기록 + AuditLog 작성.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { enrollmentId } = await context.params;
  const prisma = getPrisma();

  const existing = await prisma.courseContract.findUnique({ where: { enrollmentId } });
  if (!existing) {
    return NextResponse.json({ error: "계약서를 찾을 수 없습니다." }, { status: 404 });
  }

  const updated = await prisma.courseContract.update({
    where: { enrollmentId },
    data: { printedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      adminId: auth.context.adminUser.id,
      action: "CONTRACT_PRINT",
      targetType: "CourseContract",
      targetId: existing.id,
      after: { enrollmentId },
      ipAddress: request.headers.get("x-forwarded-for"),
    },
  });

  return NextResponse.json({ data: { printedAt: updated.printedAt } });
}
