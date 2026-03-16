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
    const { note, status } = body;

    const existing = await getPrisma().payment.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "결제 내역을 찾을 수 없습니다." }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (note !== undefined) updateData.note = note?.trim() || null;
    if (status !== undefined) updateData.status = status as PaymentStatus;

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
          },
          after: {
            note: updated.note,
            status: updated.status,
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
