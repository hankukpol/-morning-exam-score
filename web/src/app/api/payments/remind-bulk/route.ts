/**
 * POST /api/payments/remind-bulk
 * 미납 독촉 알림 일괄 발송 API
 * COUNSELOR 이상 권한 필요
 *
 * Body: { items: Array<{ examNumber: string; enrollmentId?: string; unpaidAmount?: number; courseName?: string }> }
 * Response: { data: { sent: number; failed: number; errors: string[] } }
 */
import { AdminRole, NotificationType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { sendEventNotification } from "@/lib/notifications/event-notify";

type RemindItem = {
  examNumber: string;
  enrollmentId?: string;
  unpaidAmount?: number;
  courseName?: string;
};

async function sendSingleReminder(
  item: RemindItem,
  adminId: string,
  ipAddress: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { examNumber, enrollmentId, unpaidAmount, courseName } = item;

  if (!examNumber?.trim()) {
    return { ok: false, error: "학번 없음" };
  }

  const student = await getPrisma().student.findUnique({
    where: { examNumber },
    select: { examNumber: true, name: true, phone: true, notificationConsent: true },
  });

  if (!student) {
    return { ok: false, error: `${examNumber}: 학생 없음` };
  }

  let sent = false;
  let sendError: string | undefined;

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
  } catch (err) {
    console.error("[remind-bulk] 알림 발송 실패:", examNumber, err);
    sendError = `${examNumber}: 알림 발송 실패`;
  }

  // 감사 로그 기록 (실패해도 무시)
  try {
    await getPrisma().auditLog.create({
      data: {
        adminId,
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
          bulk: true,
        },
        ipAddress,
      },
    });
  } catch {
    // 감사 로그 실패는 무시
  }

  if (!sent && sendError) {
    return { ok: false, error: sendError };
  }

  return { ok: true };
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { items } = body as { items: RemindItem[] };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "발송할 항목이 없습니다." }, { status: 400 });
    }

    if (items.length > 200) {
      return NextResponse.json(
        { error: "한 번에 최대 200건까지 발송할 수 있습니다." },
        { status: 400 },
      );
    }

    const ipAddress = request.headers.get("x-forwarded-for");
    const adminId = auth.context.adminUser.id;

    const results = await Promise.allSettled(
      items.map((item) => sendSingleReminder(item, adminId, ipAddress)),
    );

    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        if (result.value.ok) {
          sentCount++;
        } else {
          failedCount++;
          if (result.value.error) errors.push(result.value.error);
        }
      } else {
        failedCount++;
        errors.push(result.reason instanceof Error ? result.reason.message : "알 수 없는 오류");
      }
    }

    return NextResponse.json({
      data: {
        sent: sentCount,
        failed: failedCount,
        errors: errors.slice(0, 20), // 오류 메시지는 최대 20건만 반환
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "일괄 독촉 발송 실패" },
      { status: 400 },
    );
  }
}
