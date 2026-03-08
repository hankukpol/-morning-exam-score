import { getPrisma } from "@/lib/prisma";
import { toAuditJson } from "@/lib/audit";
import { buildPeriodSessions } from "@/lib/periods/schedule";

export type PeriodFormInput = {
  name: string;
  startDate: Date;
  endDate: Date;
  totalWeeks: number;
};

export async function listPeriods() {
  return getPrisma().examPeriod.findMany({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    include: {
      sessions: {
        orderBy: [{ examDate: "asc" }, { examType: "asc" }],
        include: {
          _count: {
            select: {
              scores: true,
            },
          },
        },
      },
      _count: {
        select: {
          sessions: true,
          enrollments: true,
        },
      },
    },
  });
}

export async function createPeriod(input: {
  adminId: string;
  period: PeriodFormInput;
  autoGenerateSessions: boolean;
  ipAddress?: string | null;
}) {
  return getPrisma().$transaction(async (tx) => {
    const period = await tx.examPeriod.create({
      data: input.period,
    });

    let generatedSessions = 0;

    if (input.autoGenerateSessions) {
      const seeds = buildPeriodSessions(input.period);
      generatedSessions = seeds.length;

      await tx.examSession.createMany({
        data: seeds.map((seed) => ({
          periodId: period.id,
          examType: seed.examType,
          week: seed.week,
          subject: seed.subject,
          examDate: seed.examDate,
        })),
        skipDuplicates: true,
      });
    }

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "PERIOD_CREATE",
        targetType: "ExamPeriod",
        targetId: String(period.id),
        before: toAuditJson(null),
        after: toAuditJson({
          ...input.period,
          autoGenerateSessions: input.autoGenerateSessions,
          generatedSessions,
        }),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      period,
      generatedSessions,
    };
  });
}

export async function updatePeriod(input: {
  adminId: string;
  periodId: number;
  period: PeriodFormInput;
  ipAddress?: string | null;
}) {
  return getPrisma().$transaction(async (tx) => {
    const before = await tx.examPeriod.findUniqueOrThrow({
      where: {
        id: input.periodId,
      },
    });

    const period = await tx.examPeriod.update({
      where: {
        id: input.periodId,
      },
      data: input.period,
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "PERIOD_UPDATE",
        targetType: "ExamPeriod",
        targetId: String(period.id),
        before: toAuditJson(before),
        after: toAuditJson(input.period),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return period;
  });
}

export async function activatePeriod(input: {
  adminId: string;
  periodId: number;
  ipAddress?: string | null;
}) {
  return getPrisma().$transaction(async (tx) => {
    await tx.examPeriod.updateMany({
      data: {
        isActive: false,
      },
    });

    const period = await tx.examPeriod.update({
      where: {
        id: input.periodId,
      },
      data: {
        isActive: true,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "PERIOD_ACTIVATE",
        targetType: "ExamPeriod",
        targetId: String(input.periodId),
        before: toAuditJson(null),
        after: toAuditJson({
          isActive: true,
        }),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return period;
  });
}

export async function generatePeriodSessions(input: {
  adminId: string;
  periodId: number;
  ipAddress?: string | null;
}) {
  return getPrisma().$transaction(async (tx) => {
    const period = await tx.examPeriod.findUniqueOrThrow({
      where: {
        id: input.periodId,
      },
    });

    const seeds = buildPeriodSessions({
      startDate: period.startDate,
      endDate: period.endDate,
      totalWeeks: period.totalWeeks,
    });

    const existingSessions = await tx.examSession.findMany({
      where: {
        periodId: input.periodId,
      },
      select: {
        examType: true,
        week: true,
        subject: true,
        examDate: true,
      },
    });

    const existingKeys = new Set(
      existingSessions.map(
        (session) =>
          `${session.examType}:${session.week}:${session.subject}:${session.examDate.toISOString()}`,
      ),
    );

    const createData = seeds.filter(
      (seed) =>
        !existingKeys.has(
          `${seed.examType}:${seed.week}:${seed.subject}:${seed.examDate.toISOString()}`,
        ),
    );

    if (createData.length > 0) {
      await tx.examSession.createMany({
        data: createData.map((seed) => ({
          periodId: input.periodId,
          examType: seed.examType,
          week: seed.week,
          subject: seed.subject,
          examDate: seed.examDate,
        })),
      });
    }

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "PERIOD_GENERATE_SESSIONS",
        targetType: "ExamPeriod",
        targetId: String(input.periodId),
        before: toAuditJson(null),
        after: toAuditJson({
          generatedCount: createData.length,
        }),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      generatedCount: createData.length,
    };
  });
}

export async function updateSession(input: {
  adminId: string;
  sessionId: number;
  payload: {
    examDate?: Date;
    isCancelled?: boolean;
    cancelReason?: string | null;
  };
  ipAddress?: string | null;
}) {
  return getPrisma().$transaction(async (tx) => {
    const before = await tx.examSession.findUniqueOrThrow({
      where: {
        id: input.sessionId,
      },
    });

    const session = await tx.examSession.update({
      where: {
        id: input.sessionId,
      },
      data: {
        examDate: input.payload.examDate ?? before.examDate,
        isCancelled: input.payload.isCancelled ?? before.isCancelled,
        cancelReason:
          input.payload.isCancelled === false
            ? null
            : input.payload.cancelReason ?? before.cancelReason,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "SESSION_UPDATE",
        targetType: "ExamSession",
        targetId: String(input.sessionId),
        before: toAuditJson(before),
        after: toAuditJson(session),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return session;
  });
}

export function parsePeriodForm(raw: Record<string, unknown>) {
  const name = String(raw.name ?? "").trim();
  const startDate = new Date(String(raw.startDate ?? ""));
  const endDate = new Date(String(raw.endDate ?? ""));
  const totalWeeks = Number(raw.totalWeeks ?? 0);

  if (!name) {
    throw new Error("기간명을 입력하세요.");
  }

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("시작일과 종료일을 확인하세요.");
  }

  if (startDate > endDate) {
    throw new Error("시작일은 종료일보다 빠르거나 같아야 합니다.");
  }

  // 요일별 시험 배치(화=경찰학, 수=헌법/범죄학, 목=형소법, 금=누적, 월=형법)를 위해
  // 시작일은 반드시 화요일이어야 합니다.
  if (startDate.getDay() !== 2) {
    throw new Error("시작일은 화요일이어야 합니다. (시험 스케줄이 화~금·월 순서로 자동 배정됩니다.)");
  }

  if (!Number.isInteger(totalWeeks) || totalWeeks < 1 || totalWeeks > 12) {
    throw new Error("총 주차는 1~12 사이 정수여야 합니다.");
  }

  return {
    name,
    startDate,
    endDate,
    totalWeeks,
  } satisfies PeriodFormInput;
}

export function parseSessionUpdate(raw: Record<string, unknown>) {
  const result: {
    examDate?: Date;
    isCancelled?: boolean;
    cancelReason?: string | null;
  } = {};

  if (raw.examDate) {
    const examDate = new Date(String(raw.examDate));

    if (Number.isNaN(examDate.getTime())) {
      throw new Error("시험 날짜 형식을 확인하세요.");
    }

    result.examDate = examDate;
  }

  if (raw.isCancelled !== undefined) {
    result.isCancelled = Boolean(raw.isCancelled);
  }

  if (raw.cancelReason !== undefined) {
    const cancelReason = String(raw.cancelReason ?? "").trim();
    result.cancelReason = cancelReason || null;
  }

  return result;
}
