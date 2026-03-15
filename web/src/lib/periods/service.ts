import { cache } from "react";
import { unstable_cache } from "next/cache";
import { ExamType, Subject } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { toAuditJson } from "@/lib/audit";
import { buildPeriodSessions } from "@/lib/periods/schedule";
import { normalizeDisplaySubjectName } from "@/lib/periods/display-subject-name";
import { getEnabledExamTypes, isExamTypeEnabled } from "@/lib/periods/exam-types";
import { CACHE_TAGS, revalidateAdminReadCaches } from "@/lib/cache-tags";
import { recalculateStatusCache } from "@/lib/analytics/service";
import { EXAM_TYPE_SUBJECTS, EXAM_TYPE_VALUES, SUBJECT_VALUES } from "@/lib/constants";

export type PeriodFormInput = {
  name: string;
  startDate: Date;
  endDate: Date;
  totalWeeks: number;
  isGongchaeEnabled: boolean;
  isGyeongchaeEnabled: boolean;
};

export type SessionFormInput = {
  examType: ExamType;
  week: number;
  subject: Subject;
  displaySubjectName?: string | null;
  examDate: Date;
};

function reviveDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function normalizePeriod<T extends { startDate: Date | string; endDate: Date | string }>(
  period: T,
): T & { startDate: Date; endDate: Date } {
  return {
    ...period,
    startDate: reviveDate(period.startDate),
    endDate: reviveDate(period.endDate),
  };
}

async function recalculateStatusesForActivatedPeriod(periodId: number) {
  const students = await getPrisma().student.findMany({
    select: {
      examNumber: true,
      examType: true,
    },
  });
  const examNumbersByType = new Map<ExamType, string[]>(
    EXAM_TYPE_VALUES.map((examType) => [examType, []]),
  );

  for (const student of students) {
    examNumbersByType.get(student.examType)?.push(student.examNumber);
  }

  await Promise.all(
    EXAM_TYPE_VALUES.map((examType) =>
      recalculateStatusCache(periodId, examType, {
        examNumbers: examNumbersByType.get(examType),
      }),
    ),
  );
}

function normalizeSession<T extends { examDate: Date | string }>(
  session: T,
): T & { examDate: Date } {
  return {
    ...session,
    examDate: reviveDate(session.examDate),
  };
}

const listPeriodsBasicShared = unstable_cache(
  async () => {
    return getPrisma().examPeriod.findMany({
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        totalWeeks: true,
        isActive: true,
        isGongchaeEnabled: true,
        isGyeongchaeEnabled: true,
      },
    });
  },
  ["periods-basic"],
  { revalidate: 15, tags: [CACHE_TAGS.periodsBasic] },
);

export const listPeriodsBasic = cache(async () => {
  const periods = await listPeriodsBasicShared();
  return periods.map((period) => normalizePeriod(period));
});

export async function listPeriods() {
  return getPrisma().examPeriod.findMany({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    include: {
      sessions: {
        orderBy: [{ examDate: "asc" }, { examType: "asc" }, { subject: "asc" }],
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

const getPeriodWithSessionsShared = unstable_cache(
  async (periodId: number) => {
    return getPrisma().examPeriod.findUnique({
      where: {
        id: periodId,
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        totalWeeks: true,
        isActive: true,
        isGongchaeEnabled: true,
        isGyeongchaeEnabled: true,
        sessions: {
          orderBy: [{ examDate: "asc" }, { examType: "asc" }, { subject: "asc" }],
          select: {
            id: true,
            examType: true,
            week: true,
            subject: true,
            displaySubjectName: true,
            examDate: true,
            isCancelled: true,
            cancelReason: true,
            isLocked: true,
            lockedAt: true,
            lockedBy: true,
          },
        },
      },
    });
  },
  ["period-with-sessions"],
  { revalidate: 15, tags: [CACHE_TAGS.periodWithSessions] },
);

export const getPeriodWithSessions = cache(async (periodId: number) => {
  const period = await getPeriodWithSessionsShared(periodId);

  if (!period) {
    return null;
  }

  return {
    ...normalizePeriod(period),
    sessions: period.sessions.map((session) => normalizeSession(session)),
  };
});

export async function createPeriod(input: {
  adminId: string;
  period: PeriodFormInput;
  autoGenerateSessions: boolean;
  ipAddress?: string | null;
}) {
  const result = await getPrisma().$transaction(async (tx) => {
    const period = await tx.examPeriod.create({
      data: input.period,
    });

    let generatedSessions = 0;

    if (input.autoGenerateSessions) {
      const seeds = buildPeriodSessions({
        ...input.period,
        enabledExamTypes: getEnabledExamTypes(input.period),
      });
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

      // 1주차 누적 모의고사 세션은 시험이 없으므로 자동 취소
      await tx.examSession.updateMany({
        where: { periodId: period.id, week: 1, subject: Subject.CUMULATIVE },
        data: { isCancelled: true },
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

  revalidateAdminReadCaches({ analytics: true, periods: true });
  return result;
}
export async function updatePeriod(input: {
  adminId: string;
  periodId: number;
  period: PeriodFormInput;
  ipAddress?: string | null;
}) {
  const period = await getPrisma().$transaction(async (tx) => {
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

  revalidateAdminReadCaches({ analytics: true, periods: true });
  return period;
}

export async function activatePeriod(input: {
  adminId: string;
  periodId: number;
  ipAddress?: string | null;
}) {
  const period = await getPrisma().$transaction(async (tx) => {
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

  await recalculateStatusesForActivatedPeriod(period.id);
  revalidateAdminReadCaches({ analytics: true, periods: true });
  return period;
}

export async function generatePeriodSessions(input: {
  adminId: string;
  periodId: number;
  ipAddress?: string | null;
}) {
  const result = await getPrisma().$transaction(async (tx) => {
    const period = await tx.examPeriod.findUniqueOrThrow({
      where: {
        id: input.periodId,
      },
    });

    const seeds = buildPeriodSessions({
      startDate: period.startDate,
      endDate: period.endDate,
      totalWeeks: period.totalWeeks,
      enabledExamTypes: getEnabledExamTypes(period),
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

  revalidateAdminReadCaches({ analytics: true, periods: true });
  return result;
}

export async function createSession(input: {
  adminId: string;
  periodId: number;
  session: SessionFormInput;
  ipAddress?: string | null;
}) {
  const session = await getPrisma().$transaction(async (tx) => {
    const period = await tx.examPeriod.findUniqueOrThrow({
      where: { id: input.periodId },
      select: {
        id: true,
        name: true,
        totalWeeks: true,
        isGongchaeEnabled: true,
        isGyeongchaeEnabled: true,
      },
    });

    if (!isExamTypeEnabled(period, input.session.examType)) {
      throw new Error("선택한 직렬은 이 기간에서 비활성화되어 있습니다.");
    }

    if (!EXAM_TYPE_SUBJECTS[input.session.examType].includes(input.session.subject)) {
      throw new Error("선택한 직렬에서 사용할 수 없는 과목입니다.");
    }

    if (input.session.week < 1 || input.session.week > Math.max(period.totalWeeks, 12)) {
      throw new Error("주차는 1 이상이어야 하며 기간 범위를 크게 벗어날 수 없습니다.");
    }

    const duplicated = await tx.examSession.findFirst({
      where: {
        periodId: input.periodId,
        examType: input.session.examType,
        examDate: input.session.examDate,
        subject: input.session.subject,
      },
      select: { id: true },
    });

    if (duplicated) {
      throw new Error("같은 기간에 동일한 직렬·날짜·과목 회차가 이미 존재합니다.");
    }

    const session = await tx.examSession.create({
      data: {
        periodId: input.periodId,
        examType: input.session.examType,
        week: input.session.week,
        subject: input.session.subject,
        displaySubjectName: input.session.displaySubjectName ?? null,
        examDate: input.session.examDate,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "SESSION_CREATE",
        targetType: "ExamSession",
        targetId: String(session.id),
        before: toAuditJson(null),
        after: toAuditJson(session),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return session;
  });

  await recalculateStatusCache(session.periodId, session.examType);
  revalidateAdminReadCaches({ analytics: true, periods: true });
  return session;
}
export async function updateSession(input: {
  adminId: string;
  sessionId: number;
  payload: {
    examDate?: Date;
    subject?: Subject;
    displaySubjectName?: string | null;
    isCancelled?: boolean;
    cancelReason?: string | null;
    isLocked?: boolean;
  };
  ipAddress?: string | null;
}) {
  const session = await getPrisma().$transaction(async (tx) => {
    const before = await tx.examSession.findUniqueOrThrow({
      where: {
        id: input.sessionId,
      },
    });

    const nextExamDate = input.payload.examDate ?? before.examDate;
    const nextSubject = input.payload.subject ?? before.subject;
    const nextIsLocked = input.payload.isLocked ?? before.isLocked;
    const lockStateChanged = nextIsLocked !== before.isLocked;

    if (!EXAM_TYPE_SUBJECTS[before.examType].includes(nextSubject)) {
      throw new Error("선택한 직렬에서 사용할 수 없는 과목입니다.");
    }

    const duplicated = await tx.examSession.findFirst({
      where: {
        periodId: before.periodId,
        examType: before.examType,
        examDate: nextExamDate,
        subject: nextSubject,
        id: { not: input.sessionId },
      },
      select: { id: true },
    });

    if (duplicated) {
      throw new Error("같은 기간에 동일한 직렬·날짜·과목 회차가 이미 존재합니다.");
    }

    const session = await tx.examSession.update({
      where: {
        id: input.sessionId,
      },
      data: {
        examDate: nextExamDate,
        subject: nextSubject,
        displaySubjectName:
          input.payload.displaySubjectName !== undefined
            ? input.payload.displaySubjectName
            : before.displaySubjectName,
        isCancelled: input.payload.isCancelled ?? before.isCancelled,
        cancelReason:
          input.payload.isCancelled === false
            ? null
            : input.payload.cancelReason ?? before.cancelReason,
        isLocked: nextIsLocked,
        lockedAt: lockStateChanged ? (nextIsLocked ? new Date() : null) : before.lockedAt,
        lockedBy: lockStateChanged ? (nextIsLocked ? input.adminId : null) : before.lockedBy,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: lockStateChanged
          ? nextIsLocked
            ? "SESSION_LOCK"
            : "SESSION_UNLOCK"
          : "SESSION_UPDATE",
        targetType: "ExamSession",
        targetId: String(input.sessionId),
        before: toAuditJson(before),
        after: toAuditJson(session),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return session;
  });

  await recalculateStatusCache(session.periodId, session.examType);
  revalidateAdminReadCaches({ analytics: true, periods: true });
  return session;
}
export function parsePeriodForm(raw: Record<string, unknown>) {
  const name = String(raw.name ?? "").trim();
  const startDate = new Date(String(raw.startDate ?? ""));
  const endDate = new Date(String(raw.endDate ?? ""));
  const totalWeeks = Number(raw.totalWeeks ?? 0);
  const isGongchaeEnabled = raw.isGongchaeEnabled === undefined ? true : Boolean(raw.isGongchaeEnabled);
  const isGyeongchaeEnabled = raw.isGyeongchaeEnabled === undefined ? true : Boolean(raw.isGyeongchaeEnabled);

  if (!name) {
    throw new Error("기간명을 입력해 주세요.");
  }

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("시작일과 종료일을 올바른 날짜 형식으로 입력해 주세요.");
  }

  if (startDate > endDate) {
    throw new Error("시작일은 종료일보다 늦을 수 없습니다.");
  }

  if (startDate.getDay() !== 2) {
    throw new Error("기간 시작일은 화요일이어야 합니다. 주차 계산 기준이 화요일 시작으로 고정되어 있습니다.");
  }

  if (!Number.isInteger(totalWeeks) || totalWeeks < 1 || totalWeeks > 12) {
    throw new Error("총 주차는 1부터 12 사이로 입력해 주세요.");
  }

  if (!isGongchaeEnabled && !isGyeongchaeEnabled) {
    throw new Error("최소 한 개 이상의 직렬을 활성화해야 합니다.");
  }

  return {
    name,
    startDate,
    endDate,
    totalWeeks,
    isGongchaeEnabled,
    isGyeongchaeEnabled,
  } satisfies PeriodFormInput;
}
export function parseSessionCreate(raw: Record<string, unknown>) {
  const examType = String(raw.examType ?? "").trim() as ExamType;
  const subject = String(raw.subject ?? "").trim() as Subject;
  const displaySubjectName =
    raw.displaySubjectName === undefined ? null : normalizeDisplaySubjectName(raw.displaySubjectName);
  const week = Number(raw.week ?? 0);
  const examDate = new Date(String(raw.examDate ?? ""));

  if (!EXAM_TYPE_VALUES.includes(examType)) {
    throw new Error("직렬을 올바르게 선택해 주세요.");
  }

  if (!SUBJECT_VALUES.includes(subject)) {
    throw new Error("과목을 올바르게 선택해 주세요.");
  }

  if (!Number.isInteger(week) || week < 1) {
    throw new Error("주차는 1 이상의 정수여야 합니다.");
  }

  if (Number.isNaN(examDate.getTime())) {
    throw new Error("회차 날짜를 올바르게 입력해 주세요.");
  }

  return {
    examType,
    week,
    subject,
    displaySubjectName,
    examDate,
  } satisfies SessionFormInput;
}
export function parseSessionUpdate(raw: Record<string, unknown>) {
  const result: {
    examDate?: Date;
    subject?: Subject;
    displaySubjectName?: string | null;
    isCancelled?: boolean;
    cancelReason?: string | null;
    isLocked?: boolean;
  } = {};

  if (raw.examDate) {
    const examDate = new Date(String(raw.examDate));

    if (Number.isNaN(examDate.getTime())) {
      throw new Error("회차 날짜를 올바르게 입력해 주세요.");
    }

    result.examDate = examDate;
  }

  if (raw.subject !== undefined) {
    const subject = String(raw.subject ?? "").trim() as Subject;
    if (!SUBJECT_VALUES.includes(subject)) {
      throw new Error("과목을 올바르게 선택해 주세요.");
    }
    result.subject = subject;
  }

  if (raw.displaySubjectName !== undefined) {
    result.displaySubjectName = normalizeDisplaySubjectName(raw.displaySubjectName);
  }

  if (raw.isCancelled !== undefined) {
    result.isCancelled = Boolean(raw.isCancelled);
  }

  if (raw.cancelReason !== undefined) {
    const cancelReason = String(raw.cancelReason ?? "").trim();
    result.cancelReason = cancelReason || null;
  }

  if (raw.isLocked !== undefined) {
    result.isLocked = Boolean(raw.isLocked);
  }

  return result;
}
