/**
 * POST /api/payments/remind
 * 미납 독촉 알림 발송 API
 * COUNSELOR 이상 권한 필요
 *
 * 주의: PAYMENT_REMINDER NotificationType이 DB enum에 추가될 때까지
 *       실제 카카오 알림톡 발송은 PAYMENT_COMPLETE 타입 템플릿을 재사용하며,
 *       감사 로그(action: SEND_PAYMENT_REMINDER)만 기록합니다.
 */
import { AdminRole, NotificationType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { sendEventNotification } from "@/lib/notifications/event-notify";

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { examNumber, enrollmentId, unpaidAmount, courseName } = body as {
      examNumber: string;
      enrollmentId?: string;
      unpaidAmount?: number;
      courseName?: string;
    };

    if (!examNumber?.trim()) {
      return NextResponse.json({ error: "학번을 입력하세요." }, { status: 400 });
    }

    // 학생 조회
    const student = await getPrisma().student.findUnique({
      where: { examNumber },
      select: { examNumber: true, name: true, phone: true, notificationConsent: true },
    });

    if (!student) {
      return NextResponse.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
    }

    let sent = false;
    let resultMessage = "";

    // 알림 발송 시도: PAYMENT_COMPLETE 타입 + 독촉 내용 커스텀 메시지 활용
    // PAYMENT_REMINDER enum이 추가되면 해당 타입으로 교체 가능
    try {
      const amountStr = unpaidAmount ? unpaidAmount.toLocaleString("ko-KR") : "미납";
      await sendEventNotification({
        examNumber,
        type: NotificationType.PAYMENT_COMPLETE,
        messageInput: {
          studentName: student.name,
          courseName: courseName ?? undefined,
          paymentAmount: amountStr,
          paymentMethod: "미납 독촉",
          customMessage: `[한국경찰학원] ${student.name}님, 미납 수강료 ${amountStr}원을 납부해 주세요. 문의: 053-241-0112`,
        },
        dedupeKey: enrollmentId
          ? `remind-${enrollmentId}-${new Date().toISOString().slice(0, 10)}`
          : `remind-${examNumber}-${new Date().toISOString().slice(0, 10)}`,
      });
      sent = true;
      resultMessage = student.notificationConsent
        ? "독촉 알림을 발송했습니다."
        : "알림 수신 동의 미확인 — 발송이 건너뛰어졌습니다.";
    } catch (err) {
      console.error("[remind] 알림 발송 실패:", err);
      sent = false;
      resultMessage = "알림 발송에 실패했습니다. 알림 설정을 확인해 주세요.";
    }

    // 감사 로그 기록
    try {
      await getPrisma().auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "SEND_PAYMENT_REMINDER",
          targetType: "student",
          targetId: examNumber,
          after: {
            examNumber,
            enrollmentId: enrollmentId ?? null,
            courseName: courseName ?? null,
            unpaidAmount: unpaidAmount ?? null,
            notificationConsent: student.notificationConsent,
            sent,
          },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });
    } catch {
      // 감사 로그 실패는 무시
    }

    return NextResponse.json({ data: { sent, message: resultMessage } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "독촉 발송 실패" },
      { status: 400 },
    );
  }
}
