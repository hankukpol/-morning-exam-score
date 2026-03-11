import { StudentType } from "@/generated/prisma";
import { toAuditJson } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import { revalidateAdminReadCaches } from "@/lib/cache-tags";

export async function listPeriodEnrollments(periodId: number) {
  return getPrisma().periodEnrollment.findMany({
    where: { periodId },
    include: {
      student: {
        select: {
          examNumber: true,
          name: true,
          examType: true,
          isActive: true,
        },
      },
    },
    orderBy: [{ student: { examType: "asc" } }, { student: { examNumber: "asc" } }],
  });
}

export async function previewEnrollmentPaste(periodId: number, text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const parsedRows = lines.map((line) => {
    const cols = line.split("\t").map((c) => c.trim());
    return {
      examNumber: cols[0] ?? "",
      name: cols[1] ?? null,
    };
  });

  const validRows = parsedRows.filter((r) => r.examNumber);

  if (validRows.length === 0) {
    return { rows: [], totalCount: 0 };
  }

  const prisma = getPrisma();
  const examNumbers = validRows.map((r) => r.examNumber);

  const [existingStudents, existingEnrollments] = await Promise.all([
    prisma.student.findMany({
      where: { examNumber: { in: examNumbers } },
      select: { examNumber: true, name: true, examType: true, isActive: true },
    }),
    prisma.periodEnrollment.findMany({
      where: { periodId, examNumber: { in: examNumbers } },
      select: { examNumber: true },
    }),
  ]);

  const studentMap = new Map(existingStudents.map((s) => [s.examNumber, s]));
  const enrolledSet = new Set(existingEnrollments.map((e) => e.examNumber));

  const rows = validRows.map((row) => {
    const student = studentMap.get(row.examNumber) ?? null;
    let status: "ready" | "already_enrolled" | "not_found";

    if (!student) {
      status = "not_found";
    } else if (enrolledSet.has(row.examNumber)) {
      status = "already_enrolled";
    } else {
      status = "ready";
    }

    return {
      examNumber: row.examNumber,
      name: row.name,
      student,
      status,
    };
  });

  return { rows, totalCount: rows.length };
}

export async function executeEnrollmentPaste(input: {
  adminId: string;
  periodId: number;
  examNumbers: string[];
  ipAddress?: string | null;
}) {
  const prisma = getPrisma();

  const result = await prisma.$transaction(async (tx) => {
    // ?꾩옱 ?뚯감 ?쒖옉??議고쉶 (?댁쟾 ?뚯감 ?먮퀎??
    const currentPeriod = await tx.examPeriod.findUniqueOrThrow({
      where: { id: input.periodId },
      select: { startDate: true },
    });

    const students = await tx.student.findMany({
      where: { examNumber: { in: input.examNumbers } },
      select: { examNumber: true },
    });

    const validExamNumbers = students.map((s) => s.examNumber);

    await tx.periodEnrollment.createMany({
      data: validExamNumbers.map((examNumber) => ({
        periodId: input.periodId,
        examNumber,
      })),
      skipDuplicates: true,
    });

    // ?댁쟾 ?뚯감 ?깅줉 ?대젰???덈뒗 ?좉퇋????湲곗〈???먮룞 蹂??
    const priorEnrollments = await tx.periodEnrollment.findMany({
      where: {
        examNumber: { in: validExamNumbers },
        period: { startDate: { lt: currentPeriod.startDate } },
      },
      select: { examNumber: true },
    });

    const examNumbersToUpgrade = [...new Set(priorEnrollments.map((e) => e.examNumber))];
    let upgradedCount = 0;

    if (examNumbersToUpgrade.length > 0) {
      const result = await tx.student.updateMany({
        where: {
          examNumber: { in: examNumbersToUpgrade },
          studentType: StudentType.NEW,
        },
        data: { studentType: StudentType.EXISTING },
      });
      upgradedCount = result.count;
    }

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "PERIOD_ENROLLMENT_ADD",
        targetType: "ExamPeriod",
        targetId: String(input.periodId),
        before: toAuditJson(null),
        after: toAuditJson({ examNumbers: validExamNumbers, upgradedToExisting: examNumbersToUpgrade }),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return { enrolledCount: validExamNumbers.length, upgradedCount };
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return result;
}

export async function ensurePeriodEnrollments(periodId: number, examNumbers: string[]) {
  const normalizedExamNumbers = Array.from(
    new Set(
      examNumbers
        .map((examNumber) => examNumber.trim())
        .filter(Boolean),
    ),
  );

  if (normalizedExamNumbers.length === 0) {
    return { enrolledCount: 0 };
  }

  const prisma = getPrisma();

  const result = await prisma.$transaction(async (tx) => {
    const currentPeriod = await tx.examPeriod.findUniqueOrThrow({
      where: { id: periodId },
      select: { startDate: true },
    });

    const students = await tx.student.findMany({
      where: { examNumber: { in: normalizedExamNumbers } },
      select: { examNumber: true },
    });

    const validExamNumbers = students.map((student) => student.examNumber);

    if (validExamNumbers.length === 0) {
      return { enrolledCount: 0 };
    }

    await tx.periodEnrollment.createMany({
      data: validExamNumbers.map((examNumber) => ({
        periodId,
        examNumber,
      })),
      skipDuplicates: true,
    });

    // ?댁쟾 ?뚯감 ?깅줉 ?대젰???덈뒗 ?좉퇋????湲곗〈???먮룞 蹂??
    const priorEnrollments = await tx.periodEnrollment.findMany({
      where: {
        examNumber: { in: validExamNumbers },
        period: { startDate: { lt: currentPeriod.startDate } },
      },
      select: { examNumber: true },
    });

    const examNumbersToUpgrade = [...new Set(priorEnrollments.map((e) => e.examNumber))];

    if (examNumbersToUpgrade.length > 0) {
      await tx.student.updateMany({
        where: {
          examNumber: { in: examNumbersToUpgrade },
          studentType: StudentType.NEW,
        },
        data: { studentType: StudentType.EXISTING },
      });
    }

    return { enrolledCount: validExamNumbers.length };
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return result;
}

export async function removeEnrollment(input: {
  adminId: string;
  periodId: number;
  examNumber: string;
  ipAddress?: string | null;
}) {
  const prisma = getPrisma();

  await prisma.periodEnrollment.delete({
    where: {
      periodId_examNumber: {
        periodId: input.periodId,
        examNumber: input.examNumber,
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      adminId: input.adminId,
      action: "PERIOD_ENROLLMENT_REMOVE",
      targetType: "ExamPeriod",
      targetId: String(input.periodId),
      before: toAuditJson({ examNumber: input.examNumber }),
      after: toAuditJson(null),
      ipAddress: input.ipAddress ?? null,
    },
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
}