import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { toAuditJson } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { sessionId } = await params;
  const id = parseInt(sessionId, 10);
  if (isNaN(id)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  const body = (await request.json()) as { lock: boolean };
  const lock = !!body.lock;

  const prisma = getPrisma();
  const session = await prisma.examSession.findUnique({ where: { id } });
  if (!session) return NextResponse.json({ error: "회차를 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.examSession.update({
    where: { id },
    data: {
      isLocked: lock,
      lockedAt: lock ? new Date() : null,
      lockedBy: lock ? auth.context.adminUser.id : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      adminId: auth.context.adminUser.id,
      action: lock ? "SESSION_LOCK" : "SESSION_UNLOCK",
      targetType: "ExamSession",
      targetId: String(id),
      before: toAuditJson({ isLocked: session.isLocked }),
      after: toAuditJson({ isLocked: lock }),
      ipAddress: request.headers.get("x-forwarded-for"),
    },
  });

  return NextResponse.json({ data: updated });
}
