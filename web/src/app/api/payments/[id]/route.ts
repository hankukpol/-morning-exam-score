import { AdminRole, PaymentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

const paymentInclude = {
  student: { select: { name: true, phone: true } },
  processor: { select: { name: true } },
  items: true,
  refunds: { select: { amount: true, refundType: true, processedAt: true } },
  installments: true,
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const payment = await getPrisma().payment.findUnique({
    where: { id: params.id },
    include: paymentInclude,
  });

  if (!payment) {
    return NextResponse.json({ error: "결제 내역을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ payment });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { note, status, examNumber } = body;

    const existing = await getPrisma().payment.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "결제 내역을 찾을 수 없습니다." }, { status: 404 });
    }

    // Validate examNumber if provided for student linking
    if (examNumber !== undefined && examNumber !== null) {
      const student = await getPrisma().student.findUnique({
        where: { examNumber: String(examNumber) },
        select: { examNumber: true },
      });
      if (!student) {
        return NextResponse.json({ error: "해당 학번의 학생을 찾을 수 없습니다." }, { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (note !== undefined) updateData.note = note?.trim() || null;
    if (status !== undefined) updateData.status = status as PaymentStatus;
    if (examNumber !== undefined) updateData.examNumber = examNumber ?? null;

    const payment = await getPrisma().$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: params.id },
        data: updateData,
        include: paymentInclude,
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "UPDATE_PAYMENT",
          targetType: "payment",
          targetId: updated.id,
          before: {
            note: existing.note,
            status: existing.status,
            examNumber: existing.examNumber,
          },
          after: {
            note: updated.note,
            status: updated.status,
            examNumber: updated.examNumber,
          },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return updated;
    });

    return NextResponse.json({ payment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}
