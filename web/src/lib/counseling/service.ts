import { Prisma } from "@/generated/prisma";
import { AppointmentStatus, ExamType, StudentStatus, Subject } from "@/generated/prisma";
import { toAuditJson } from "@/lib/audit";
import {
  getMonthlyStudentAnalysis,
  parseTargetScores,
  serializeTargetScores,
  type SubjectTargetScores,
} from "@/lib/analytics/analysis";
import { getPrisma } from "@/lib/prisma";

export type CounselingSearchFilters = {
  examType?: ExamType;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type CounselingRecordInput = {
  examNumber: string;
  counselorName: string;
  content: string;
  recommendation?: string | null;
  counseledAt: Date;
  nextSchedule?: Date | null;
};

async function getActivePeriodId() {
  const activePeriod =
    (await getPrisma().examPeriod.findFirst({
      where: { isActive: true },
      orderBy: { startDate: "desc" },
    })) ??
    (await getPrisma().examPeriod.findFirst({
      orderBy: { startDate: "desc" },
    }));

  return activePeriod?.id ?? null;
}

function normalizeCounselingInput(input: CounselingRecordInput) {
  const examNumber = input.examNumber.trim();
  const counselorName = input.counselorName.trim();
  const content = input.content.trim();

  if (!examNumber) {
    throw new Error("수험번호를 입력하세요.");
  }

  if (!counselorName) {
    throw new Error("담당 강사명을 입력하세요.");
  }

  if (!content) {
    throw new Error("면담 내용을 입력하세요.");
  }

  if (Number.isNaN(input.counseledAt.getTime())) {
    throw new Error("면담 일자를 확인하세요.");
  }

  if (input.nextSchedule && Number.isNaN(input.nextSchedule.getTime())) {
    throw new Error("다음 면담 일정을 확인하세요.");
  }

  return {
    ...input,
    examNumber,
    counselorName,
    content,
    recommendation: input.recommendation?.trim() || null,
    nextSchedule: input.nextSchedule ?? null,
  };
}

export async function getCounselingDashboard() {
  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const warningWhere = {
    isActive: true,
    currentStatus: {
      in: [StudentStatus.WARNING_1, StudentStatus.WARNING_2, StudentStatus.DROPOUT],
    },
    counselingRecords: { none: { counseledAt: { gte: thirtyDaysAgo } } },
  } satisfies Prisma.StudentWhereInput;

  const [todayScheduled, thisWeekScheduled, thisWeekDoneCount, thisMonthCount, warningNoRecentCount, warningStudents] =
    await Promise.all([
      getPrisma().counselingAppointment.findMany({
        where: { status: AppointmentStatus.SCHEDULED, scheduledAt: { gte: todayStart, lte: todayEnd } },
        select: {
          id: true,
          counselorName: true,
          agenda: true,
          scheduledAt: true,
          student: { select: { name: true, examNumber: true, examType: true } },
        },
        orderBy: { scheduledAt: "asc" },
        take: 20,
      }),
      getPrisma().counselingAppointment.findMany({
        where: { status: AppointmentStatus.SCHEDULED, scheduledAt: { gte: weekStart, lte: weekEnd } },
        select: {
          id: true,
          counselorName: true,
          agenda: true,
          scheduledAt: true,
          student: { select: { name: true, examNumber: true, examType: true } },
        },
        orderBy: { scheduledAt: "asc" },
      }),
      getPrisma().counselingRecord.count({
        where: { counseledAt: { gte: weekStart } },
      }),
      getPrisma().counselingRecord.count({
        where: { counseledAt: { gte: monthStart } },
      }),
      getPrisma().student.count({ where: warningWhere }),
      getPrisma().student.findMany({
        where: warningWhere,
        select: { examNumber: true, name: true, currentStatus: true, examType: true },
        orderBy: { examNumber: "asc" },
        take: 50,
      }),
    ]);

  return {
    todayScheduled,
    thisWeekScheduled,
    thisWeekDoneCount,
    thisMonthCount,
    warningNoRecentCount,
    warningStudents,
  };
}

export async function listCounselingStudents(filters: CounselingSearchFilters) {
  const search = filters.search?.trim();
  const pageSize = Math.min(Math.max(filters.pageSize ?? 30, 1), 100);
  const page = Math.max(filters.page ?? 1, 1);
  const where = {
    examType: filters.examType,
    isActive: true,
    OR: search
      ? [
          { examNumber: { contains: search } },
          { name: { contains: search } },
        ]
      : undefined,
  } satisfies Prisma.StudentWhereInput;

  const [rows, totalCount] = await Promise.all([
    getPrisma().student.findMany({
      where,
      select: {
        examNumber: true,
        name: true,
        phone: true,
        examType: true,
        currentStatus: true,
        generation: true,
        className: true,
        targetScores: true,
      },
      orderBy: [{ examNumber: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    getPrisma().student.count({ where }),
  ]);

  return {
    rows,
    totalCount,
    page,
    pageSize,
  };
}

export async function getCounselingProfile(examNumber: string) {
  const student = await getPrisma().student.findUnique({
    where: {
      examNumber,
    },
    include: {
      counselingRecords: {
        orderBy: {
          counseledAt: "desc",
        },
      },
      pointLogs: {
        orderBy: {
          grantedAt: "desc",
        },
        take: 10,
      },
      scores: {
        include: {
          session: true,
        },
        orderBy: {
          session: {
            examDate: "desc",
          },
        },
        take: 30,
      },
    },
  });

  if (!student) {
    return null;
  }

  const activePeriodId = await getActivePeriodId();
  const now = new Date();
  const monthlyAnalysis = activePeriodId
    ? await getMonthlyStudentAnalysis({
        periodId: activePeriodId,
        examType: student.examType,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        examNumber: student.examNumber,
      })
    : null;

  const recentFourWeeks = student.scores.slice(0, 20);
  const weeklyMap = new Map<string, number[]>();
  const subjectMap = new Map<Subject, number[]>();
  let absentCount = 0;

  for (const score of recentFourWeeks) {
    const scoreValue = score.finalScore ?? score.rawScore;
    const normalized = scoreValue === null ? null : scoreValue > 100 ? scoreValue / 2 : scoreValue;
    const weekKey = `${score.session.examDate.getFullYear()}-${String(score.session.week).padStart(2, "0")}`;

    if (normalized !== null) {
      const weekValues = weeklyMap.get(weekKey) ?? [];
      weekValues.push(normalized);
      weeklyMap.set(weekKey, weekValues);

      const subjectValues = subjectMap.get(score.session.subject) ?? [];
      subjectValues.push(normalized);
      subjectMap.set(score.session.subject, subjectValues);
    }

    if (score.attendType === "ABSENT") {
      absentCount += 1;
    }
  }

  const weeklySummary = Array.from(weeklyMap.entries())
    .map(([week, values]) => ({
      week,
      average: values.length === 0 ? null : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100,
    }))
    .slice(0, 4);
  const subjectSummary = Array.from(subjectMap.entries())
    .map(([subject, values]) => ({
      subject,
      average:
        values.length === 0
          ? null
          : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100,
    }))
    .sort((left, right) => (right.average ?? 0) - (left.average ?? 0));

  return {
    student: {
      examNumber: student.examNumber,
      name: student.name,
      phone: student.phone,
      examType: student.examType,
      currentStatus: student.currentStatus,
      generation: student.generation,
      className: student.className,
      targetScores: parseTargetScores(student.targetScores),
    },
    recentWeeklySummary: weeklySummary,
    recentSubjectSummary: subjectSummary,
    strengths: subjectSummary.slice(0, 2),
    weaknesses: [...subjectSummary].reverse().slice(0, 2),
    attendanceSummary: {
      recentScoreCount: recentFourWeeks.length,
      absentCount,
    },
    totalPoints: student.pointLogs.reduce((sum, log) => sum + log.amount, 0),
    recentPointLogs: student.pointLogs,
    counselingRecords: student.counselingRecords,
    monthlyAnalysis,
  };
}

export async function createCounselingRecord(input: {
  adminId: string;
  payload: CounselingRecordInput;
  ipAddress?: string | null;
}) {
  const payload = normalizeCounselingInput(input.payload);

  return getPrisma().$transaction(async (tx) => {
    const record = await tx.counselingRecord.create({
      data: payload,
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "COUNSELING_CREATE",
        targetType: "CounselingRecord",
        targetId: String(record.id),
        before: toAuditJson(null),
        after: toAuditJson(record),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return record;
  });
}

export async function updateCounselingRecord(input: {
  adminId: string;
  recordId: number;
  payload: Omit<CounselingRecordInput, "examNumber">;
  ipAddress?: string | null;
}) {
  const normalized = normalizeCounselingInput({
    ...input.payload,
    examNumber: "validated",
  });

  return getPrisma().$transaction(async (tx) => {
    const before = await tx.counselingRecord.findUniqueOrThrow({
      where: {
        id: input.recordId,
      },
    });

    const record = await tx.counselingRecord.update({
      where: {
        id: input.recordId,
      },
      data: {
        counselorName: normalized.counselorName,
        content: normalized.content,
        recommendation: normalized.recommendation,
        counseledAt: normalized.counseledAt,
        nextSchedule: normalized.nextSchedule,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "COUNSELING_UPDATE",
        targetType: "CounselingRecord",
        targetId: String(record.id),
        before: toAuditJson(before),
        after: toAuditJson(record),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return record;
  });
}

export async function deleteCounselingRecord(input: {
  adminId: string;
  recordId: number;
  ipAddress?: string | null;
}) {
  return getPrisma().$transaction(async (tx) => {
    const before = await tx.counselingRecord.findUniqueOrThrow({
      where: { id: input.recordId },
    });

    await tx.counselingRecord.delete({
      where: { id: input.recordId },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "COUNSELING_DELETE",
        targetType: "CounselingRecord",
        targetId: String(input.recordId),
        before: toAuditJson(before),
        after: toAuditJson(null),
        ipAddress: input.ipAddress ?? null,
      },
    });
  });
}

export async function updateStudentTargetScores(input: {
  adminId: string;
  examNumber: string;
  targetScores: SubjectTargetScores;
  ipAddress?: string | null;
}) {
  const examNumber = input.examNumber.trim();

  if (!examNumber) {
    throw new Error("수험번호를 확인하세요.");
  }

  const targetScores = serializeTargetScores(input.targetScores);

  return getPrisma().$transaction(async (tx) => {
    const before = await tx.student.findUniqueOrThrow({
      where: {
        examNumber,
      },
    });

    const student = await tx.student.update({
      where: {
        examNumber,
      },
      data: {
        targetScores: Object.keys(targetScores).length === 0 ? Prisma.JsonNull : targetScores,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "STUDENT_TARGET_SCORES_UPDATE",
        targetType: "Student",
        targetId: examNumber,
        before: toAuditJson(before.targetScores),
        after: toAuditJson(targetScores),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return parseTargetScores(student.targetScores);
  });
}

// ── 예약 면담 ──────────────────────────────────────────────

export type AppointmentInput = {
  examNumber: string;
  scheduledAt: Date;
  counselorName: string;
  agenda?: string | null;
};

const APPOINTMENT_INCLUDE = {
  student: { select: { name: true, examNumber: true, examType: true } },
} as const;

export async function listAppointments(filters?: {
  examNumber?: string;
  status?: AppointmentStatus;
  from?: Date;
  to?: Date;
}) {
  return getPrisma().counselingAppointment.findMany({
    where: {
      ...(filters?.examNumber ? { examNumber: filters.examNumber } : {}),
      ...(filters?.status !== undefined ? { status: filters.status } : {}),
      ...(filters?.from || filters?.to
        ? {
            scheduledAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
    include: APPOINTMENT_INCLUDE,
    orderBy: { scheduledAt: "asc" },
  });
}

export async function createAppointment(input: {
  adminId: string;
  payload: AppointmentInput;
  ipAddress?: string | null;
}) {
  const examNumber = input.payload.examNumber.trim();
  const counselorName = input.payload.counselorName.trim();

  if (!examNumber) throw new Error("수험번호를 입력하세요.");
  if (!counselorName) throw new Error("담당 강사명을 입력하세요.");
  if (Number.isNaN(input.payload.scheduledAt.getTime()))
    throw new Error("면담 예정일을 확인하세요.");

  return getPrisma().$transaction(async (tx) => {
    const record = await tx.counselingAppointment.create({
      data: {
        examNumber,
        scheduledAt: input.payload.scheduledAt,
        counselorName,
        agenda: input.payload.agenda?.trim() || null,
        status: AppointmentStatus.SCHEDULED,
      },
      include: APPOINTMENT_INCLUDE,
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "APPOINTMENT_CREATE",
        targetType: "CounselingAppointment",
        targetId: String(record.id),
        before: toAuditJson(null),
        after: toAuditJson(record),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return record;
  });
}

export async function updateAppointment(input: {
  adminId: string;
  appointmentId: number;
  action: "cancel" | "complete" | "reschedule";
  cancelReason?: string | null;
  scheduledAt?: Date;
  counselorName?: string;
  agenda?: string | null;
  ipAddress?: string | null;
}) {
  return getPrisma().$transaction(async (tx) => {
    const before = await tx.counselingAppointment.findUniqueOrThrow({
      where: { id: input.appointmentId },
    });

    let data: Parameters<typeof tx.counselingAppointment.update>[0]["data"] = {};

    if (input.action === "cancel") {
      data = {
        status: AppointmentStatus.CANCELLED,
        cancelReason: input.cancelReason?.trim() || null,
      };
    } else if (input.action === "complete") {
      data = { status: AppointmentStatus.COMPLETED };
    } else if (input.action === "reschedule") {
      if (!input.scheduledAt || Number.isNaN(input.scheduledAt.getTime()))
        throw new Error("변경할 날짜를 확인하세요.");
      data = {
        scheduledAt: input.scheduledAt,
        ...(input.counselorName ? { counselorName: input.counselorName.trim() } : {}),
        ...(input.agenda !== undefined ? { agenda: input.agenda?.trim() || null } : {}),
      };
    }

    const record = await tx.counselingAppointment.update({
      where: { id: input.appointmentId },
      data,
      include: APPOINTMENT_INCLUDE,
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: `APPOINTMENT_${input.action.toUpperCase()}`,
        targetType: "CounselingAppointment",
        targetId: String(record.id),
        before: toAuditJson(before),
        after: toAuditJson(record),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return record;
  });
}

export async function deleteAppointment(input: {
  adminId: string;
  appointmentId: number;
  ipAddress?: string | null;
}) {
  return getPrisma().$transaction(async (tx) => {
    const before = await tx.counselingAppointment.findUniqueOrThrow({
      where: { id: input.appointmentId },
    });

    await tx.counselingAppointment.delete({ where: { id: input.appointmentId } });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "APPOINTMENT_DELETE",
        targetType: "CounselingAppointment",
        targetId: String(input.appointmentId),
        before: toAuditJson(before),
        after: toAuditJson(null),
        ipAddress: input.ipAddress ?? null,
      },
    });
  });
}
