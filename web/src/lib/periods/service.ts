import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { toAuditJson } from "@/lib/audit";
import { buildPeriodSessions } from "@/lib/periods/schedule";
import { CACHE_TAGS, revalidateAdminReadCaches } from "@/lib/cache-tags";
import { rebuildWeeklyStatusSnapshots } from "@/lib/analytics/service";

export type PeriodFormInput = {
  name: string;
  startDate: Date;
  endDate: Date;
  totalWeeks: number;
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
        sessions: {
          orderBy: [{ examDate: "asc" }, { examType: "asc" }],
          select: {
            id: true,
            examType: true,
            week: true,
            subject: true,
            examDate: true,
            isCancelled: true,
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
  const session = await getPrisma().$transaction(async (tx) => {
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

  await rebuildWeeklyStatusSnapshots(session.periodId, session.examType);
  revalidateAdminReadCaches({ analytics: true, periods: true });
  return session;
}

export function parsePeriodForm(raw: Record<string, unknown>) {
  const name = String(raw.name ?? "").trim();
  const startDate = new Date(String(raw.startDate ?? ""));
  const endDate = new Date(String(raw.endDate ?? ""));
  const totalWeeks = Number(raw.totalWeeks ?? 0);

  if (!name) {
    throw new Error("??れ삀??㉱??땬壤??怨룰도 ????곸죷??筌뚯뼚???");
  }

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("??筌믨퀣援????븍븕 ???ろ꼤嶺??繹먮끏援??嶺뚮Ĳ?됮??筌뚯뼚???");
  }

  if (startDate > endDate) {
    throw new Error("??筌믨퀣援??? ???ろ꼤嶺???⑤벚?????鴉??????ㅻ쿅????좊즵??λ눀????筌뤾퍓???");
  }

  // ??釉먯뒭?앗낆녃??????쾷 ?袁⑸즲??????濡ろ뜑??댁쾸?? ????????類??袁ъ??? 癲??嶺뚮Ĳ?뉒댆戮ル탶? ????ш끽維?? ???嶺뚮㉡???????ш낄援??
  // ??筌믨퀣援??? ?袁⑸즵?쀫쓧?????釉먯뒭???繹먮끏????⑤；????筌뤾퍓???
  if (startDate.getDay() !== 2) {
    throw new Error("??筌믨퀣援??? ??釉먯뒭???繹먮끏????⑤；????筌뤾퍓??? (?????쾷 ???濚욌꼬釉먮쳮??????ヂ???⑸쇀獄?????筌?留?????筌??袁⑸즲????筌뤾퍓???)");
  }

  if (!Number.isInteger(totalWeeks) || totalWeeks < 1 || totalWeeks > 12) {
    throw new Error("????낆뒩??뉗쾸??1~12 ?????嶺뚮Ĳ????????筌뤾퍓???");
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
      throw new Error("?????쾷 ???モ? ?嶺뚮Ĳ?뉛쭛???嶺뚮Ĳ?됮??筌뚯뼚???");
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
