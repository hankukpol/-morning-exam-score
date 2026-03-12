import assert from "node:assert/strict";
import { AttendType, ScoreSource } from "@prisma/client";
import {
  DUPLICATE_RESOLVED_STUDENT_MESSAGE,
  applyDuplicateResolvedStudentIssues,
  dedupeScoreWriteRecords,
  dedupeStudentAnswerWriteRecords,
} from "../src/lib/scores/import-safety.ts";

type PreviewRow = {
  status: "ready" | "overwrite" | "resolve" | "invalid";
  matchedStudent: { examNumber: string } | null;
  issues: string[];
};

function testDuplicateResolvedRowsBecomeInvalid() {
  const rows = applyDuplicateResolvedStudentIssues<PreviewRow>([
    {
      status: "ready" as const,
      matchedStudent: { examNumber: "1001" },
      issues: [],
    },
    {
      status: "overwrite" as const,
      matchedStudent: { examNumber: "1001" },
      issues: [],
    },
    {
      status: "ready" as const,
      matchedStudent: { examNumber: "1002" },
      issues: [],
    },
  ]);

  assert.equal(rows[0]?.status, "invalid");
  assert.equal(rows[1]?.status, "invalid");
  assert.ok(rows[0]?.issues.includes(DUPLICATE_RESOLVED_STUDENT_MESSAGE));
  assert.ok(rows[1]?.issues.includes(DUPLICATE_RESOLVED_STUDENT_MESSAGE));
  assert.equal(rows[2]?.status, "ready");
}

function testScoreWriteDedupKeepsLastValue() {
  const rows = dedupeScoreWriteRecords([
    {
      examNumber: "1001",
      sessionId: 7,
      rawScore: 80,
      oxScore: 5,
      finalScore: 85,
      attendType: AttendType.NORMAL,
      sourceType: ScoreSource.ONLINE_UPLOAD,
      note: "first",
    },
    {
      examNumber: "1001",
      sessionId: 7,
      rawScore: 82,
      oxScore: 6,
      finalScore: 88,
      attendType: AttendType.LIVE,
      sourceType: ScoreSource.OFFLINE_UPLOAD,
      note: "last",
    },
    {
      examNumber: "1002",
      sessionId: 7,
      rawScore: 70,
      oxScore: 4,
      finalScore: 74,
      attendType: AttendType.NORMAL,
      sourceType: ScoreSource.PASTE_INPUT,
      note: null,
    },
  ]);

  assert.equal(rows.length, 2);
  const target = rows.find((row) => row.examNumber === "1001" && row.sessionId === 7);
  assert.ok(target);
  assert.equal(target.rawScore, 82);
  assert.equal(target.finalScore, 88);
  assert.equal(target.note, "last");
  assert.equal(target.attendType, AttendType.LIVE);
}

function testStudentAnswerDedupKeepsLastValue() {
  const rows = dedupeStudentAnswerWriteRecords([
    {
      examNumber: "1001",
      questionId: 31,
      answer: "A",
      isCorrect: false,
    },
    {
      examNumber: "1001",
      questionId: 31,
      answer: "B",
      isCorrect: true,
    },
    {
      examNumber: "1001",
      questionId: 32,
      answer: "C",
      isCorrect: false,
    },
  ]);

  assert.equal(rows.length, 2);
  const target = rows.find((row) => row.examNumber === "1001" && row.questionId === 31);
  assert.ok(target);
  assert.equal(target.answer, "B");
  assert.equal(target.isCorrect, true);
}

function main() {
  testDuplicateResolvedRowsBecomeInvalid();
  testScoreWriteDedupKeepsLastValue();
  testStudentAnswerDedupKeepsLastValue();
  console.log("verify-score-import-safety: ok");
}

main();