import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/payments/installments/[id]
 *
 * Returns the installment with its parent payment (student, items)
 * and all sibling installments for this payment.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await context.params;

    const installment = await getPrisma().installment.findUnique({
      where: { id },
      include: {
        payment: {
          include: {
            student: { select: { name: true, phone: true, examNumber: true } },
            items: { orderBy: { id: "asc" } },
            installments: { orderBy: { seq: "asc" } },
          },
        },
      },
    });

    if (!installment) {
      return NextResponse.json({ error: "분할납부 항목을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ data: installment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/payments/installments/[id]
 *
 * Body: { paidAt: string }
 *   - Marks the installment as paid at the given date
 *   - Recalculates parent Payment.status: if all installments paid → APPROVED
 *
 * Returns: { data: updatedInstallment }
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await context.params;

    const body = await request.json() as { paidAt?: string };
    if (!body.paidAt) {
      return NextResponse.json({ error: "paidAt 날짜가 필요합니다." }, { status: 400 });
    }

    const paidAtDate = new Date(body.paidAt);
    if (isNaN(paidAtDate.getTime())) {
      return NextResponse.json({ error: "올바른 날짜 형식이 아닙니다." }, { status: 400 });
    }

    const prisma = getPrisma();

    const existing = await prisma.installment.findUnique({
      where: { id },
      select: { id: true, paidAt: true, paymentId: true, seq: true, amount: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "분할납부 항목을 찾을 수 없습니다." }, { status: 404 });
    }

    if (existing.paidAt !== null) {
      return NextResponse.json({ error: "이미 납부 처리된 항목입니다." }, { status: 409 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Mark this installment as paid
      const result = await tx.installment.update({
        where: { id },
        data: { paidAt: paidAtDate },
      });

      // Check if all sibling installments are now paid
      const siblings = await tx.installment.findMany({
        where: { paymentId: existing.paymentId },
        select: { id: true, paidAt: true },
      });

      const allPaid = siblings.every((s) => s.id === id || s.paidAt !== null);

      if (allPaid) {
        await tx.payment.update({
          where: { id: existing.paymentId },
          data: { status: "APPROVED" },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "PAY_INSTALLMENT",
          targetType: "installment",
          targetId: id,
          before: { paidAt: null },
          after: {
            paymentId: existing.paymentId,
            seq: existing.seq,
            amount: existing.amount,
            paidAt: paidAtDate.toISOString(),
            allPaid,
          },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return result;
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "납부 처리 실패" },
      { status: 400 },
    );
  }
}
