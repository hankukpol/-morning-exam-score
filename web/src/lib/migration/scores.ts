import {
  AttendType,
  ExamType,
  ScoreSource,
  Subject,
} from "@/generated/prisma";
import { toAuditJson } from "@/lib/audit";
import {
  getSheetRows,
  parseExcelDate,
  readWorkbookFromBuffer,
  toCellString,
} from "@/lib/excel/workbook";
import { hasDatabaseConfig } from "@/lib/env";
import { SUBJECT_LABEL } from "@/lib/constants";
import { getPrisma } from "@/lib/prisma";
import { ensurePeriodEnrollments } from "@/lib/periods/enrollments";
import { recalculateStatusCache } from "@/lib/analytics/service";

const MIGRATION_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 600_000,
} as const;

export type ScoreFilePreview = {
  fileName: string;
  detectedType:
    | "offline-score"
    | "offline-errata"
    | "online-score"
    | "online-ox-score"
    | "online-detail"
    | "online-ox-detail"
    | "legacy-workbook"
    | "unknown";
  sheetNames: string[];
  rowCount: number;
  headers: string[];
};

export type LegacyWorkbookScorePreviewRow = {
  rowKey: string;
  sheetName: string;
  week: number;
  subject: Subject;
  sessionId: number | null;
  sessionLabel: string | null;
  sessionExamDate: string | null;
  examNumber: string;
  name: string;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
  attendType: AttendType;
  status: "ready" | "overwrite" | "invalid";
  issues: string[];
  note: string | null;
};

export type LegacyWorkbookScorePreview = {
  fileName: string;
  period: {
    id: number;
    name: string;
  };
  examType: ExamType;
  sheetNames: string[];
  summary: {
    totalRows: number;
    readyRows: number;
    overwriteRows: number;
    invalidRows: number;
    absentRows: number;
    excusedRows: number;
    affectedSessions: number;
  };
  rows: LegacyWorkbookScorePreviewRow[];
};

type LegacyWorkbookParsedRow = {
  rowKey: string;
  sheetName: string;
  week: number;
  subject: Subject;
  dayKey: string | null;
  sessionId: number | null;
  sessionLabel: string | null;
  sessionExamDate: string | null;
  examNumber: string;
  name: string;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
  attendType: AttendType;
  note: string | null;
};

const SUBJECT_NAME_MAP: Array<[string, Subject]> = [
  ["헌법", Subject.CONSTITUTIONAL_LAW],
  ["형소법", Subject.CRIMINAL_PROCEDURE],
  ["형법", Subject.CRIMINAL_LAW],
  ["경찰학", Subject.POLICE_SCIENCE],
  ["범죄학", Subject.CRIMINOLOGY],
  ["누적", Subject.CUMULATIVE],
];

function normalizeText(value: unknown) {
  return toCellString(value).replace(/\s+/g, "").replace(/\./g, "").toLowerCase();
}

function normalizeExamNumber(value: unknown) {
  return toCellString(value).replace(/\s+/g, "").replace(/\.0$/, "");
}

function parseNumericScore(value: unknown) {
  const raw = toCellString(value).replace(/,/g, "").trim();

  if (!raw) {
    return null;
  }

  const parsed = Number(raw);

  if (Number.isFinite(parsed)) {
    return parsed;
  }

  const matched = raw.match(/-?\d+(?:\.\d+)?/);

  if (!matched) {
    return null;
  }

  const fallback = Number(matched[0]);
  return Number.isFinite(fallback) ? fallback : null;
}

function computeFinalScore(rawScore: number | null, oxScore: number | null) {
  if (rawScore === null && oxScore === null) {
    return null;
  }

  return (rawScore ?? 0) + (oxScore ?? 0);
}

function subjectFromCell(value: unknown) {
  const normalized = normalizeText(value);

  for (const [label, subject] of SUBJECT_NAME_MAP) {
    if (normalized.includes(label.replace(/\s+/g, "").toLowerCase())) {
      return subject;
    }
  }

  return null;
}

function detectScoreFileType(fileName: string, headers: string[], sheetNames: string[]) {
  const normalizedName = fileName.toLowerCase();
  const normalizedHeaders = headers.map((header) =>
    header.replace(/\s+/g, "").toLowerCase(),
  );
  const normalizedSheetNames = sheetNames.map((sheetName) =>
    sheetName.replace(/\s+/g, "").toLowerCase(),
  );

  if (
    normalizedSheetNames.includes("수강생명단".toLowerCase()) &&
    normalizedSheetNames.some((sheetName) => /^\d+주차$/i.test(sheetName))
  ) {
    return "legacy-workbook";
  }

  if (normalizedName.includes("모의고사채점표")) {
    return normalizedHeaders.includes("수험번호") ? "offline-score" : "offline-errata";
  }

  if (normalizedName.includes("o,x_채점표") || normalizedName.includes("ox_채점표")) {
    return "online-ox-detail";
  }

  if (normalizedName.includes("채점표")) {
    return "online-detail";
  }

  if (normalizedName.includes("o,x") || normalizedName.includes("ox")) {
    return "online-ox-score";
  }

  if (normalizedHeaders.includes("아이디") && normalizedHeaders.includes("점수")) {
    return "online-score";
  }

  return "unknown";
}

export function previewScoreFiles(
  files: Array<{
    fileName: string;
    buffer: Buffer | ArrayBuffer;
  }>,
) {
  return files.map((file) => {
    const workbook = readWorkbookFromBuffer(file.buffer);
    const firstSheetName = workbook.SheetNames[0];
    const rows = getSheetRows(workbook, firstSheetName);
    const headers = (rows[0] ?? []).map((value) => toCellString(value));

    return {
      fileName: file.fileName,
      detectedType: detectScoreFileType(file.fileName, headers, workbook.SheetNames),
      sheetNames: workbook.SheetNames,
      rowCount: Math.max(rows.length - 1, 0),
      headers,
    } satisfies ScoreFilePreview;
  });
}

function findSubjectColumns(rows: Array<Array<unknown>>) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 12); rowIndex += 1) {
    const matches = rows[rowIndex]
      .map((cell, columnIndex) => {
        const subject = subjectFromCell(cell);

        if (!subject) {
          return null;
        }

        return {
          columnIndex,
          subject,
        };
      })
      .filter((value): value is { columnIndex: number; subject: Subject } => Boolean(value));

    if (matches.length >= 2) {
      return {
        subjectRowIndex: rowIndex,
        subjectColumns: matches,
      };
    }
  }

  throw new Error("주차 시트에서 과목 블록을 찾지 못했습니다.");
}

function findHeaderRowIndex(
  rows: Array<Array<unknown>>,
  subjectColumns: Array<{ columnIndex: number; subject: Subject }>,
  startRowIndex: number,
) {
  for (let rowIndex = startRowIndex + 1; rowIndex < Math.min(rows.length, startRowIndex + 8); rowIndex += 1) {
    const count = subjectColumns.filter(({ columnIndex }) =>
      normalizeText(rows[rowIndex]?.[columnIndex]).includes("번호"),
    ).length;

    if (count >= Math.max(1, Math.floor(subjectColumns.length / 2))) {
      return rowIndex;
    }
  }

  throw new Error("주차 시트에서 점수 헤더 행을 찾지 못했습니다.");
}

type ParsedAttendScore = {
  attendType: AttendType;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
  note: string | null;
  skip?: boolean;
};

function parseAttendTypeAndScores(
  rawValue: unknown,
  bonusValue: unknown,
  totalValue?: unknown,
): ParsedAttendScore | null {
  const rawText = toCellString(rawValue).trim();
  const bonusText = toCellString(bonusValue).trim();
  const totalText = toCellString(totalValue).trim();
  const combined = `${rawText}${bonusText}${totalText}`.replace(/\s+/g, "");

  if (!combined) {
    return null;
  }

  if (combined.includes("참석성적") || combined.includes("참석")) {
    return {
      attendType: AttendType.NORMAL,
      rawScore: null,
      oxScore: null,
      finalScore: null,
      note: combined,
      skip: true,
    };
  }

  if (combined.includes("사유")) {
    return {
      attendType: AttendType.EXCUSED,
      rawScore: null,
      oxScore: null,
      finalScore: null,
      note: "기존 통합본: 사유 결시",
    };
  }

  if (
    combined.includes("탈락") ||
    combined.includes("결시") ||
    combined.includes("불참")
  ) {
    return {
      attendType: AttendType.ABSENT,
      rawScore: null,
      oxScore: null,
      finalScore: null,
      note: `기존 통합본 상태값: ${combined}`,
    };
  }

  const liveLike =
    rawText.includes("(라)") ||
    bonusText.includes("(라)") ||
    totalText.includes("(라)") ||
    combined.includes("라이브");

  if (liveLike) {
    const liveScore = parseNumericScore(totalValue) ?? parseNumericScore(rawValue);

    if (liveScore !== null) {
      return {
        attendType: AttendType.NORMAL,
        rawScore: liveScore,
        oxScore: null,
        finalScore: liveScore,
        note: combined,
      };
    }
  }

  const rawScore = parseNumericScore(rawValue);
  const oxScore = parseNumericScore(bonusValue);
  const totalScore = parseNumericScore(totalValue);

  if (rawScore === null && oxScore === null && totalScore !== null) {
    return {
      attendType: AttendType.NORMAL,
      rawScore: totalScore,
      oxScore: null,
      finalScore: totalScore,
      note: combined,
    };
  }

  if (rawScore === null && oxScore === null) {
    return {
      attendType: AttendType.NORMAL,
      rawScore: null,
      oxScore: null,
      finalScore: null,
      note: combined,
    };
  }

  return {
    attendType: AttendType.NORMAL,
    rawScore,
    oxScore,
    finalScore: computeFinalScore(rawScore, oxScore),
    note: null,
  };
}

function parseWeekNumber(sheetName: string) {
  const matched = sheetName.match(/(\d+)/);

  if (!matched) {
    throw new Error(`주차 시트 이름에서 주차를 읽지 못했습니다: ${sheetName}`);
  }

  return Number(matched[1]);
}

function parseDayKey(value: unknown) {
  const parsedDate = parseExcelDate(value);

  if (parsedDate) {
    const month = String(parsedDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(parsedDate.getUTCDate()).padStart(2, "0");
    return `${month}-${day}`;
  }

  const raw = toCellString(value);
  const matched = raw.match(/\d{1,2}/g);

  if (!matched || matched.length < 2 || raw.length > 20) {
    return null;
  }

  return `${matched[0]!.padStart(2, "0")}-${matched[1]!.padStart(2, "0")}`;
}

function resolveWeekDateMap(workbook: ReturnType<typeof readWorkbookFromBuffer>) {
  const summarySheetName =
    workbook.SheetNames[workbook.SheetNames.length - 2] ?? workbook.SheetNames[0];

  if (!summarySheetName) {
    return new Map<string, string>();
  }

  const rows = getSheetRows(workbook, summarySheetName) as Array<Array<unknown>>;
  const headerRowIndex = rows.findIndex(
    (row) => row.filter((value) => parseDayKey(value)).length >= 3,
  );

  if (headerRowIndex === -1) {
    return new Map<string, string>();
  }

  const dateRow = rows[headerRowIndex] ?? [];
  const subjectRow = rows[headerRowIndex + 1] ?? [];
  const datedColumns = dateRow.flatMap((value, index) =>
    parseDayKey(value) ? [index] : [],
  );

  if (datedColumns.length === 0) {
    return new Map<string, string>();
  }

  const blocks: number[][] = [];

  for (const columnIndex of datedColumns) {
    const lastBlock = blocks[blocks.length - 1];

    if (!lastBlock || columnIndex - lastBlock[lastBlock.length - 1]! > 5) {
      blocks.push([columnIndex]);
      continue;
    }

    lastBlock.push(columnIndex);
  }

  const weekDateMap = new Map<string, string>();

  blocks.forEach((columns, blockIndex) => {
    const localWeek = blockIndex + 1;

    for (const columnIndex of columns) {
      const subject = subjectFromCell(subjectRow[columnIndex]);
      const dayKey = parseDayKey(dateRow[columnIndex]);

      if (!subject || !dayKey) {
        continue;
      }

      weekDateMap.set(`${localWeek}:${subject}`, dayKey);
    }
  });

  return weekDateMap;
}

function findSheetDayKey(
  rows: Array<Array<unknown>>,
  subjectRowIndex: number,
  headerRowIndex: number,
  columnIndex: number,
) {
  for (let rowIndex = subjectRowIndex + 1; rowIndex < headerRowIndex; rowIndex += 1) {
    const dayKey = parseDayKey(rows[rowIndex]?.[columnIndex]);

    if (dayKey) {
      return dayKey;
    }
  }

  return null;
}

async function loadSessionMap(periodId: number, examType: ExamType) {
  const period = await getPrisma().examPeriod.findUniqueOrThrow({
    where: {
      id: periodId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  const sessions = await getPrisma().examSession.findMany({
    where: {
      periodId,
      examType,
    },
    select: {
      id: true,
      week: true,
      subject: true,
      examDate: true,
      isCancelled: true,
    },
  });

  const weekSessionMap = new Map(
    sessions.map((session) => [
      `${session.week}:${session.subject}`,
      {
        id: session.id,
        isCancelled: session.isCancelled,
        examDate: session.examDate.toISOString().slice(0, 10),
        label: `${session.week}주차 · ${session.subject} · ${session.examDate.toISOString().slice(0, 10)}`,
      },
    ]),
  );

  const daySessionMap = new Map(
    sessions.map((session) => [
      `${session.examDate.toISOString().slice(5, 10)}:${session.subject}`,
      {
        id: session.id,
        isCancelled: session.isCancelled,
        label: `${session.week}주차 · ${session.subject} · ${session.examDate.toISOString().slice(0, 10)}`,
      },
    ]),
  );

  return {
    period,
    weekSessionMap,
    daySessionMap,
  };
}

async function parseLegacyWorkbookRows(input: {
  fileName: string;
  fileBuffer: Buffer | ArrayBuffer;
  periodId: number;
  examType: ExamType;
}) {
  const workbook = readWorkbookFromBuffer(input.fileBuffer);
  const sheetNames = workbook.SheetNames;
  const weekSheetNames = sheetNames.filter((sheetName) => /^\d+주차$/i.test(sheetName.trim()));

  if (weekSheetNames.length === 0) {
    throw new Error("주차 시트를 찾지 못했습니다. 월간 통합본 파일인지 확인해 주세요.");
  }

  const { period, weekSessionMap, daySessionMap } = await loadSessionMap(
    input.periodId,
    input.examType,
  );
  const weekDateMap = resolveWeekDateMap(workbook);
  const rows: LegacyWorkbookParsedRow[] = [];

  for (const sheetName of weekSheetNames) {
    const week = parseWeekNumber(sheetName);
    const sheetRows = getSheetRows(workbook, sheetName);
    const { subjectRowIndex, subjectColumns } = findSubjectColumns(sheetRows as Array<Array<unknown>>);
    const headerRowIndex = findHeaderRowIndex(
      sheetRows as Array<Array<unknown>>,
      subjectColumns,
      subjectRowIndex,
    );

    for (let rowIndex = headerRowIndex + 1; rowIndex < sheetRows.length; rowIndex += 1) {
      const row = sheetRows[rowIndex] ?? [];

      for (const { columnIndex, subject } of subjectColumns) {
        const examNumber = normalizeExamNumber(row[columnIndex]);
        const name = toCellString(row[columnIndex + 1]).trim();
        const parsed = parseAttendTypeAndScores(
          row[columnIndex + 2],
          row[columnIndex + 3],
          row[columnIndex + 4],
        );

        if ((!examNumber && !name) || parsed?.skip) {
          continue;
        }

        const dayKey =
          weekDateMap.get(`${week}:${subject}`) ??
          findSheetDayKey(
            sheetRows as Array<Array<unknown>>,
            subjectRowIndex,
            headerRowIndex,
            columnIndex,
          );
        const session =
          (dayKey ? daySessionMap.get(`${dayKey}:${subject}`) : null) ??
          weekSessionMap.get(`${week}:${subject}`);

        rows.push({
          rowKey: `${sheetName}:${subject}:${rowIndex + 1}:${examNumber || name || "empty"}`,
          sheetName,
          week,
          subject,
          dayKey,
          sessionId: session?.id ?? null,
          sessionLabel: session?.label ?? null,
          sessionExamDate:
            session && "examDate" in session && typeof session.examDate === "string"
              ? session.examDate
              : session?.label.match(/\d{4}-\d{2}-\d{2}$/)?.[0] ?? null,
          examNumber,
          name,
          rawScore: parsed?.rawScore ?? null,
          oxScore: parsed?.oxScore ?? null,
          finalScore: parsed?.finalScore ?? null,
          attendType: parsed?.attendType ?? AttendType.NORMAL,
          note: parsed?.note ?? null,
        });
      }
    }
  }

  return {
    fileName: input.fileName,
    period,
    sheetNames,
    rows,
  };
}

export async function previewLegacyWorkbookScores(input: {
  fileName: string;
  fileBuffer: Buffer | ArrayBuffer;
  periodId: number;
  examType: ExamType;
}) {
  const parsed = await parseLegacyWorkbookRows(input);
  const examNumbers = parsed.rows.map((row) => row.examNumber).filter(Boolean);
  const sessionIds = parsed.rows.map((row) => row.sessionId).filter((value): value is number => value !== null);
  const studentSet = new Set<string>();
  const existingScoreSet = new Set<string>();

  if (hasDatabaseConfig()) {
    const [students, existingScores] = await Promise.all([
      getPrisma().student.findMany({
        where: {
          examNumber: {
            in: examNumbers,
          },
        },
        select: {
          examNumber: true,
        },
      }),
      getPrisma().score.findMany({
        where: {
          sessionId: {
            in: sessionIds,
          },
          examNumber: {
            in: examNumbers,
          },
        },
        select: {
          sessionId: true,
          examNumber: true,
        },
      }),
    ]);

    students.forEach((student) => {
      studentSet.add(student.examNumber);
    });
    existingScores.forEach((score) => {
      existingScoreSet.add(`${score.sessionId}:${score.examNumber}`);
    });
  }

  const duplicateCount = new Map<string, number>();

  for (const row of parsed.rows) {
    if (!row.sessionId || !row.examNumber) {
      continue;
    }

    const key = `${row.sessionId}:${row.examNumber}`;
    duplicateCount.set(key, (duplicateCount.get(key) ?? 0) + 1);
  }

  const rows = parsed.rows.map((row) => {
    const issues: string[] = [];

    if (!row.sessionId) {
      issues.push("선택한 기간에서 일치하는 시험 회차를 찾지 못했습니다.");
    }

    if (!row.examNumber) {
      issues.push("수험번호가 없습니다.");
    }

    if (row.sessionId && row.examNumber && (duplicateCount.get(`${row.sessionId}:${row.examNumber}`) ?? 0) > 1) {
      issues.push("같은 회차에 동일 수험번호가 중복되어 있습니다.");
    }

    if (row.examNumber && studentSet.size > 0 && !studentSet.has(row.examNumber)) {
      issues.push("학생 DB에 없는 수험번호입니다. 먼저 수강생 명단을 가져와 주세요.");
    }

    if (
      row.attendType === AttendType.NORMAL &&
      row.rawScore === null &&
      row.oxScore === null &&
      row.finalScore === null
    ) {
      issues.push("점수를 읽지 못했습니다.");
    }

    const overwrite =
      row.sessionId !== null &&
      row.examNumber &&
      existingScoreSet.has(`${row.sessionId}:${row.examNumber}`);

    return {
      ...row,
      status: issues.length > 0 ? "invalid" : overwrite ? "overwrite" : "ready",
      issues,
    } satisfies LegacyWorkbookScorePreviewRow;
  });

  return {
    fileName: parsed.fileName,
    period: parsed.period,
    examType: input.examType,
    sheetNames: parsed.sheetNames,
    summary: {
      totalRows: rows.length,
      readyRows: rows.filter((row) => row.status === "ready").length,
      overwriteRows: rows.filter((row) => row.status === "overwrite").length,
      invalidRows: rows.filter((row) => row.status === "invalid").length,
      absentRows: rows.filter((row) => row.attendType === AttendType.ABSENT).length,
      excusedRows: rows.filter((row) => row.attendType === AttendType.EXCUSED).length,
      affectedSessions: new Set(rows.map((row) => row.sessionId).filter(Boolean)).size,
    },
    rows,
  } satisfies LegacyWorkbookScorePreview;
}

export async function executeLegacyWorkbookScores(input: {
  adminId: string;
  fileName: string;
  fileBuffer: Buffer | ArrayBuffer;
  periodId: number;
  examType: ExamType;
  ipAddress?: string | null;
}) {
  if (!hasDatabaseConfig()) {
    throw new Error("Database is not configured.");
  }

  const preview = await previewLegacyWorkbookScores(input);
  const validRows = preview.rows.filter((row) => row.status !== "invalid" && row.sessionId && row.examNumber);

  if (validRows.length === 0) {
    throw new Error("반영 가능한 성적 데이터가 없습니다.");
  }

  const prisma = getPrisma();

  const existingScores = await prisma.score.findMany({
    where: {
      sessionId: {
        in: validRows.map((row) => row.sessionId!),
      },
      examNumber: {
        in: validRows.map((row) => row.examNumber),
      },
    },
    select: {
      sessionId: true,
      examNumber: true,
    },
  });
  const existingScoreSet = new Set(existingScores.map((score) => `${score.sessionId}:${score.examNumber}`));

  await prisma.$transaction(
    async (tx) => {
      for (const row of validRows) {
        await tx.score.upsert({
          where: {
            examNumber_sessionId: {
              examNumber: row.examNumber,
              sessionId: row.sessionId!,
            },
          },
          create: {
            examNumber: row.examNumber,
            sessionId: row.sessionId!,
            rawScore: row.rawScore,
            oxScore: row.oxScore,
            finalScore: row.finalScore,
            attendType: row.attendType,
            sourceType: ScoreSource.MIGRATION,
            note: row.note,
          },
          update: {
            rawScore: row.rawScore,
            oxScore: row.oxScore,
            finalScore: row.finalScore,
            attendType: row.attendType,
            sourceType: ScoreSource.MIGRATION,
            note: row.note,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          adminId: input.adminId,
          action: "MIGRATION_LEGACY_WORKBOOK_SCORES_EXECUTE",
          targetType: "LegacyWorkbookScoreMigration",
          targetId: `${input.periodId}:${input.examType}:${input.fileName}`,
          before: toAuditJson(null),
          after: toAuditJson({
            fileName: input.fileName,
            periodId: input.periodId,
            examType: input.examType,
            importedCount: validRows.length,
            createdCount: validRows.filter(
              (row) => !existingScoreSet.has(`${row.sessionId}:${row.examNumber}`),
            ).length,
            updatedCount: validRows.filter((row) =>
              existingScoreSet.has(`${row.sessionId}:${row.examNumber}`),
            ).length,
            invalidCount: preview.summary.invalidRows,
            absentCount: preview.summary.absentRows,
            excusedCount: preview.summary.excusedRows,
            affectedSessions: preview.summary.affectedSessions,
          }),
          ipAddress: input.ipAddress ?? null,
        },
      });
    },
    MIGRATION_TRANSACTION_OPTIONS,
  );

  await ensurePeriodEnrollments(
    input.periodId,
    validRows.map((row) => row.examNumber),
  );

  await recalculateStatusCache(input.periodId, input.examType);

  const createdCount = validRows.filter(
    (row) => !existingScoreSet.has(`${row.sessionId}:${row.examNumber}`),
  ).length;
  const updatedCount = validRows.length - createdCount;

  return {
    preview,
    importedCount: validRows.length,
    createdCount,
    updatedCount,
    invalidCount: preview.summary.invalidRows,
    affectedSessions: preview.summary.affectedSessions,
  };
}
