/**
 * POST /api/payments/card-confirm
 *
 * PortOne 카드 결제 완료 후 서버 사이드 검증 및 Payment 상태 업데이트:
 *  1. paymentUid로 Payment 레코드 조회 (idempotencyKey = paymentUid)
 *  2. PortOne API로 결제 검증 (금액 일치 확인)
 *  3. Payment 상태를 APPROVED로 업데이트하고 PortOne 결제 ID를 note에 기록
 *  4. 수납 완료 알림 발송 (fire-and-forget)
 */
import { NextRequest, NextResponse } from "next/server";
import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { verifyPortOnePayment } from "@/lib/portone";
import { sendEventNotification } from "@/lib/notifications/event-notify";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    paymentUid: string;
    portonePaymentId: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const { paymentUid, portonePaymentId } = body;

  if (!paymentUid?.trim()) {
    return NextResponse.json({ error: "paymentUid가 필요합니다." }, { status: 400 });
  }
  if (!portonePaymentId?.trim()) {
    return NextResponse.json({ error: "portonePaymentId가 필요합니다." }, { status: 400 });
  }

  // 1. Payment 레코드 조회 (idempotencyKey = paymentUid)
  const payment = await getPrisma().payment.findUnique({
    where: { idempotencyKey: paymentUid },
    include: {
      student: { select: { name: true, phone: true } },
    },
  });

  if (!payment) {
    return NextResponse.json(
      { error: "결제 내역을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  if (payment.status === "APPROVED") {
    // 이미 처리된 경우 멱등성 응답
    return NextResponse.json({
      data: { paymentId: payment.id, status: "APPROVED" },
    });
  }

  if (payment.status !== "PENDING") {
    return NextResponse.json(
      { error: `처리할 수 없는 결제 상태입니다: ${payment.status}` },
      { status: 400 },
    );
  }

  // 2. PortOne API로 결제 검증
  let verified;
  try {
    verified = await verifyPortOnePayment(portonePaymentId);
  } catch (err) {
    console.error("[card-confirm] PortOne 결제 검증 실패:", err);
    return NextResponse.json(
      { error: "PortOne 결제 검증에 실패했습니다." },
      { status: 502 },
    );
  }

  if (verified.status !== "PAID") {
    // 결제 실패 또는 취소 — PENDING 레코드를 CANCELLED로 업데이트
    await getPrisma().payment.update({
      where: { id: payment.id },
      data: {
        status: "CANCELLED",
        note: `결제 실패 | PortOne 상태: ${verified.status} | ${portonePaymentId}`,
      },
    });
    return NextResponse.json(
      { error: `결제가 완료되지 않았습니다. 상태: ${verified.status}` },
      { status: 400 },
    );
  }

  // 3. 금액 검증
  const paidAmount = verified.amount.paid;
  if (paidAmount !== payment.netAmount) {
    console.error(
      `[card-confirm] 금액 불일치: paid=${paidAmount}, expected=${payment.netAmount} (paymentId: ${payment.id})`,
    );
    // 금액 불일치 — CANCELLED 처리
    await getPrisma().payment.update({
      where: { id: payment.id },
      data: {
        status: "CANCELLED",
        note: `금액 불일치 | paid=${paidAmount}, expected=${payment.netAmount} | ${portonePaymentId}`,
      },
    });
    return NextResponse.json(
      { error: "결제 금액이 일치하지 않습니다." },
      { status: 400 },
    );
  }

  // 4. Payment 상태를 APPROVED로 업데이트
  const noteText = `카드 결제 | PortOne ID: ${portonePaymentId}${verified.orderName ? ` | ${verified.orderName}` : ""}`;

  const updated = await getPrisma().$transaction(async (tx) => {
    const result = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "APPROVED",
        note: noteText,
        processedAt: verified.paidAt ? new Date(verified.paidAt) : new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: auth.context.adminUser.id,
        action: "APPROVE_CARD_PAYMENT",
        targetType: "payment",
        targetId: payment.id,
        after: {
          portonePaymentId,
          amount: paidAmount,
          status: "APPROVED",
        },
        ipAddress: req.headers.get("x-forwarded-for"),
      },
    });

    return result;
  });

  // 5. 수납 완료 알림 발송 (fire-and-forget)
  if (updated.examNumber) {
    void sendEventNotification({
      examNumber: updated.examNumber,
      type: "PAYMENT_COMPLETE",
      messageInput: {
        studentName: payment.student?.name ?? updated.examNumber,
        paymentAmount: updated.netAmount.toLocaleString(),
        paymentMethod: PAYMENT_METHOD_LABEL[updated.method],
      },
      dedupeKey: `payment_complete:${updated.id}`,
    }).catch((err) =>
      console.error("[card-confirm] 수납 알림 발송 실패:", err),
    );
  }

  return NextResponse.json({
    data: { paymentId: updated.id, status: "APPROVED" },
  });
}
