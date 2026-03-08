import {
  ExamType,
  NotificationChannel,
  NotificationType,
} from "@/generated/prisma";
import { SolapiMessageService } from "solapi";
import { toAuditJson } from "@/lib/audit";
import { getSetupState } from "@/lib/env";
import { normalizePhone } from "@/lib/excel/workbook";
import { getPrisma } from "@/lib/prisma";
import {
  buildNotificationMessage,
  buildNotificationVariables,
  getNotificationTemplateId,
} from "@/lib/notifications/templates";

type ConsentFilters = {
  examType?: ExamType;
  search?: string;
};

function getNotificationConfig() {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER;
  const pfId = process.env.SOLAPI_PF_ID;

  if (!apiKey || !apiSecret || !sender) {
    throw new Error("Solapi 환경변수가 설정되지 않았습니다.");
  }

  return {
    apiKey,
    apiSecret,
    sender,
    pfId: pfId ?? null,
  };
}

function getSolapiClient() {
  const config = getNotificationConfig();
  return {
    client: new SolapiMessageService(config.apiKey, config.apiSecret),
    config,
  };
}

export async function listNotificationCenterData(filters: ConsentFilters) {
  const search = filters.search?.trim();
  const prisma = getPrisma();

  const [students, pendingLogs, historyLogs] = await Promise.all([
    prisma.student.findMany({
      where: {
        examType: filters.examType,
        isActive: true,
        OR: search
          ? [
              { examNumber: { contains: search } },
              { name: { contains: search } },
            ]
          : undefined,
      },
      orderBy: [{ notificationConsent: "desc" }, { examNumber: "asc" }],
      select: {
        examNumber: true,
        name: true,
        phone: true,
        examType: true,
        currentStatus: true,
        notificationConsent: true,
        consentedAt: true,
      },
    }),
    prisma.notificationLog.findMany({
      where: {
        student: {
          examType: filters.examType,
        },
        status: {
          in: ["pending", "failed"],
        },
      },
      include: {
        student: {
          select: {
            name: true,
            phone: true,
            notificationConsent: true,
            examType: true,
          },
        },
      },
      orderBy: {
        sentAt: "desc",
      },
      take: 100,
    }),
    prisma.notificationLog.findMany({
      where: {
        student: {
          examType: filters.examType,
        },
      },
      include: {
        student: {
          select: {
            name: true,
            phone: true,
            notificationConsent: true,
            examType: true,
          },
        },
      },
      orderBy: {
        sentAt: "desc",
      },
      take: 100,
    }),
  ]);

  return {
    setup: getSetupState(),
    students,
    pendingLogs,
    historyLogs,
    summary: {
      totalStudents: students.length,
      consentedStudents: students.filter((student) => student.notificationConsent).length,
      excludedStudents: students.filter(
        (student) => !student.notificationConsent || !normalizePhone(student.phone ?? ""),
      ).length,
      pendingCount: pendingLogs.filter((log) => log.status === "pending").length,
      failedCount: pendingLogs.filter((log) => log.status === "failed").length,
    },
  };
}

export async function updateNotificationConsent(input: {
  adminId: string;
  examNumber: string;
  consent: boolean;
  ipAddress?: string | null;
}) {
  return getPrisma().$transaction(async (tx) => {
    const before = await tx.student.findUniqueOrThrow({
      where: {
        examNumber: input.examNumber,
      },
    });

    const student = await tx.student.update({
      where: {
        examNumber: input.examNumber,
      },
      data: {
        notificationConsent: input.consent,
        consentedAt: input.consent ? new Date() : null,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "STUDENT_NOTIFICATION_CONSENT_UPDATE",
        targetType: "Student",
        targetId: student.examNumber,
        before: toAuditJson(before),
        after: toAuditJson(student),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return student;
  });
}

async function deliverNotificationLog(log: {
  id: number;
  type: NotificationType;
  message: string;
  student: {
    name: string;
    phone: string | null;
    notificationConsent: boolean;
  };
}) {
  if (!log.student.notificationConsent) {
    return {
      status: "skipped",
      channel: NotificationChannel.SMS,
      failReason: "수신 동의가 없어 발송 대상에서 제외되었습니다.",
    } as const;
  }

  const normalizedPhone = normalizePhone(log.student.phone ?? "");

  if (!normalizedPhone) {
    return {
      status: "skipped",
      channel: NotificationChannel.SMS,
      failReason: "연락처가 없어 발송할 수 없습니다.",
    } as const;
  }

  const { client, config } = getSolapiClient();
  const templateId = getNotificationTemplateId(log.type);

  if (config.pfId && templateId) {
    try {
      await client.sendOne({
        to: normalizedPhone,
        from: config.sender,
        text: log.message,
        kakaoOptions: {
          pfId: config.pfId,
          templateId,
          variables: buildNotificationVariables({
            type: log.type,
            studentName: log.student.name,
            customMessage: log.message,
          }),
          disableSms: true,
        },
      });

      return {
        status: "sent",
        channel: NotificationChannel.ALIMTALK,
        failReason: null,
      } as const;
    } catch (error) {
      const fallbackReason =
        error instanceof Error ? `알림톡 실패 후 SMS 발송: ${error.message}` : "알림톡 실패 후 SMS 발송";

      try {
        await client.sendOne({
          to: normalizedPhone,
          from: config.sender,
          text: log.message,
          type: "SMS",
        });

        return {
          status: "sent",
          channel: NotificationChannel.SMS,
          failReason: fallbackReason,
        } as const;
      } catch (fallbackError) {
        return {
          status: "failed",
          channel: NotificationChannel.ALIMTALK,
          failReason:
            fallbackError instanceof Error
              ? `${fallbackReason} / SMS 실패: ${fallbackError.message}`
              : `${fallbackReason} / SMS 실패`,
        } as const;
      }
    }
  }

  try {
    await client.sendOne({
      to: normalizedPhone,
      from: config.sender,
      text: log.message,
      type: "SMS",
    });

    return {
      status: "sent",
      channel: NotificationChannel.SMS,
      failReason: null,
    } as const;
  } catch (error) {
    return {
      status: "failed",
      channel: NotificationChannel.SMS,
      failReason: error instanceof Error ? error.message : "SMS 발송에 실패했습니다.",
    } as const;
  }
}

export async function sendQueuedNotifications(input: {
  adminId: string;
  logIds: number[];
  ipAddress?: string | null;
}) {
  if (input.logIds.length === 0) {
    throw new Error("발송할 알림을 선택하세요.");
  }

  const prisma = getPrisma();
  const logs = await prisma.notificationLog.findMany({
    where: {
      id: {
        in: input.logIds,
      },
    },
    include: {
      student: {
        select: {
          name: true,
          phone: true,
          notificationConsent: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  const updated = [];

  for (const log of logs) {
    const result = await deliverNotificationLog(log);
    const next = await prisma.notificationLog.update({
      where: {
        id: log.id,
      },
      data: {
        channel: result.channel,
        status: result.status,
        failReason: result.failReason,
        sentAt: new Date(),
      },
    });
    updated.push(next);
  }

  await prisma.auditLog.create({
    data: {
      adminId: input.adminId,
      action: "NOTIFICATION_SEND",
      targetType: "NotificationLog",
      targetId: input.logIds.join(","),
      before: toAuditJson(null),
      after: toAuditJson(updated),
      ipAddress: input.ipAddress ?? null,
    },
  });

  return {
    sentCount: updated.filter((log) => log.status === "sent").length,
    failedCount: updated.filter((log) => log.status === "failed").length,
    skippedCount: updated.filter((log) => log.status === "skipped").length,
    logs: updated,
  };
}

export async function sendManualNotification(input: {
  adminId: string;
  type: NotificationType;
  message?: string;
  examType?: ExamType;
  examNumbers?: string[];
  pointAmount?: number | null;
  ipAddress?: string | null;
}) {
  const message = input.message?.trim() ?? "";

  if (!message && input.type === NotificationType.NOTICE) {
    throw new Error("발송 메시지를 입력하세요.");
  }

  const prisma = getPrisma();
  const recipients = await prisma.student.findMany({
    where: {
      examType: input.examType,
      isActive: true,
      examNumber: input.examNumbers?.length
        ? {
            in: input.examNumbers,
          }
        : undefined,
    },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      notificationConsent: true,
    },
  });

  if (recipients.length === 0) {
    throw new Error("발송 대상 학생이 없습니다.");
  }

  const createdLogs = [];

  for (const student of recipients) {
    const log = await prisma.notificationLog.create({
      data: {
        examNumber: student.examNumber,
        type: input.type,
        channel: NotificationChannel.ALIMTALK,
        message: buildNotificationMessage({
          type: input.type,
          studentName: student.name,
          customMessage: message || undefined,
          pointAmount: input.pointAmount ?? undefined,
        }),
        status: "pending",
      },
    });
    createdLogs.push(log);
  }

  return sendQueuedNotifications({
    adminId: input.adminId,
    logIds: createdLogs.map((log) => log.id),
    ipAddress: input.ipAddress,
  });
}
