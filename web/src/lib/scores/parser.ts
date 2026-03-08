import { load } from "cheerio";
import { AttendType, ScoreSource } from "@/generated/prisma";
import { getSheetRows, readWorkbookFromBuffer, toCellString } from "@/lib/excel/workbook";

export type ParsedScoreRecord = {
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
};

export type ParsedQuestionRecord = {
  questionNo: number;
  correctAnswer: string;
};

export type ParsedAnswerRecord = {
  studentKey: string;
  questionNo: number;
  answer: string;
};

export type ParsedScoreImport = {
  sourceType: ScoreSource;
  matchingKey: "examNumber" | "onlineId";
  records: ParsedScoreRecord[];
  questions: ParsedQuestionRecord[];
  answers: ParsedAnswerRecord[];
  metadata: Record<string, unknown>;
};

type TableRows = Array<Array<string>>;

const OFFLINE_SCORE_SHEET_NAMES = ["score"];
const OFFLINE_ERRATA_SHEET_NAMES = ["errata"];

function normalizeHeader(value: unknown) {
  return toCellString(value).replace(/\s+/g, "").toLowerCase();
}

function normalizeExamNumber(value: unknown) {
  const raw = toCellString(value).replace(/\s+/g, "");
  return raw ? raw.replace(/\.0$/, "") : null;
}

function normalizeName(value: unknown) {
  const raw = toCellString(value);
  return raw ? raw.replace(/\s+/g, "") : "";
}

function normalizeAnswerValue(value: unknown) {
  const raw = toCellString(value).replace(/\s+/g, "");

  if (!raw || raw === "-") {
    return "";
  }

  return raw.replace(/\.0$/, "").toUpperCase();
}

function parseScoreNumber(value: unknown) {
  const raw = toCellString(value).replace(/,/g, "");

  if (!raw || raw === "-") {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function findSheetName(sheetNames: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map((candidate) => candidate.toLowerCase());

  return (
    sheetNames.find((sheetName) =>
      normalizedCandidates.includes(sheetName.replace(/\s+/g, "").toLowerCase()),
    ) ?? sheetNames[0]
  );
}

function findColumnIndex(headers: Array<unknown>, synonyms: string[]) {
  const normalizedSynonyms = synonyms.map((synonym) => synonym.replace(/\s+/g, "").toLowerCase());

  return headers.findIndex((header) => {
    const normalized = normalizeHeader(header);
    return normalizedSynonyms.some((synonym) => normalized.includes(synonym));
  });
}

function ensureColumnIndex(headers: Array<unknown>, synonyms: string[], label: string) {
  const index = findColumnIndex(headers, synonyms);

  if (index === -1) {
    throw new Error(`${label} 열을 찾을 수 없습니다.`);
  }

  return index;
}

function bufferToUtf8String(buffer: Buffer | ArrayBuffer) {
  return Buffer.isBuffer(buffer) ? buffer.toString("utf8") : Buffer.from(buffer).toString("utf8");
}

function htmlBufferToRows(buffer: Buffer | ArrayBuffer): TableRows {
  const html = bufferToUtf8String(buffer);
  const $ = load(html);
  const table = $("table").first();

  if (!table.length) {
    throw new Error("HTML 테이블을 찾을 수 없습니다.");
  }

  return table
    .find("tr")
    .toArray()
    .map((row) =>
      $(row)
        .find("th,td")
        .toArray()
        .map((cell) => $(cell).text().replace(/\u00a0/g, " ").trim()),
    )
    .filter((row) => row.some((cell) => cell !== ""));
}

function maybeHtmlRows(buffer: Buffer | ArrayBuffer) {
  const html = bufferToUtf8String(buffer);

  if (html.includes("<table")) {
    return htmlBufferToRows(buffer);
  }

  const workbook = readWorkbookFromBuffer(buffer);
  const sheetName = workbook.SheetNames[0];
  return getSheetRows(workbook, sheetName).map((row) => row.map((value) => toCellString(value)));
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

function inferCorrectedExamNumber(row: Array<unknown>, correctedIndex: number, examIndex: number) {
  return normalizeExamNumber(row[correctedIndex]) ?? normalizeExamNumber(row[examIndex]);
}

function detectAnswerStartIndex(headers: Array<unknown>) {
  const index = headers.findIndex((header) => {
    const normalized = normalizeHeader(header);
    return /^\d+(\.0)?$/.test(normalized);
  });

  if (index === -1) {
    throw new Error("답안 열 시작 위치를 찾을 수 없습니다.");
  }

  return index;
}

function looksLikeAnswerKeyRow(row: Array<unknown>, answerStartIndex: number, examIndex: number) {
  if (normalizeExamNumber(row[examIndex])) {
    return false;
  }

  const answers = row
    .slice(answerStartIndex)
    .map((value) => normalizeAnswerValue(value))
    .filter(Boolean);

  if (answers.length < 5) {
    return false;
  }

  const oxOnly = answers.every((answer) => answer === "O" || answer === "X");
  return !oxOnly;
}

function buildOfflineAnswerBundle(rows: Array<Array<unknown>>) {
  if (rows.length <= 1) {
    return {
      questions: [] as ParsedQuestionRecord[],
      answers: [] as ParsedAnswerRecord[],
    };
  }

  const headers = rows[0] ?? [];
  const answerStartIndex = detectAnswerStartIndex(headers);
  // errata 시트 자체 헤더에서 수험번호 컬럼 탐색 (score 시트와 컬럼 순서가 다를 수 있음)
  const examIndex = findColumnIndex(headers, ["학번", "수험번호", "응시번호"]);

  if (examIndex === -1) {
    return {
      questions: [] as ParsedQuestionRecord[],
      answers: [] as ParsedAnswerRecord[],
    };
  }

  const answerKeyRowIndex = rows.findIndex((row, index) =>
    index > 0 && looksLikeAnswerKeyRow(row, answerStartIndex, examIndex),
  );

  if (answerKeyRowIndex === -1) {
    return {
      questions: [] as ParsedQuestionRecord[],
      answers: [] as ParsedAnswerRecord[],
    };
  }

  const answerKeyRow = rows[answerKeyRowIndex] ?? [];
  const questions = answerKeyRow.slice(answerStartIndex).map((value, index) => ({
    questionNo: index + 1,
    correctAnswer: normalizeAnswerValue(value),
  }));

  const answers = rows
    .slice(1)
    .filter((row, index) => index + 1 !== answerKeyRowIndex)
    .flatMap((row) => {
      const examNumber = normalizeExamNumber(row[examIndex]);

      if (!examNumber) {
        return [];
      }

      return row.slice(answerStartIndex).flatMap((value, index) => {
        const answer = normalizeAnswerValue(value);

        if (!answer) {
          return [];
        }

        return {
          studentKey: examNumber,
          questionNo: index + 1,
          answer,
        } satisfies ParsedAnswerRecord;
      });
    });

  return {
    questions: questions.filter((question) => question.correctAnswer),
    answers,
  };
}

function parseIdentifierCell(value: string) {
  const match = value.trim().match(/^(.*?)(?:\((.*)\))?$/);

  if (!match) {
    return {
      onlineId: value.trim() || null,
      name: null,
    };
  }

  const [, rawOnlineId, rawName] = match;
  const onlineId = rawOnlineId.trim() || null;
  const name = rawName?.trim() || null;

  return {
    onlineId,
    name,
  };
}

function buildOnlineDetailBundle(
  rows: TableRows,
  baseOffset = 0,
) {
  const identifiers = rows[1] ?? [];
  const questionRows = rows.slice(2).filter((row) => row.some((cell) => cell !== ""));

  const students = identifiers.slice(3).map((cell, index) => ({
    ...parseIdentifierCell(cell),
    columnIndex: index + 3,
  }));

  const questions: ParsedQuestionRecord[] = [];
  const answers: ParsedAnswerRecord[] = [];

  for (const row of questionRows) {
    const questionNoValue = Number.parseInt(toCellString(row[1]), 10);
    const questionNo = Number.isFinite(questionNoValue)
      ? baseOffset + questionNoValue
      : baseOffset + questions.length + 1;
    const correctAnswer = normalizeAnswerValue(row[2]);

    if (!correctAnswer) {
      continue;
    }

    questions.push({
      questionNo,
      correctAnswer,
    });

    for (const student of students) {
      if (!student.onlineId) {
        continue;
      }

      const answer = normalizeAnswerValue(row[student.columnIndex]);

      if (!answer) {
        continue;
      }

      answers.push({
        studentKey: student.onlineId,
        questionNo,
        answer,
      });
    }
  }

  return {
    questions,
    answers,
  };
}

export function parseOfflineScoreImport(input: {
  fileName: string;
  buffer: Buffer | ArrayBuffer;
  attendType?: AttendType;
}) {
  const workbook = readWorkbookFromBuffer(input.buffer);
  const scoreSheetName = findSheetName(workbook.SheetNames, OFFLINE_SCORE_SHEET_NAMES);
  const errataSheetName =
    workbook.SheetNames.length > 1
      ? findSheetName(workbook.SheetNames, OFFLINE_ERRATA_SHEET_NAMES)
      : null;
  const scoreRows = getSheetRows(workbook, scoreSheetName);
  const headers = scoreRows[0] ?? [];
  const examIndex = ensureColumnIndex(headers, ["학번", "수험번호", "응시번호"], "수험번호");
  const correctedIndex = findColumnIndex(headers, ["학번(정정)", "수험번호(정정)", "정정수험번호"]);
  const nameIndex = findColumnIndex(headers, ["성명", "이름", "응시자명"]);
  const rawIndex = findColumnIndex(headers, ["원점수", "객관식", "점수"]);
  const finalIndex = findColumnIndex(headers, ["최종점수", "총점", "합계"]);
  const oxIndex = findColumnIndex(headers, ["주관식추가점수", "ox점수", "가산점", "주관식"]);

  const records = scoreRows
    .slice(1)
    .map((row, index) => {
      const examNumber =
        correctedIndex === -1
          ? normalizeExamNumber(row[examIndex])
          : inferCorrectedExamNumber(row, correctedIndex, examIndex);
      const name = nameIndex === -1 ? "" : toCellString(row[nameIndex]);
      const rawScore = rawIndex === -1 ? null : parseScoreNumber(row[rawIndex]);
      const oxScore =
        oxIndex === -1 || oxIndex === finalIndex ? null : parseScoreNumber(row[oxIndex]);
      const finalScore = computeFinalScore(
        rawScore,
        oxScore,
        finalIndex === -1 ? null : parseScoreNumber(row[finalIndex]),
      );

      return {
        rowKey: `offline:${index + 2}`,
        rowNumber: index + 2,
        examNumber,
        name,
        onlineId: null,
        rawScore: rawScore ?? finalScore,
        oxScore,
        finalScore,
        attendType: input.attendType ?? AttendType.NORMAL,
        sourceType: ScoreSource.OFFLINE_UPLOAD,
        note: null,
      } satisfies ParsedScoreRecord;
    })
    .filter(
      (record) =>
        Boolean(record.examNumber || record.name) &&
        (record.rawScore !== null || record.oxScore !== null || record.finalScore !== null),
    );

  const errataRows = errataSheetName ? getSheetRows(workbook, errataSheetName) : [];
  const bundle =
    errataRows.length > 0
      ? buildOfflineAnswerBundle(errataRows)
      : { questions: [] as ParsedQuestionRecord[], answers: [] as ParsedAnswerRecord[] };

  return {
    sourceType: ScoreSource.OFFLINE_UPLOAD,
    matchingKey: "examNumber",
    records,
    questions: bundle.questions,
    answers: bundle.answers,
    metadata: {
      fileName: input.fileName,
      scoreSheetName,
      errataSheetName,
    },
  } satisfies ParsedScoreImport;
}

function parseOnlineScoreRows(rows: TableRows) {
  const headers = rows[0] ?? [];
  const onlineIdIndex = ensureColumnIndex(headers, ["아이디", "수강자id", "온라인id"], "온라인 ID");
  const nameIndex = ensureColumnIndex(headers, ["이름", "응시자명", "성명"], "이름");
  const scoreIndex = ensureColumnIndex(headers, ["점수", "원점수"], "점수");

  return rows.slice(1).map((row, index) => ({
    rowKey: `online:${index + 2}`,
    rowNumber: index + 2,
    onlineId: toCellString(row[onlineIdIndex]) || null,
    name: toCellString(row[nameIndex]),
    score: parseScoreNumber(row[scoreIndex]),
    registeredAt: toCellString(row[findColumnIndex(headers, ["등록일", "응시시간"])]) || null,
  }));
}

function buildOxScoreLookup(rows: TableRows) {
  const records = parseOnlineScoreRows(rows);
  const byOnlineId = new Map<string, number>();
  const byName = new Map<string, number>();

  for (const record of records) {
    if (record.score === null) {
      continue;
    }

    if (record.onlineId) {
      byOnlineId.set(record.onlineId, record.score);
    }

    const normalizedName = normalizeName(record.name);
    if (normalizedName) {
      byName.set(normalizedName, record.score);
    }
  }

  return {
    byOnlineId,
    byName,
  };
}

export function parseOnlineScoreImport(input: {
  mainFileName: string;
  mainBuffer: Buffer | ArrayBuffer;
  oxFileName?: string;
  oxBuffer?: Buffer | ArrayBuffer;
  detailFileName?: string;
  detailBuffer?: Buffer | ArrayBuffer;
  oxDetailFileName?: string;
  oxDetailBuffer?: Buffer | ArrayBuffer;
  attendType?: AttendType;
}) {
  const mainRows = maybeHtmlRows(input.mainBuffer);
  const mainRecords = parseOnlineScoreRows(mainRows);
  const oxLookup =
    input.oxBuffer && input.oxFileName
      ? buildOxScoreLookup(maybeHtmlRows(input.oxBuffer))
      : null;

  const records = mainRecords
    .map((record) => {
      const oxScore =
        oxLookup?.byOnlineId.get(record.onlineId ?? "") ??
        oxLookup?.byName.get(normalizeName(record.name)) ??
        null;
      const finalScore = computeFinalScore(record.score, oxScore, null);

      return {
        rowKey: record.rowKey,
        rowNumber: record.rowNumber,
        examNumber: null,
        name: record.name,
        onlineId: record.onlineId,
        rawScore: record.score,
        oxScore,
        finalScore,
        attendType: input.attendType ?? AttendType.LIVE,
        sourceType: ScoreSource.ONLINE_UPLOAD,
        note: null,
      } satisfies ParsedScoreRecord;
    })
    .filter(
      (record) =>
        Boolean(record.onlineId || record.name) &&
        (record.rawScore !== null || record.oxScore !== null || record.finalScore !== null),
    );

  const detailBundle =
    input.detailBuffer && input.detailFileName
      ? buildOnlineDetailBundle(maybeHtmlRows(input.detailBuffer))
      : { questions: [] as ParsedQuestionRecord[], answers: [] as ParsedAnswerRecord[] };
  const oxDetailBundle =
    input.oxDetailBuffer && input.oxDetailFileName
      ? buildOnlineDetailBundle(
          maybeHtmlRows(input.oxDetailBuffer),
          detailBundle.questions.length,
        )
      : { questions: [] as ParsedQuestionRecord[], answers: [] as ParsedAnswerRecord[] };

  return {
    sourceType: ScoreSource.ONLINE_UPLOAD,
    matchingKey: "onlineId",
    records,
    questions: [...detailBundle.questions, ...oxDetailBundle.questions],
    answers: [...detailBundle.answers, ...oxDetailBundle.answers],
    metadata: {
      mainFileName: input.mainFileName,
      oxFileName: input.oxFileName ?? null,
      detailFileName: input.detailFileName ?? null,
      oxDetailFileName: input.oxDetailFileName ?? null,
    },
  } satisfies ParsedScoreImport;
}

function parseAttendType(value: string | undefined, fallback: AttendType) {
  const normalized = (value ?? "").trim().toUpperCase();

  if (normalized === "LIVE" || normalized === "온라인") {
    return AttendType.LIVE;
  }

  if (normalized === "EXCUSED" || normalized === "사유") {
    return AttendType.EXCUSED;
  }

  if (normalized === "ABSENT" || normalized === "결시" || normalized === "불참") {
    return AttendType.ABSENT;
  }

  return fallback;
}

export function parseScorePasteImport(input: {
  text: string;
  attendType?: AttendType;
}) {
  const rows = input.text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.split("\t"));

  const records = rows.map((values, index) => {
    const fourthValue = values[3]?.trim();
    const fifthValue = values[4]?.trim();
    const rawScore = parseScoreNumber(values[2]);
    const oxScore = fourthValue && /^-?\d+(\.\d+)?$/.test(fourthValue) ? Number(fourthValue) : null;
    const attendType = parseAttendType(
      oxScore === null ? fourthValue : fifthValue,
      input.attendType ?? AttendType.NORMAL,
    );

    return {
      rowKey: `paste:${index + 1}`,
      rowNumber: index + 1,
      examNumber: normalizeExamNumber(values[0]),
      name: toCellString(values[1]),
      onlineId: null,
      rawScore,
      oxScore,
      finalScore: computeFinalScore(rawScore, oxScore, null),
      attendType,
      sourceType: ScoreSource.PASTE_INPUT,
      note: null,
    } satisfies ParsedScoreRecord;
  });

  return {
    sourceType: ScoreSource.PASTE_INPUT,
    matchingKey: "examNumber",
    records: records.filter(
      (record) =>
        Boolean(record.examNumber || record.name) &&
        (record.rawScore !== null || record.oxScore !== null || record.finalScore !== null),
    ),
    questions: [] as ParsedQuestionRecord[],
    answers: [] as ParsedAnswerRecord[],
    metadata: {
      lineCount: rows.length,
    },
  } satisfies ParsedScoreImport;
}
