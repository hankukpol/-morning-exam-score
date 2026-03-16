import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { toAuditJson } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ enrollmentId: string }> };

/**
 * POST /api/contracts/enrollment/[enrollmentId]/print
 * 계약서 출력 시각(printedAt) 기록 + AuditLog 작성.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { enrollmentId } = await context.params;
  const prisma = getPrisma();

  const contract = await prisma.courseContract.findUnique({ where: { enrollmentId } });
  if (!contract) {
    return NextResponse.json({ error: "계약서가 존재하지 않습니다." }, { status: 404 });
  }

  const printedAt = new Date();
  const updated = await prisma.courseContract.update({
    where: { enrollmentId },
    data: { printedAt },
  });

  await prisma.auditLog.create({
    data: {
      adminId: auth.context.adminUser.id,
      action: "CONTRACT_PRINT",
      targetType: "CourseContract",
      targetId: contract.id,
      before: toAuditJson(null),
      after: toAuditJson({ enrollmentId, printedAt }),
      ipAddress: request.headers.get("x-forwarded-for"),
    },
  });

  return NextResponse.json({ printedAt: updated.printedAt });
}
