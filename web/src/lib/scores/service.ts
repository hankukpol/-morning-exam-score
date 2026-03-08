import {
  AttendType,
  ExamType,
  Prisma,
  ScoreSource,
  Subject,
} from "@/generated/prisma";
import { toAuditJson } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import {
  parseOfflineScoreImport,
  parseOnlineScoreImport,
  parseScorePasteImport,
  type ParsedScoreImport,
} from "@/lib/scores/parser";
import { recalculateStatusCache } from "@/lib/analytics/service";

type StudentMatchRecord = {
  examNumber: string;
  name: string;
  onlineId: string | null;
  isActive: boolean;
};

export type ScoreFilters = {
  sessionId?: number;
  periodId?: number;
  examType?: ExamType;
  week?: number;
  subject?: Subject;
  examNumber?: string;
  date?: Date;
};

export type ScoreResolutionInput = Record<
  string,
  {
    examNumber?: string;
    bindOnlineId?: boolean;
  }
>;

export type ScorePreviewRow = {
  rowKey: string;
  rowNumber: number;
  examNumber: string | null;
  name: string;
  onlineId: string | null;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
  attendType: AttendType;
  sourceType: ScoreSource;
  note: string | null;
  status: "ready" | "overwrite" | "resolve" | "invalid";
  matchedBy: "examNumber" | "onlineId" | "name" | "manual" | null;
  matchedStudent: StudentMatchRecord | null;
  candidates: StudentMatchRecord[];
  issues: string[];
  bindOnlineIdSuggested: boolean;
  bindOnlineId: boolean;
  hasExistingScore: boolean;
};

export type ScorePreviewResult = {
  sourceType: ScoreSource;
  session: {
    id: number;
    periodId: number;
    periodName: string;
    examType: ExamType;
    week: number;
    subject: Subject;
    examDate: string;
    isCancelled: boolean;
  };
  rows: ScorePreviewRow[];
  summary: {
    totalRows: number;
    readyRows: number;
    overwriteRows: number;
    resolveRows: number;
    invalidRows: number;
    questionCount: number;
    answerCount: number;
  };
  metadata: Record<string, unknown>;
};

function normalizeName(value: string) {
  return value.replace(/\s+/g, "");
}

function computeFinalScore(rawScore: number | null, oxScore: number | null, finalScore: number | null) {
  if (finalScore !== null) {
    return finalScore;
  }

  if (rawScore === null && oxScore === null) {
    return null;
  }

  return (rawScore ?? 0) + (oxScore ?? 0);
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

async function getSessionOrThrow(sessionId: number) {
  return getPrisma().examSession.findUniqueOrThrow({
    where: {
      id: sessionId,
    },
    include: {
      period: true,
    },
  });
}

async function loadStudentMatches(examType: ExamType) {
  const students = await getPrisma().student.findMany({
    where: {
      examType,
    },
    select: {
      examNumber: true,
      name: true,
      onlineId: true,
      isActive: true,
    },
    orderBy: {
      examNumber: "asc",
    },
  });

  const byExamNumber = new Map(students.map((student) => [student.examNumber, student]));
  const byOnlineId = new Map(
    students
      .filter((student) => student.onlineId)
      .map((student) => [String(student.onlineId), student]),
  );
  const byName = new Map<string, StudentMatchRecord[]>();

  for (const student of students) {
    const key = normalizeName(student.name);
    const current = byName.get(key) ?? [];
    current.push(student);
    byName.set(key, current);
  }

  return {
    students,
    byExamNumber,
    byOnlineId,
    byName,
  };
}

function duplicateCounts(parsed: ParsedScoreImport) {
  const counts = new Map<string, number>();

  for (const record of parsed.records) {
    const key =
      parsed.matchingKey === "examNumber" ? record.examNumber : record.onlineId;

    if (!key) {
      continue;
    }

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

async function buildPreview(
  sessionId: number,
  parsed: ParsedScoreImport,
  resolutions: ScoreResolutionInput = {},
) {
  const session = await getSessionOrThrow(sessionId);
  const students = await loadStudentMatches(session.examType);
  const existingScores = await getPrisma().score.findMany({
    where: {
      sessionId,
    },
    select: {
      examNumber: true,
    },
  });
  const existingScoreSet = new Set(existingScores.map((score) => score.examNumber));
  const counts = duplicateCounts(parsed);

  const rows = parsed.records.map((record) => {
    const issues: string[] = [];
    const candidates: StudentMatchRecord[] = [];
    let matchedStudent: StudentMatchRecord | null = null;
    let matchedBy: ScorePreviewRow["matchedBy"] = null;

    if (parsed.matchingKey === "examNumber") {
      if (!record.examNumber) {
        issues.push("수험번호가 없습니다.");
      }
    } else if (!record.onlineId) {
      issues.push("온라인 ID가 없습니다.");
    }

    if (
      record.rawScore === null &&
      record.oxScore === null &&
      record.finalScore === null
    ) {
      issues.push("점수를 읽을 수 없습니다.");
    }

    const duplicateKey =
      parsed.matchingKey === "examNumber" ? record.examNumber : record.onlineId;

    if (duplicateKey && (counts.get(duplicateKey) ?? 0) > 1) {
      issues.push("입력 데이터에 동일 식별자가 중복되어 있습니다.");
    }

    if (issues.length === 0) {
      if (parsed.matchingKey === "examNumber" && record.examNumber) {
        matchedStudent = students.byExamNumber.get(record.examNumber) ?? null;
        matchedBy = matchedStudent ? "examNumber" : null;
      }

      if (!matchedStudent && parsed.matchingKey === "onlineId" && record.onlineId) {
        matchedStudent = students.byOnlineId.get(record.onlineId) ?? null;
        matchedBy = matchedStudent ? "onlineId" : null;
      }

      const resolution = resolutions[record.rowKey];

      if (!matchedStudent && resolution?.examNumber) {
        matchedStudent = students.byExamNumber.get(resolution.examNumber) ?? null;
        matchedBy = matchedStudent ? "manual" : null;
      }

      if (!matchedStudent && record.name) {
        candidates.push(...(students.byName.get(normalizeName(record.name)) ?? []));

        if (candidates.length === 1) {
          matchedStudent = candidates[0];
          matchedBy = "name";
        }
      }

      if (!matchedStudent && parsed.matchingKey === "examNumber") {
        issues.push("등록된 수강생을 찾을 수 없습니다.");
      }

      if (!matchedStudent && parsed.matchingKey === "onlineId" && candidates.length === 0) {
        issues.push("온라인 ID 또는 이름으로 매칭되는 수강생이 없습니다.");
      }
    }

    const hasExistingScore = matchedStudent
      ? existingScoreSet.has(matchedStudent.examNumber)
      : false;
    const bindOnlineIdSuggested = Boolean(
      matchedBy === "name" && record.onlineId && matchedStudent && !matchedStudent.onlineId,
    );
    const bindOnlineId = Boolean(
      record.onlineId && (resolutions[record.rowKey]?.bindOnlineId ?? bindOnlineIdSuggested),
    );

    let status: ScorePreviewRow["status"] = "invalid";

    if (issues.length > 0) {
      status = "invalid";
    } else if (!matchedStudent && candidates.length > 1) {
      status = "resolve";
    } else if (matchedStudent && hasExistingScore) {
      status = "overwrite";
    } else if (matchedStudent) {
      status = "ready";
    }

    return {
      rowKey: record.rowKey,
      rowNumber: record.rowNumber,
      examNumber: matchedStudent?.examNumber ?? record.examNumber,
      name: record.name,
      onlineId: record.onlineId,
      rawScore: record.rawScore,
      oxScore: record.oxScore,
      finalScore: computeFinalScore(record.rawScore, record.oxScore, record.finalScore),
      attendType: record.attendType,
      sourceType: record.sourceType,
      note: record.note,
      status,
      matchedBy,
      matchedStudent,
      candidates,
      issues,
      bindOnlineIdSuggested,
      bindOnlineId,
      hasExistingScore,
    } satisfies ScorePreviewRow;
  });

  return {
    sourceType: parsed.sourceType,
    session: {
      id: session.id,
      periodId: session.periodId,
      periodName: session.period.name,
      examType: session.examType,
      week: session.week,
      subject: session.subject,
      examDate: session.examDate.toISOString(),
      isCancelled: session.isCancelled,
    },
    rows,
    summary: {
      totalRows: rows.length,
      readyRows: rows.filter((row) => row.status === "ready").length,
      overwriteRows: rows.filter((row) => row.status === "overwrite").length,
      resolveRows: rows.filter((row) => row.status === "resolve").length,
      invalidRows: rows.filter((row) => row.status === "invalid").length,
      questionCount: parsed.questions.length,
      answerCount: parsed.answers.length,
    },
    metadata: parsed.metadata,
  } satisfies ScorePreviewResult;
}

type QuestionStatRecord = {
  questionNo: number;
  correctAnswer: string;
  correctRate: number | null;
  answerDistribution: Prisma.InputJsonValue;
  answers: Array<{
    examNumber: string;
    answer: string;
    isCorrect: boolean;
  }>;
};

function buildQuestionStats(
  parsed: ParsedScoreImport,
  resolvedRows: ScorePreviewRow[],
) {
  const keyToExamNumber = new Map<string, string>();

  for (const row of resolvedRows) {
    const studentKey =
      parsed.matchingKey === "examNumber" ? row.examNumber : row.onlineId;

    if (studentKey && row.matchedStudent) {
      keyToExamNumber.set(studentKey, row.matchedStudent.examNumber);
    }
  }

  return parsed.questions.map((question) => {
    const answers = parsed.answers
      .filter((answer) => answer.questionNo === question.questionNo)
      .flatMap((answer) => {
        const examNumber = keyToExamNumber.get(answer.studentKey);

        if (!examNumber) {
          return [];
        }

        const normalizedAnswer = answer.answer;
        return {
          examNumber,
          answer: normalizedAnswer,
          isCorrect: normalizedAnswer === question.correctAnswer,
        };
      });

    const distributionCounts = answers.reduce<Record<string, number>>((accumulator, answer) => {
      accumulator[answer.answer] = (accumulator[answer.answer] ?? 0) + 1;
      return accumulator;
    }, {});
    const totalAnswers = answers.length;
    const answerDistribution = Object.fromEntries(
      Object.entries(distributionCounts).map(([answer, count]) => [
        answer,
        totalAnswers === 0 ? 0 : roundToOneDecimal((count / totalAnswers) * 100),
      ]),
    );
    const correctCount = answers.filter((answer) => answer.isCorrect).length;

    return {
      questionNo: question.questionNo,
      correctAnswer: question.correctAnswer,
      correctRate:
        totalAnswers === 0
          ? null
          : roundToOneDecimal((correctCount / totalAnswers) * 100),
      answerDistribution: JSON.parse(
        JSON.stringify(answerDistribution),
      ) as Prisma.InputJsonValue,
      answers,
    } satisfies QuestionStatRecord;
  });
}

async function applyParsedImport(input: {
  adminId: string;
  sessionId: number;
  parsed: ParsedScoreImport;
  resolutions?: ScoreResolutionInput;
  ipAddress?: string | null;
}) {
  const preview = await buildPreview(input.sessionId, input.parsed, input.resolutions);
  const resolvedRows = preview.rows.filter(
    (row) =>
      (row.status === "ready" || row.status === "overwrite") &&
      row.matchedStudent,
  );

  if (preview.session.isCancelled) {
    throw new Error("취소된 시험 회차에는 성적을 반영할 수 없습니다.");
  }

  if (resolvedRows.length === 0) {
    throw new Error("반영할 수 있는 성적 행이 없습니다.");
  }

  const result = await getPrisma().$transaction(async (tx) => {
    let createdCount = 0;
    let updatedCount = 0;
    let boundOnlineIdCount = 0;

    for (const row of resolvedRows) {
      const matchedStudent = row.matchedStudent;

      if (!matchedStudent) {
        continue;
      }

      const existing = await tx.score.findUnique({
        where: {
          examNumber_sessionId: {
            examNumber: matchedStudent.examNumber,
            sessionId: input.sessionId,
          },
        },
      });

      await tx.score.upsert({
        where: {
          examNumber_sessionId: {
            examNumber: matchedStudent.examNumber,
            sessionId: input.sessionId,
          },
        },
        create: {
          examNumber: matchedStudent.examNumber,
          sessionId: input.sessionId,
          rawScore: row.rawScore,
          oxScore: row.oxScore,
          finalScore: row.finalScore,
          attendType: row.attendType,
          sourceType: row.sourceType,
          note: row.note ?? null,
        },
        update: {
          rawScore: row.rawScore,
          oxScore: row.oxScore,
          finalScore: row.finalScore,
          attendType: row.attendType,
          sourceType: row.sourceType,
          note: row.note ?? null,
        },
      });

      if (existing) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }

      if (
        row.sourceType === ScoreSource.ONLINE_UPLOAD &&
        row.onlineId &&
        row.bindOnlineId &&
        matchedStudent.onlineId !== row.onlineId
      ) {
        await tx.student.update({
          where: {
            examNumber: matchedStudent.examNumber,
          },
          data: {
            onlineId: row.onlineId,
          },
        });
        boundOnlineIdCount += 1;
      }
    }

    const questionStats = buildQuestionStats(input.parsed, resolvedRows);

    for (const question of questionStats) {
      const questionRecord = await tx.examQuestion.upsert({
        where: {
          sessionId_questionNo: {
            sessionId: input.sessionId,
            questionNo: question.questionNo,
          },
        },
        create: {
          sessionId: input.sessionId,
          questionNo: question.questionNo,
          correctAnswer: question.correctAnswer,
          correctRate: question.correctRate,
          answerDistribution: question.answerDistribution,
        },
        update: {
          correctAnswer: question.correctAnswer,
          correctRate: question.correctRate,
          answerDistribution: question.answerDistribution,
        },
      });

      for (const answer of question.answers) {
        await tx.studentAnswer.upsert({
          where: {
            examNumber_questionId: {
              examNumber: answer.examNumber,
              questionId: questionRecord.id,
            },
          },
          create: {
            examNumber: answer.examNumber,
            questionId: questionRecord.id,
            answer: answer.answer,
            isCorrect: answer.isCorrect,
          },
          update: {
            answer: answer.answer,
            isCorrect: answer.isCorrect,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: `SCORE_IMPORT_${input.parsed.sourceType}`,
        targetType: "ScoreImport",
        targetId: String(input.sessionId),
        before: toAuditJson(null),
        after: toAuditJson({
          sessionId: input.sessionId,
          sourceType: input.parsed.sourceType,
          createdCount,
          updatedCount,
          unresolvedCount: preview.summary.resolveRows,
          invalidCount: preview.summary.invalidRows,
          boundOnlineIdCount,
          questionCount: preview.summary.questionCount,
          answerCount: preview.summary.answerCount,
          metadata: preview.metadata,
        }),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      preview,
      createdCount,
      updatedCount,
      unresolvedCount: preview.summary.resolveRows,
      invalidCount: preview.summary.invalidRows,
      boundOnlineIdCount,
      importedCount: resolvedRows.length,
    };
  });

  await recalculateStatusCache(preview.session.periodId, preview.session.examType);

  return result;
}

export async function previewOfflineScoreUpload(input: {
  sessionId: number;
  fileName: string;
  buffer: Buffer | ArrayBuffer;
  attendType?: AttendType;
}) {
  const parsed = parseOfflineScoreImport({
    fileName: input.fileName,
    buffer: input.buffer,
    attendType: input.attendType,
  });

  return buildPreview(input.sessionId, parsed);
}

export async function executeOfflineScoreUpload(input: {
  adminId: string;
  sessionId: number;
  fileName: string;
  buffer: Buffer | ArrayBuffer;
  attendType?: AttendType;
  ipAddress?: string | null;
}) {
  const parsed = parseOfflineScoreImport({
    fileName: input.fileName,
    buffer: input.buffer,
    attendType: input.attendType,
  });

  return applyParsedImport({
    adminId: input.adminId,
    sessionId: input.sessionId,
    parsed,
    ipAddress: input.ipAddress,
  });
}

export async function previewOnlineScoreUpload(input: {
  sessionId: number;
  mainFileName: string;
  mainBuffer: Buffer | ArrayBuffer;
  oxFileName?: string;
  oxBuffer?: Buffer | ArrayBuffer;
  detailFileName?: string;
  detailBuffer?: Buffer | ArrayBuffer;
  oxDetailFileName?: string;
  oxDetailBuffer?: Buffer | ArrayBuffer;
  resolutions?: ScoreResolutionInput;
  attendType?: AttendType;
}) {
  const parsed = parseOnlineScoreImport(input);
  return buildPreview(input.sessionId, parsed, input.resolutions);
}

export async function executeOnlineScoreUpload(input: {
  adminId: string;
  sessionId: number;
  mainFileName: string;
  mainBuffer: Buffer | ArrayBuffer;
  oxFileName?: string;
  oxBuffer?: Buffer | ArrayBuffer;
  detailFileName?: string;
  detailBuffer?: Buffer | ArrayBuffer;
  oxDetailFileName?: string;
  oxDetailBuffer?: Buffer | ArrayBuffer;
  resolutions?: ScoreResolutionInput;
  attendType?: AttendType;
  ipAddress?: string | null;
}) {
  const parsed = parseOnlineScoreImport(input);
  return applyParsedImport({
    adminId: input.adminId,
    sessionId: input.sessionId,
    parsed,
    resolutions: input.resolutions,
    ipAddress: input.ipAddress,
  });
}

export async function previewPastedScores(input: {
  sessionId: number;
  text: string;
  attendType?: AttendType;
}) {
  const parsed = parseScorePasteImport({
    text: input.text,
    attendType: input.attendType,
  });

  return buildPreview(input.sessionId, parsed);
}

export async function executePastedScores(input: {
  adminId: string;
  sessionId: number;
  text: string;
  attendType?: AttendType;
  ipAddress?: string | null;
}) {
  const parsed = parseScorePasteImport({
    text: input.text,
    attendType: input.attendType,
  });

  return applyParsedImport({
    adminId: input.adminId,
    sessionId: input.sessionId,
    parsed,
    ipAddress: input.ipAddress,
  });
}

export async function listScores(filters: ScoreFilters) {
  const search = filters.examNumber?.trim();

  return getPrisma().score.findMany({
    where: {
      sessionId: filters.sessionId,
      examNumber: search
        ? {
            contains: search,
          }
        : undefined,
      student: {
        examType: filters.examType,
      },
      session: {
        periodId: filters.periodId,
        week: filters.week,
        subject: filters.subject,
        examDate: filters.date,
      },
    },
    include: {
      student: {
        select: {
          name: true,
          onlineId: true,
          examType: true,
        },
      },
      session: {
        include: {
          period: true,
        },
      },
    },
    orderBy: [{ session: { examDate: "desc" } }, { examNumber: "asc" }],
  });
}

export function parseScoreUpdate(raw: Record<string, unknown>) {
  const rawScore =
    raw.rawScore === "" || raw.rawScore === undefined || raw.rawScore === null
      ? null
      : Number(raw.rawScore);
  const oxScore =
    raw.oxScore === "" || raw.oxScore === undefined || raw.oxScore === null
      ? null
      : Number(raw.oxScore);
  const suppliedFinalScore =
    raw.finalScore === "" || raw.finalScore === undefined || raw.finalScore === null
      ? null
      : Number(raw.finalScore);

  if (
    [rawScore, oxScore, suppliedFinalScore].some(
      (value) => value !== null && !Number.isFinite(value),
    )
  ) {
    throw new Error("점수 형식을 확인하세요.");
  }

  return {
    rawScore,
    oxScore,
    finalScore: computeFinalScore(rawScore, oxScore, suppliedFinalScore),
    attendType: raw.attendType as AttendType,
    note: String(raw.note ?? "").trim() || null,
  };
}

export async function updateScoreEntry(input: {
  adminId: string;
  scoreId: number;
  payload: ReturnType<typeof parseScoreUpdate>;
  ipAddress?: string | null;
}) {
  const score = await getPrisma().$transaction(async (tx) => {
    const before = await tx.score.findUniqueOrThrow({
      where: {
        id: input.scoreId,
      },
      include: {
        session: {
          select: {
            periodId: true,
            examType: true,
          },
        },
      },
    });

    const score = await tx.score.update({
      where: {
        id: input.scoreId,
      },
      data: input.payload,
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "SCORE_UPDATE",
        targetType: "Score",
        targetId: String(score.id),
        before: toAuditJson(before),
        after: toAuditJson(score),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      score,
      session: before.session,
    };
  });

  await recalculateStatusCache(score.session.periodId, score.session.examType);

  return score.score;
}

export async function deleteScoreEntry(input: {
  adminId: string;
  scoreId: number;
  ipAddress?: string | null;
}) {
  const result = await getPrisma().$transaction(async (tx) => {
    const before = await tx.score.findUniqueOrThrow({
      where: {
        id: input.scoreId,
      },
      include: {
        session: {
          select: {
            periodId: true,
            examType: true,
          },
        },
      },
    });

    await tx.score.delete({
      where: {
        id: input.scoreId,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "SCORE_DELETE",
        targetType: "Score",
        targetId: String(input.scoreId),
        before: toAuditJson(before),
        after: toAuditJson(null),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      success: true,
      session: before.session,
    };
  });

  await recalculateStatusCache(result.session.periodId, result.session.examType);

  return {
    success: true,
  };
}
