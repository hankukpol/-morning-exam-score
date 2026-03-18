/**
 * POST /api/payments/card-initiate
 *
 * 카드 결제 시작 전 처리:
 *  1. Payment 레코드를 PENDING 상태로 생성
 *  2. idempotencyKey를 paymentUid로 활용 (PortOne 주문 ID)
 *  3. 클라이언트에 PortOne SDK 호출에 필요한 데이터 반환
 */
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { AdminRole, PaymentCategory } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    enrollmentId?: string;
    amount: number;
    category?: string;
    studentExamNumber?: string;
    note?: string;
    items?: Array<{
      itemType: string;
      itemId?: string;
      itemName: string;
      unitPrice: number;
      quantity: number;
      amount: number;
    }>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const { enrollmentId, amount, category = "TUITION", studentExamNumber, note, items } = body;

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "결제 금액을 입력하세요." }, { status: 400 });
  }

  // 학생 정보 조회
  let buyerName = "고객";
  let buyerPhone = "";

  if (studentExamNumber) {
    const student = await getPrisma().student.findUnique({
      where: { examNumber: studentExamNumber },
      select: { name: true, phone: true },
    });
    if (student) {
      buyerName = student.name;
      buyerPhone = student.phone ?? "";
    }
  }

  // 고유 paymentUid 생성 (PortOne 주문 ID로 사용)
  const paymentUid = `card-${randomUUID().replace(/-/g, "").slice(0, 20)}`;

  // 결제 항목 구성
  const itemsToCreate =
    items && items.length > 0
      ? items.map((item) => ({
          itemType: item.itemType as PaymentCategory,
          itemId: item.itemId ?? null,
          itemName: item.itemName,
          unitPrice: Number(item.unitPrice),
          quantity: Number(item.quantity ?? 1),
          amount: Number(item.amount),
        }))
      : [
          {
            itemType: category as PaymentCategory,
            itemId: enrollmentId ?? null,
            itemName: "카드 결제",
            unitPrice: amount,
            quantity: 1,
            amount,
          },
        ];

  // Payment 레코드를 PENDING 상태로 생성
  const payment = await getPrisma().payment.create({
    data: {
      idempotencyKey: paymentUid,
      examNumber: studentExamNumber ?? null,
      enrollmentId: enrollmentId ?? null,
      category: category as PaymentCategory,
      method: "CARD",
      status: "PENDING",
      grossAmount: amount,
      discountAmount: 0,
      couponAmount: 0,
      pointAmount: 0,
      netAmount: amount,
      note: note?.trim() ?? null,
      processedBy: auth.context.adminUser.id,
      processedAt: new Date(),
      items: {
        create: itemsToCreate,
      },
    },
  });

  const storeName = process.env.PORTONE_STORE_NAME ?? "한국경찰학원";

  return NextResponse.json({
    data: {
      paymentId: payment.id,
      paymentUid,
      amount,
      storeName,
      buyerName,
      buyerPhone,
    },
  });
}
