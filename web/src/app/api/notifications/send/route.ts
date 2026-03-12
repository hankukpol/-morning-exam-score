import { AdminRole, ExamType, NotificationType, StudentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  previewManualNotification,
  previewQueuedNotifications,
  sendManualNotification,
  sendQueuedNotifications,
  sendStatusNotifications,
} from "@/lib/notifications/service";

type RequestBody = {
  preview?: boolean;
  logIds?: number[];
  type?: NotificationType;
  message?: string;
  examType?: ExamType;
  examNumbers?: string[];
  pointAmount?: number | null;
  periodId?: number;
  statuses?: StudentStatus[];
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

    if (body.preview) {
      if (logIds.length > 0) {
        const result = await previewQueuedNotifications({ logIds });
        return NextResponse.json(result);
      }

      const examNumbers =
        body.examNumbers?.map((value) => String(value).trim()).filter(Boolean) ?? undefined;
      const result = await previewManualNotification({
        type: body.type ?? NotificationType.NOTICE,
        message: body.message,
        examType: body.examType,
        examNumbers,
        pointAmount:
          body.pointAmount === null || body.pointAmount === undefined
            ? null
            : Number(body.pointAmount),
      });

      return NextResponse.json(result);
    }

    if (logIds.length > 0) {
      const result = await sendQueuedNotifications({
        adminId: auth.context.adminUser.id,
        logIds,
        ipAddress: request.headers.get("x-forwarded-for"),
      });

      return NextResponse.json(result);
    }

    const statuses =
      body.statuses?.filter(
        (value) =>
          value === StudentStatus.WARNING_1 ||
          value === StudentStatus.WARNING_2 ||
          value === StudentStatus.DROPOUT,
      ) ?? [];
    const periodId = Number(body.periodId);

    if (statuses.length > 0 && Number.isInteger(periodId)) {
      const result = await sendStatusNotifications({
        adminId: auth.context.adminUser.id,
        periodId,
        examType: body.examType ?? ExamType.GONGCHAE,
        statuses,
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
