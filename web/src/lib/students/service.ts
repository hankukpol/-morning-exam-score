import { Prisma } from "@prisma/client";
import { ExamType, StudentType } from "@prisma/client";
import {
  DUPLICATE_STRATEGY_LABEL,
  EXAM_TYPE_VALUES,
  STUDENT_TYPE_VALUES,
  type StudentPasteFieldKey,
} from "@/lib/constants";
import { toAuditJson } from "@/lib/audit";
import { normalizePhone, parseExcelDate, toCellString } from "@/lib/excel/workbook";
import { getPrisma } from "@/lib/prisma";
import { revalidateAdminReadCaches } from "@/lib/cache-tags";
import {
  previewStudentMigration,
  type StudentImportRecord,
  type StudentPreviewRow,
} from "@/lib/migration/students";
import {
  isPlaceholderStudentRecord,
  NON_PLACEHOLDER_STUDENT_FILTER,
} from "@/lib/students/placeholder";

export type StudentFilters = {
  examType?: ExamType;
  search?: string;
  generation?: number;
  activeOnly?: boolean;
  limit?: number;
  page?: number;
  pageSize?: number;
};

export type StudentFormInput = {
  examNumber: string;
  name: string;
  phone?: string | null;
  generation?: number | null;
  className?: string | null;
  examType: ExamType;
  studentType: StudentType;
  onlineId?: string | null;
  registeredAt?: Date | null;
  note?: string | null;
};

export type DuplicateStrategy = keyof typeof DUPLICATE_STRATEGY_LABEL;

type PasteDefaults = {
  examType: ExamType;
  studentType: StudentType;
  duplicateStrategy: DuplicateStrategy;
  classNameFallback?: string;
};

type PasteMapping = Partial<Record<StudentPasteFieldKey, number>>;

const STUDENT_IMPORT_UPDATE_BATCH_SIZE = 25;

function buildStudentListWhere(filters: StudentFilters): Prisma.StudentWhereInput {
  const search = filters.search?.trim();

  return {
    AND: [
      NON_PLACEHOLDER_STUDENT_FILTER,
      {
        examType: filters.examType,
        generation: filters.generation,
        isActive: filters.activeOnly === false ? undefined : true,
        OR: search
          ? [
              {
                examNumber: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            ]
          : undefined,
      },
    ],
  };
}

export async function listStudents(filters: StudentFilters) {
  return getPrisma().student.findMany({
    where: buildStudentListWhere(filters),
    orderBy: [{ isActive: "desc" }, { generation: "desc" }, { examNumber: "asc" }],
    take: filters.limit,
    include: {
      _count: {
        select: {
          scores: true,
        },
      },
    },
  });
}

export async function listStudentsPage(filters: StudentFilters) {
  const prisma = getPrisma();
  const pageSize = Math.min(Math.max(filters.pageSize ?? 30, 1), 100);
  const requestedPage = Math.max(filters.page ?? 1, 1);
  const where = buildStudentListWhere(filters);

  const totalCount = await prisma.student.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const students = await prisma.student.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { generation: "desc" }, { examNumber: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      _count: {
        select: {
          scores: true,
        },
      },
    },
  });

  return {
    page,
    pageSize,
    totalCount,
    students,
  };
}

export async function getStudentHistory(examNumber: string) {
  return getPrisma().student.findUnique({
    where: {
      examNumber,
    },
    include: {
      scores: {
        include: {
          session: {
            include: {
              period: true,
            },
          },
        },
        orderBy: {
          session: {
            examDate: "desc",
          },
        },
      },
    },
  });
}

function studentData(input: StudentFormInput) {
  return {
    examNumber: input.examNumber,
    name: input.name,
    phone: input.phone ?? null,
    generation: input.generation ?? null,
    className: input.className ?? null,
    examType: input.examType,
    studentType: input.studentType,
    onlineId: input.onlineId ?? null,
    registeredAt: input.registeredAt ?? null,
    note: input.note ?? null,
  } satisfies Prisma.StudentUncheckedCreateInput;
}

async function runPrismaWriteBatches(
  prisma: ReturnType<typeof getPrisma>,
  operations: Array<Prisma.PrismaPromise<unknown>>,
) {
  for (let index = 0; index < operations.length; index += STUDENT_IMPORT_UPDATE_BATCH_SIZE) {
    await prisma.$transaction(operations.slice(index, index + STUDENT_IMPORT_UPDATE_BATCH_SIZE));
  }
}

export async function createStudent(input: {
  adminId: string;
  student: StudentFormInput;
  ipAddress?: string | null;
}) {
  const student = await getPrisma().$transaction(async (tx) => {
    const student = await tx.student.create({
      data: studentData(input.student),
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "STUDENT_CREATE",
        targetType: "Student",
        targetId: student.examNumber,
        before: toAuditJson(null),
        after: toAuditJson(student),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return student;
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return student;
}

export async function updateStudent(input: {
  adminId: string;
  examNumber: string;
  student: StudentFormInput;
  ipAddress?: string | null;
}) {
  const student = await getPrisma().$transaction(async (tx) => {
    const before = await tx.student.findUniqueOrThrow({
      where: {
        examNumber: input.examNumber,
      },
    });

    const student = await tx.student.update({
      where: {
        examNumber: input.examNumber,
      },
      data: studentData(input.student),
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "STUDENT_UPDATE",
        targetType: "Student",
        targetId: student.examNumber,
        before: toAuditJson(before),
        after: toAuditJson(student),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return student;
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return student;
}

export async function deactivateStudent(input: {
  adminId: string;
  examNumber: string;
  ipAddress?: string | null;
}) {
  const student = await getPrisma().$transaction(async (tx) => {
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
        isActive: false,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "STUDENT_DEACTIVATE",
        targetType: "Student",
        targetId: student.examNumber,
        before: toAuditJson(before),
        after: toAuditJson(student),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return student;
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return student;
}

export async function reactivateStudent(input: {
  adminId: string;
  examNumber: string;
  ipAddress?: string | null;
}) {
  const student = await getPrisma().$transaction(async (tx) => {
    const before = await tx.student.findUniqueOrThrow({
      where: { examNumber: input.examNumber },
    });

    const student = await tx.student.update({
      where: { examNumber: input.examNumber },
      data: { isActive: true },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "STUDENT_REACTIVATE",
        targetType: "Student",
        targetId: student.examNumber,
        before: toAuditJson(before),
        after: toAuditJson(student),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return student;
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return student;
}

export function parseStudentForm(raw: Record<string, unknown>) {
  const examNumber = String(raw.examNumber ?? "").trim();
  const name = String(raw.name ?? "").trim();
  const phone = normalizePhone(raw.phone ?? "");

  if (!examNumber) {
    throw new Error("수험번호를 입력하세요.");
  }

  if (!name) {
    throw new Error("이름을 입력하세요.");
  }

  if (isPlaceholderStudentRecord({ examNumber, name, phone })) {
    throw new Error("헤더 행은 학생으로 등록할 수 없습니다.");
  }

  const generationRaw = String(raw.generation ?? "").trim();
  const registeredAtRaw = String(raw.registeredAt ?? "").trim();
  const generation = generationRaw ? Number(generationRaw) : null;
  const registeredAt = registeredAtRaw ? new Date(registeredAtRaw) : null;
  const examType = String(raw.examType ?? "").trim() as ExamType;
  const studentType = String(raw.studentType ?? "").trim() as StudentType;

  if (generationRaw && Number.isNaN(generation)) {
    throw new Error("기수는 숫자로 입력해주세요.");
  }

  if (registeredAt && Number.isNaN(registeredAt.getTime())) {
    throw new Error("등록일 형식이 올바르지 않습니다.");
  }

  if (!EXAM_TYPE_VALUES.includes(examType)) {
    throw new Error("시험 유형이 올바르지 않습니다.");
  }

  if (!STUDENT_TYPE_VALUES.includes(studentType)) {
    throw new Error("학생 구분이 올바르지 않습니다.");
  }

  return {
    examNumber,
    name,
    phone,
    generation,
    className: String(raw.className ?? "").trim() || null,
    examType,
    studentType,
    onlineId: String(raw.onlineId ?? "").trim() || null,
    registeredAt,
    note: String(raw.note ?? "").trim() || null,
  } satisfies StudentFormInput;
}

function buildPasteRecord(
  values: string[],
  mapping: PasteMapping,
  defaults: PasteDefaults,
) {
  const examNumber = toCellString(values[mapping.examNumber ?? -1]).replace(/\.0$/, "");
  const name = toCellString(values[mapping.name ?? -1]);
  const className =
    toCellString(values[mapping.className ?? -1]) || defaults.classNameFallback || "";
  const generationRaw = toCellString(values[mapping.generation ?? -1]);

  return {
    examNumber,
    name,
    phone: normalizePhone(values[mapping.phone ?? -1]),
    generation: generationRaw ? Number.parseInt(generationRaw, 10) : null,
    className: className || null,
    examType: defaults.examType,
    studentType: defaults.studentType,
    onlineId: null,
    registeredAt: parseExcelDate(values[mapping.registeredAt ?? -1]),
    note: null,
    isActive: true,
  } satisfies StudentImportRecord;
}

function hasPasteValues(record: StudentImportRecord) {
  return Boolean(record.examNumber || record.name || record.phone);
}

async function buildPreviewRows(
  records: Array<{ rowNumber: number; record: StudentImportRecord }>,
) {
  const examNumbers = records.map((item) => item.record.examNumber).filter(Boolean);
  const existing = await getPrisma().student.findMany({
    where: {
      AND: [
        NON_PLACEHOLDER_STUDENT_FILTER,
        {
          examNumber: {
            in: examNumbers,
          },
        },
      ],
    },
    select: {
      examNumber: true,
    },
  });
  const existingSet = new Set(existing.map((student) => student.examNumber));
  const duplicateMap = new Map<string, number>();

  for (const item of records) {
    if (item.record.examNumber) {
      duplicateMap.set(
        item.record.examNumber,
        (duplicateMap.get(item.record.examNumber) ?? 0) + 1,
      );
    }
  }

  const previewRows: StudentPreviewRow[] = records.map(({ rowNumber, record }) => {
    const issues: string[] = [];
    const isPlaceholderRow = isPlaceholderStudentRecord(record);

    if (!record.examNumber) {
      issues.push("수험번호가 없습니다.");
    }

    if (!record.name) {
      issues.push("이름이 없습니다.");
    }

    if (isPlaceholderRow) {
      issues.push("헤더 행은 학생으로 등록할 수 없습니다.");
    }

    if (
      record.examNumber &&
      (duplicateMap.get(record.examNumber) ?? 0) > 1
    ) {
      issues.push("입력 내 수험번호가 중복됩니다.");
    }

    return {
      rowNumber,
      issues,
      record,
      status:
        issues.length > 0
          ? "invalid"
          : existingSet.has(record.examNumber)
            ? "update"
            : "valid",
    };
  });

  return previewRows;
}

export async function previewStudentPasteImport(input: {
  text?: string;
  mapping: PasteMapping;
  defaults: PasteDefaults;
}) {
  const rows = (input.text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.split("\t"));

  const records = rows
    .map((values, index) => ({
      rowNumber: index + 1,
      record: buildPasteRecord(values, input.mapping, input.defaults),
    }))
    .filter(({ record }) => hasPasteValues(record));

  const previewRows = await buildPreviewRows(records);

  return {
    previewRows,
    summary: {
      totalRows: previewRows.length,
      validRows: previewRows.filter((row) => row.status === "valid").length,
      invalidRows: previewRows.filter((row) => row.status === "invalid").length,
      updateRows: previewRows.filter((row) => row.status === "update").length,
    },
  };
}

async function executeStudentRecords(input: {
  adminId: string;
  rows: StudentPreviewRow[];
  duplicateStrategy: DuplicateStrategy;
  ipAddress?: string | null;
}) {
  const prisma = getPrisma();
  const validRows = input.rows.filter((row) => row.status !== "invalid");
  const newRows = validRows.filter((row) => row.status === "valid");
  const updateRows = validRows.filter((row) => row.status === "update");

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  // 신규 학생 일괄 생성 (createMany = 단일 쿼리)
  if (newRows.length > 0) {
    await prisma.student.createMany({
      data: newRows.map((row) => studentData(row.record)),
      skipDuplicates: true,
    });
    createdCount = newRows.length;
  }

  // 중복 학생 처리
  if (updateRows.length > 0) {
    if (input.duplicateStrategy === "SKIP") {
      skippedCount = updateRows.length;
    } else {
      // 기존 데이터 일괄 조회 (단일 쿼리)
      const existingMap = input.duplicateStrategy === "UPDATE"
        ? new Map(
            (await prisma.student.findMany({
              where: { examNumber: { in: updateRows.map((r) => r.record.examNumber) } },
              select: {
                examNumber: true, name: true, phone: true, generation: true,
                className: true, onlineId: true, registeredAt: true, note: true,
              },
            })).map((s) => [s.examNumber, s])
          )
        : new Map();

      // 병렬 업데이트
      const updateOperations = updateRows.map((row) => {
        const existing = existingMap.get(row.record.examNumber);
        const updateData =
          input.duplicateStrategy === "OVERWRITE" || !existing
            ? studentData(row.record)
            : {
                name: row.record.name || existing.name,
                phone: row.record.phone ?? existing.phone,
                generation: row.record.generation ?? existing.generation,
                className: row.record.className ?? existing.className,
                examType: row.record.examType,
                studentType: row.record.studentType,
                onlineId: row.record.onlineId ?? existing.onlineId,
                registeredAt: row.record.registeredAt ?? existing.registeredAt,
                note: row.record.note ?? existing.note,
              };

        return prisma.student.update({
          where: { examNumber: row.record.examNumber },
          data: updateData,
        });
      });

      await runPrismaWriteBatches(prisma, updateOperations);
      updatedCount = updateRows.length;
    }
  }

  await prisma.auditLog.create({
    data: {
      adminId: input.adminId,
      action: "STUDENT_PASTE_IMPORT",
      targetType: "Student",
      targetId: "bulk",
      before: toAuditJson(null),
      after: toAuditJson({
        duplicateStrategy: input.duplicateStrategy,
        createdCount,
        updatedCount,
        skippedCount,
        importedCount: validRows.length,
      }),
      ipAddress: input.ipAddress ?? null,
    },
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return {
    importedCount: validRows.length,
    createdCount,
    updatedCount,
    skippedCount,
  };
}

export async function executeStudentPasteImport(input: {
  adminId: string;
  text?: string;
  mapping: PasteMapping;
  defaults: PasteDefaults;
  ipAddress?: string | null;
}) {
  const preview = await previewStudentPasteImport(input);
  return executeStudentRecords({
    adminId: input.adminId,
    rows: preview.previewRows,
    duplicateStrategy: input.defaults.duplicateStrategy,
    ipAddress: input.ipAddress,
  });
}

export async function previewStudentFileImport(input: {
  fileName: string;
  buffer: Buffer | ArrayBuffer;
  defaults: Omit<PasteDefaults, "duplicateStrategy">;
}) {
  return previewStudentMigration({
    fileName: input.fileName,
    fileBuffer: input.buffer,
    defaults: input.defaults,
  });
}

export async function executeStudentFileImport(input: {
  adminId: string;
  fileName: string;
  buffer: Buffer | ArrayBuffer;
  defaults: PasteDefaults;
  ipAddress?: string | null;
}) {
  const preview = await previewStudentMigration({
    fileName: input.fileName,
    fileBuffer: input.buffer,
    defaults: input.defaults,
  });

  return executeStudentRecords({
    adminId: input.adminId,
    rows: preview.previewRows,
    duplicateStrategy: input.defaults.duplicateStrategy,
    ipAddress: input.ipAddress,
  });
}
