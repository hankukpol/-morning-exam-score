import { NotificationType, StudentStatus } from "@/generated/prisma";

type MessageInput = {
  type: NotificationType;
  studentName: string;
  recoveryDate?: Date | null;
  weekAbsenceCount?: number | null;
  monthAbsenceCount?: number | null;
  customMessage?: string;
  pointAmount?: number;
};

export function notificationTypeFromStatus(status: StudentStatus) {
  switch (status) {
    case StudentStatus.WARNING_1:
      return NotificationType.WARNING_1;
    case StudentStatus.WARNING_2:
      return NotificationType.WARNING_2;
    case StudentStatus.DROPOUT:
      return NotificationType.DROPOUT;
    default:
      return null;
  }
}

export function getNotificationTemplateId(type: NotificationType) {
  switch (type) {
    case NotificationType.WARNING_1:
      return process.env.SOLAPI_TEMPLATE_WARNING_1 ?? null;
    case NotificationType.WARNING_2:
      return process.env.SOLAPI_TEMPLATE_WARNING_2 ?? null;
    case NotificationType.DROPOUT:
      return process.env.SOLAPI_TEMPLATE_DROPOUT ?? null;
    case NotificationType.POINT:
      return process.env.SOLAPI_TEMPLATE_POINT ?? null;
    case NotificationType.NOTICE:
      return process.env.SOLAPI_TEMPLATE_NOTICE ?? null;
    default:
      return null;
  }
}

function formatRecoveryDate(value?: Date | null) {
  if (!value) {
    return "-";
  }

  return value.toLocaleDateString("ko-KR");
}

export function buildNotificationMessage(input: MessageInput) {
  if (input.customMessage?.trim()) {
    return input.customMessage.trim();
  }

  switch (input.type) {
    case NotificationType.WARNING_1:
      return `[아침모의고사] ${input.studentName}님, 이번 주 무단 결시 ${input.weekAbsenceCount ?? 1}회로 1차 경고 상태입니다. 다음 시험 참여를 확인해주세요.`;
    case NotificationType.WARNING_2:
      return `[아침모의고사] ${input.studentName}님, 이번 주 무단 결시 ${input.weekAbsenceCount ?? 2}회로 2차 경고 상태입니다. 추가 결시 시 탈락 처리됩니다.`;
    case NotificationType.DROPOUT:
      return `[아침모의고사] ${input.studentName}님은 결시 기준 초과로 탈락 처리되었습니다. 주간 ${input.weekAbsenceCount ?? 0}회 / 월간 ${input.monthAbsenceCount ?? 0}회 기준이며 복귀 가능일은 ${formatRecoveryDate(input.recoveryDate)}입니다.`;
    case NotificationType.POINT:
      return `[아침모의고사] ${input.studentName}님께 포인트 ${input.pointAmount?.toLocaleString("ko-KR") ?? "0"}P가 지급되었습니다.`;
    case NotificationType.NOTICE:
      return `[아침모의고사] ${input.studentName}님께 운영 공지를 전달드립니다.`;
    default:
      return `[아침모의고사] ${input.studentName}님께 안내드립니다.`;
  }
}

export function buildNotificationVariables(input: MessageInput) {
  return {
    student_name: input.studentName,
    recovery_date: formatRecoveryDate(input.recoveryDate),
    week_absence_count: input.weekAbsenceCount ? String(input.weekAbsenceCount) : "",
    month_absence_count: input.monthAbsenceCount ? String(input.monthAbsenceCount) : "",
    point_amount: input.pointAmount ? String(input.pointAmount) : "",
    message_body: buildNotificationMessage(input),
  };
}
