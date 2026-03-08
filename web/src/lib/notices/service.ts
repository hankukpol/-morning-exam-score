import {
  ExamType,
  NoticeTargetType,
  NotificationType,
} from "@/generated/prisma";
import { toAuditJson } from "@/lib/audit";
import { sendManualNotification } from "@/lib/notifications/service";
import { getPrisma } from "@/lib/prisma";

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
  const content = input.content.trim();

  if (!title) {
    throw new Error("공지 제목을 입력하세요.");
  }

  if (!content) {
    throw new Error("공지 내용을 입력하세요.");
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
  const targetTypes =
    examType
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

    return notice;
  });

  let notificationError: string | null = null;

  if (input.isPublished && input.sendNotification) {
    try {
      await sendManualNotification({
      adminId: input.adminId,
      type: NotificationType.NOTICE,
      message: `[공지] ${result.title}\n\n${result.content}`,
      examType: noticeTargetToExamType(result.targetType),
        ipAddress: input.ipAddress,
      });
    } catch (error) {
      notificationError =
        error instanceof Error
          ? error.message
          : "공지 알림 발송에 실패했습니다.";
    }
  }

  return {
    notice: result,
    notificationError,
  };
}
