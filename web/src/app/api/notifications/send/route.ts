import { AdminRole, ExamType, NotificationType } from "@/generated/prisma";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  sendManualNotification,
  sendQueuedNotifications,
} from "@/lib/notifications/service";

type RequestBody = {
  logIds?: number[];
  type?: NotificationType;
  message?: string;
  examType?: ExamType;
  examNumbers?: string[];
  pointAmount?: number | null;
};

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const logIds =
      body.logIds?.map((value) => Number(value)).filter((value) => Number.isInteger(value)) ?? [];

    if (logIds.length > 0) {
      const result = await sendQueuedNotifications({
        adminId: auth.context.adminUser.id,
        logIds,
        ipAddress: request.headers.get("x-forwarded-for"),
      });

      return NextResponse.json(result);
    }

    const examNumbers =
      body.examNumbers?.map((value) => String(value).trim()).filter(Boolean) ?? undefined;
    const result = await sendManualNotification({
      adminId: auth.context.adminUser.id,
      type: body.type ?? NotificationType.NOTICE,
      message: body.message,
      examType: body.examType,
      examNumbers,
      pointAmount:
        body.pointAmount === null || body.pointAmount === undefined
          ? null
          : Number(body.pointAmount),
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "알림 발송에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
