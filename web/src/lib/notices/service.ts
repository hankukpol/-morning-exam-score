import {
  ExamType,
  NoticeTargetType,
  NotificationType,
} from "@prisma/client";
import { toAuditJson } from "@/lib/audit";
import { sendManualNotification } from "@/lib/notifications/service";
import { sendNoticeWebPush } from "@/lib/notifications/web-push";
import { getPrisma } from "@/lib/prisma";
import { richTextToPlainText, sanitizeRichTextHtml } from "@/lib/rich-text";

export type NoticeFilters = {
  targetType?: NoticeTargetType;
  published?: boolean;
};

export type NoticeInput = {
  title: string;
  content: string;
  targetType: NoticeTargetType;
};

function noticeTargetToExamType(targetType: NoticeTargetType) {
  switch (targetType) {
    case NoticeTargetType.GONGCHAE:
      return ExamType.GONGCHAE;
    case NoticeTargetType.GYEONGCHAE:
      return ExamType.GYEONGCHAE;
    default:
      return undefined;
  }
}

function examTypeToNoticeTarget(examType: ExamType) {
  return examType === ExamType.GYEONGCHAE
    ? NoticeTargetType.GYEONGCHAE
    : NoticeTargetType.GONGCHAE;
}

function normalizeNoticeInput(input: NoticeInput) {
  const title = input.title.trim();
  const content = sanitizeRichTextHtml(input.content);

  if (!title) {
    throw new Error("\uACF5\uC9C0 \uC81C\uBAA9\uC744 \uC785\uB825\uD558\uC138\uC694.");
  }

  if (!content) {
    throw new Error("\uACF5\uC9C0 \uB0B4\uC6A9\uC744 \uC785\uB825\uD558\uC138\uC694.");
  }

  return {
    ...input,
    title,
    content,
  };
}

export async function listNotices(filters: NoticeFilters = {}) {
  return getPrisma().notice.findMany({
    where: {
      targetType: filters.targetType,
      isPublished:
        filters.published === undefined ? undefined : filters.published,
    },
    orderBy: [{ isPublished: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function listStudentNotices(examType?: ExamType) {
  const targetTypes = examType
    ? [NoticeTargetType.ALL, examTypeToNoticeTarget(examType)]
    : [NoticeTargetType.ALL];

  return getPrisma().notice.findMany({
    where: {
      isPublished: true,
      targetType: {
        in: targetTypes,
      },
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function createNotice(input: {
  adminId: string;
  payload: NoticeInput;
  ipAddress?: string | null;
}) {
  const payload = normalizeNoticeInput(input.payload);

  return getPrisma().$transaction(async (tx) => {
    const notice = await tx.notice.create({
      data: payload,
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "NOTICE_CREATE",
        targetType: "Notice",
        targetId: String(notice.id),
        before: toAuditJson(null),
        after: toAuditJson(notice),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return notice;
  });
}

export async function updateNotice(input: {
  adminId: string;
  noticeId: number;
  payload: NoticeInput;
  ipAddress?: string | null;
}) {
  const payload = normalizeNoticeInput(input.payload);

  return getPrisma().$transaction(async (tx) => {
    const before = await tx.notice.findUniqueOrThrow({
      where: {
        id: input.noticeId,
      },
    });

    const notice = await tx.notice.update({
      where: {
        id: input.noticeId,
      },
      data: payload,
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "NOTICE_UPDATE",
        targetType: "Notice",
        targetId: String(notice.id),
        before: toAuditJson(before),
        after: toAuditJson(notice),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return notice;
  });
}

export async function deleteNotice(input: {
  adminId: string;
  noticeId: number;
  ipAddress?: string | null;
}) {
  return getPrisma().$transaction(async (tx) => {
    const before = await tx.notice.findUniqueOrThrow({
      where: {
        id: input.noticeId,
      },
    });

    await tx.notice.delete({
      where: {
        id: input.noticeId,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "NOTICE_DELETE",
        targetType: "Notice",
        targetId: String(input.noticeId),
        before: toAuditJson(before),
        after: toAuditJson(null),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      success: true,
    };
  });
}

export async function publishNotice(input: {
  adminId: string;
  noticeId: number;
  isPublished: boolean;
  sendNotification?: boolean;
  ipAddress?: string | null;
}) {
  const result = await getPrisma().$transaction(async (tx) => {
    const before = await tx.notice.findUniqueOrThrow({
      where: {
        id: input.noticeId,
      },
    });

    const notice = await tx.notice.update({
      where: {
        id: input.noticeId,
      },
      data: {
        isPublished: input.isPublished,
        publishedAt: input.isPublished ? new Date() : null,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: input.isPublished ? "NOTICE_PUBLISH" : "NOTICE_UNPUBLISH",
        targetType: "Notice",
        targetId: String(notice.id),
        before: toAuditJson(before),
        after: toAuditJson(notice),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      notice,
      wasPublishedBefore: before.isPublished,
    };
  });

  let notificationError: string | null = null;
  let pushSummary:
    | {
        status: "completed" | "skipped" | "failed";
        message: string;
      }
    | null = null;

  if (input.isPublished && !result.wasPublishedBefore) {
    try {
      const pushResult = await sendNoticeWebPush(result.notice);

      pushSummary =
        pushResult.status === "completed"
          ? {
              status: "completed",
              message: `\uC804\uB2EC ${pushResult.sentCount}/${pushResult.totalSubscriptions}\uAC74, \uC2E4\uD328 ${pushResult.failedCount}\uAC74${
                pushResult.removedCount > 0
                  ? `, \uB9CC\uB8CC \uC815\uB9AC ${pushResult.removedCount}\uAC74`
                  : ""
              }`,
            }
          : {
              status: "skipped",
              message: pushResult.reason,
            };
    } catch (error) {
      console.error("[Notice] web push failed:", error);
      pushSummary = {
        status: "failed",
        message:
          error instanceof Error
            ? error.message
            : "\uD478\uC2DC \uBC1C\uC1A1 \uC911 \uC54C \uC218 \uC5C6\uB294 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
      };
    }
  }

  if (input.isPublished && input.sendNotification) {
    try {
      const plainTextContent = richTextToPlainText(result.notice.content);

      await sendManualNotification({
        adminId: input.adminId,
        type: NotificationType.NOTICE,
        message: `[\uACF5\uC9C0] ${result.notice.title}\n\n${plainTextContent}`,
        examType: noticeTargetToExamType(result.notice.targetType),
        ipAddress: input.ipAddress,
      });
    } catch (error) {
      notificationError =
        error instanceof Error
          ? error.message
          : "\uACF5\uC9C0 \uC54C\uB9BC \uBC1C\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
    }
  }

  return {
    notice: result.notice,
    notificationError,
    pushSummary,
  };
}
