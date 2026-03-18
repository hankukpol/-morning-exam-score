import { AdminRole, NotificationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { sendEventNotification } from "@/lib/notifications/event-notify";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  const prisma = getPrisma();

  const installment = await prisma.installment.findUnique({
    where: { id },
    include: {
      payment: {
        select: {
          examNumber: true,
          netAmount: true,
          items: { select: { itemName: true }, take: 1 },
          student: {
            select: {
              name: true,
              phone: true,
              notificationConsent: true,
            },
          },
        },
      },
    },
  });

  if (!installment) {
    return NextResponse.json({ error: "분납 회차를 찾을 수 없습니다." }, { status: 404 });
  }

  if (installment.paidAt) {
    return NextResponse.json({ error: "이미 납부 완료된 회차입니다." }, { status: 400 });
  }

  const student = installment.payment.student;
  if (!student) {
    return NextResponse.json({ error: "학생 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  const examNumber = installment.payment.examNumber;
  if (!examNumber) {
    return NextResponse.json({ error: "학생 학번을 찾을 수 없습니다." }, { status: 404 });
  }

  // Compute overdue days
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const dueDate = installment.dueDate;
  const diffMs = dueDate.getTime() - todayStart.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  let dueLabel: string;
  if (diffDays < 0) {
    dueLabel = `${Math.abs(diffDays)}일 연체`;
  } else if (diffDays === 0) {
    dueLabel = "오늘 만기";
  } else {
    dueLabel = `D-${diffDays}`;
  }

  const dueDateFormatted = `${dueDate.getFullYear()}.${String(dueDate.getMonth() + 1).padStart(2, "0")}.${String(dueDate.getDate()).padStart(2, "0")}`;
  const courseName = installment.payment.items[0]?.itemName ?? "수강료";
  const amountFormatted = `${installment.amount.toLocaleString("ko-KR")}원`;

  const sentAt = new Date();
  const dedupeKey = `installment-remind:${installment.id}:${sentAt.toISOString().slice(0, 10)}`;

  // Fire-and-forget
  void sendEventNotification({
    examNumber,
    type: NotificationType.PAYMENT_COMPLETE,
    messageInput: {
      studentName: student.name,
      courseName,
      paymentAmount: amountFormatted,
      paymentMethod: `분납 납부일 ${dueDateFormatted} (${dueLabel})`,
    },
    dedupeKey,
  });

  return NextResponse.json({ sent: true, sentAt: sentAt.toISOString() });
}
