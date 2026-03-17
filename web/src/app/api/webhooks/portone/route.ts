/**
 * PortOne v2 웹훅 핸들러
 *
 * PortOne 서버에서 결제 이벤트가 발생하면 이 엔드포인트로 POST 요청이 옵니다.
 * 결제 완료(Transaction.Paid) 시:
 *  1. PortOne API로 결제 검증
 *  2. PaymentLink 조회 (customData = linkId)
 *  3. Payment 레코드 생성
 *  4. PaymentLink.usageCount 증가 및 상태 업데이트
 *  5. 카카오 알림톡 발송 (fire-and-forget)
 *
 * TODO: 웹훅 서명 검증 추가 (PORTONE_WEBHOOK_SECRET 환경변수 설정 후)
 * 현재는 서명 검증을 건너뛰고 있습니다.
 * 참고: https://developers.portone.io/docs/ko/v2-payment/webhook
 */

import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { verifyPortOnePayment } from "@/lib/portone";
import { sendEventNotification } from "@/lib/notifications/event-notify";

// 웹훅 처리 시 사용하는 시스템 관리자 UUID
// 온라인 결제는 관리자 없이 자동으로 처리되므로 SUPER_ADMIN ID를 사용
// 환경변수 PORTONE_SYSTEM_ADMIN_UUID 로 재정의 가능
function getSystemAdminId(): string {
  return (
    process.env.PORTONE_SYSTEM_ADMIN_UUID ??
    "38c72c4c-3d8e-4082-a881-74b8fd43f1ed"
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = body as {
    type?: string;
    data?: { paymentId?: string; storeId?: string; transactionId?: string };
  };

  // Transaction.Paid 이외의 이벤트는 즉시 200으로 응답 (무시)
  if (payload?.type !== "Transaction.Paid") {
    return NextResponse.json({ ok: true });
  }

  const portonePaymentId = payload?.data?.paymentId;
  if (!portonePaymentId) {
    console.error("[PortOne Webhook] paymentId 없음:", body);
    return NextResponse.json({ error: "paymentId missing" }, { status: 400 });
  }

  try {
    // 1. PortOne API로 결제 검증
    const verified = await verifyPortOnePayment(portonePaymentId);

    if (verified.status !== "PAID") {
      console.warn(
        `[PortOne Webhook] 결제 상태가 PAID가 아님: ${verified.status} (paymentId: ${portonePaymentId})`
      );
      // 상태 불일치 시에도 200 응답 (PortOne 재시도 방지)
      return NextResponse.json({ ok: true });
    }

    // 2. customData에서 linkId 추출
    const linkIdStr = verified.customData;
    if (!linkIdStr) {
      console.error(
        `[PortOne Webhook] customData(linkId) 없음 (paymentId: ${portonePaymentId})`
      );
      return NextResponse.json({ error: "customData missing" }, { status: 400 });
    }

    const linkId = parseInt(linkIdStr, 10);
    if (isNaN(linkId)) {
      console.error(
        `[PortOne Webhook] customData가 숫자가 아님: ${linkIdStr}`
      );
      return NextResponse.json(
        { error: "invalid customData" },
        { status: 400 }
      );
    }

    // 3. 멱등성 체크: 이미 해당 portone paymentId로 처리된 Payment가 있으면 skip
    const idempotencyKey = `portone:${portonePaymentId}`;
    const existing = await getPrisma().payment.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      console.log(
        `[PortOne Webhook] 이미 처리된 결제 (idempotencyKey: ${idempotencyKey})`
      );
      return NextResponse.json({ ok: true });
    }

    // 4. PaymentLink 조회
    const link = await getPrisma().paymentLink.findUnique({
      where: { id: linkId },
    });

    if (!link) {
      console.error(
        `[PortOne Webhook] PaymentLink 없음 (linkId: ${linkId})`
      );
      return NextResponse.json(
        { error: "PaymentLink not found" },
        { status: 404 }
      );
    }

    // 5. 금액 검증 (결제 금액과 링크 금액이 일치하는지 확인)
    const paidAmount = verified.amount.paid;
    if (paidAmount !== link.finalAmount) {
      console.error(
        `[PortOne Webhook] 금액 불일치: paid=${paidAmount}, expected=${link.finalAmount} (linkId: ${linkId})`
      );
      // 금액 불일치는 보안 이슈이므로 400 응답 (PortOne이 재시도하지 않도록)
      // 실무에서는 별도 알림 발송 필요
      return NextResponse.json({ error: "amount mismatch" }, { status: 400 });
    }

    const systemAdminId = getSystemAdminId();

    // 6. 트랜잭션으로 Payment 생성 + PaymentLink 업데이트
    const { payment, updatedLink } = await getPrisma().$transaction(
      async (tx) => {
        // Payment 레코드 생성
        const created = await tx.payment.create({
          data: {
            idempotencyKey,
            examNumber: null, // 온라인 결제 시 학번 미확인 (관리자가 수동 연결)
            paymentLinkId: link.id,
            category: "TUITION",
            method: "CARD",
            status: "APPROVED",
            grossAmount: paidAmount,
            discountAmount: 0,
            couponAmount: 0,
            pointAmount: 0,
            netAmount: paidAmount,
            note: `PortOne 온라인 결제 | 주문ID: ${portonePaymentId}${verified.orderName ? ` | ${verified.orderName}` : ""}`,
            processedBy: systemAdminId,
            processedAt: verified.paidAt ? new Date(verified.paidAt) : new Date(),
          },
        });

        // PaymentLink usageCount 증가
        const newUsageCount = link.usageCount + 1;
        const isUsedUp =
          link.maxUsage != null && newUsageCount >= link.maxUsage;

        const updated = await tx.paymentLink.update({
          where: { id: link.id },
          data: {
            usageCount: newUsageCount,
            ...(isUsedUp ? { status: "USED_UP" } : {}),
          },
        });

        return { payment: created, updatedLink: updated };
      }
    );

    console.log(
      `[PortOne Webhook] 결제 처리 완료 - paymentId: ${payment.id}, linkId: ${linkId}, usageCount: ${updatedLink.usageCount}`
    );

    // 7. 알림톡 발송 (fire-and-forget)
    // examNumber가 없으면 알림 발송 불가 - 관리자가 수동으로 연결 후 발송
    // examNumber가 있는 경우에만 발송 (현재는 null이므로 skip)

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PortOne Webhook] 처리 중 오류:", err);

    // PortOne은 2xx가 아닌 경우 재시도하므로, 처리 가능한 오류는 200으로 응답
    // 그러나 내부 오류는 500으로 반환하여 PortOne이 재시도하도록 함
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
