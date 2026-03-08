import { Prisma } from "@/generated/prisma";
import { ExamType, Subject } from "@/generated/prisma";
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

export async function listCounselingStudents(filters: CounselingSearchFilters) {
  const search = filters.search?.trim();

  return getPrisma().student.findMany({
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
    take: 50,
  });
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
