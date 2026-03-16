import { AdminRole, PaymentCategory, PaymentMethod, PaymentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { sendEventNotification } from "@/lib/notifications/event-notify";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";

const paymentInclude = {
  student: { select: { name: true, phone: true } },
  processor: { select: { name: true } },
  items: true,
  refunds: { select: { amount: true, refundType: true, processedAt: true } },
};

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const examNumber = sp.get("examNumber") ?? undefined;
  const category = sp.get("category") as PaymentCategory | null;
  const method = sp.get("method") as PaymentMethod | null;
  const status = sp.get("status") as PaymentStatus | null;
  const from = sp.get("from") ?? undefined;
  const to = sp.get("to") ?? undefined;
  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? "50") || 50, 1), 200);
  const skip = (page - 1) * limit;

  const fromDate = from ? new Date(from + "T00:00:00") : undefined;
  const toDate = to ? new Date(to + "T23:59:59.999") : undefined;

  const where = {
    ...(examNumber ? { examNumber } : {}),
    ...(category ? { category } : {}),
    ...(method ? { method } : {}),
    ...(status ? { status } : {}),
    ...(fromDate || toDate
      ? {
          processedAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const [payments, total, agg] = await getPrisma().$transaction([
    getPrisma().payment.findMany({
      where,
      include: paymentInclude,
      orderBy: { processedAt: "desc" },
      skip,
      take: limit,
    }),
    getPrisma().payment.count({ where }),
    getPrisma().payment.aggregate({
      where,
      _sum: { grossAmount: true, netAmount: true },
    }),
  ]);

  // Calculate total refunded from refund records
  const refundAgg = await getPrisma().refund.aggregate({
    where: { payment: where },
    _sum: { amount: true },
  });

  const summary = {
    gross: agg._sum.grossAmount ?? 0,
    net: agg._sum.netAmount ?? 0,
    refund: refundAgg._sum.amount ?? 0,
  };

  return NextResponse.json({ payments, total, summary });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const idempotencyKey = request.headers.get("X-Idempotency-Key") ?? undefined;

    // Check idempotency
    if (idempotencyKey) {
      const existing = await getPrisma().payment.findUnique({
        where: { idempotencyKey },
        include: paymentInclude,
      });
      if (existing) {
        return NextResponse.json({ payment: existing });
      }
    }

    const body = await request.json();
    const {
      examNumber,
      enrollmentId,
      category,
      method,
      grossAmount,
      discountAmount,
      netAmount,
      note,
      items,
    } = body;

    if (!category) throw new Error("수납 유형을 선택하세요.");
    if (!method) throw new Error("결제 수단을 선택하세요.");
    if (grossAmount === undefined || grossAmount === null || Number(grossAmount) < 0)
      throw new Error("청구금액을 입력하세요.");
    if (netAmount === undefined || netAmount === null || Number(netAmount) < 0)
      throw new Error("실납부금액을 입력하세요.");
    if (!Array.isArray(items) || items.length === 0)
      throw new Error("결제 항목을 하나 이상 입력하세요.");

    // Validate method is CASH or TRANSFER for P1-3
    const allowedMethods: PaymentMethod[] = ["CASH", "TRANSFER"];
    if (!allowedMethods.includes(method as PaymentMethod)) {
      throw new Error("현재 현금과 계좌이체만 지원합니다.");
    }

    const payment = await getPrisma().$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          idempotencyKey: idempotencyKey ?? null,
          examNumber: examNumber?.trim() || null,
          enrollmentId: enrollmentId ?? null,
          category: category as PaymentCategory,
          method: method as PaymentMethod,
          status: "APPROVED",
          grossAmount: Number(grossAmount),
          discountAmount: Number(discountAmount ?? 0),
          couponAmount: 0,
          pointAmount: 0,
          netAmount: Number(netAmount),
          note: note?.trim() || null,
          processedBy: auth.context.adminUser.id,
          processedAt: new Date(),
          items: {
            create: (items as Array<{
              itemType: PaymentCategory;
              itemId?: string;
              itemName: string;
              unitPrice: number;
              quantity: number;
              amount: number;
            }>).map((item) => ({
              itemType: item.itemType as PaymentCategory,
              itemId: item.itemId ?? null,
              itemName: item.itemName,
              unitPrice: Number(item.unitPrice),
              quantity: Number(item.quantity ?? 1),
              amount: Number(item.amount),
            })),
          },
        },
        include: paymentInclude,
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "CREATE_PAYMENT",
          targetType: "payment",
          targetId: created.id,
          after: {
            examNumber: created.examNumber,
            category: created.category,
            method: created.method,
            grossAmount: created.grossAmount,
            netAmount: created.netAmount,
          },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return created;
    });

    // 수납 완료 알림 발송 (fire-and-forget)
    if (payment.examNumber) {
      void sendEventNotification({
        examNumber: payment.examNumber,
        type: "PAYMENT_COMPLETE",
        messageInput: {
          studentName: payment.student?.name ?? payment.examNumber,
          paymentAmount: payment.netAmount.toLocaleString(),
          paymentMethod: PAYMENT_METHOD_LABEL[payment.method],
        },
        dedupeKey: `payment_complete:${payment.id}`,
      });
    }

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수납 등록 실패" },
      { status: 400 },
    );
  }
}
