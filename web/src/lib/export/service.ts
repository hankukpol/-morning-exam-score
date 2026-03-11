import { ExamType } from "@/generated/prisma";
import { ATTEND_TYPE_LABEL, EXAM_TYPE_LABEL, SCORE_SOURCE_LABEL, STUDENT_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate, formatFileDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { NON_PLACEHOLDER_STUDENT_FILTER } from "@/lib/students/placeholder";

export type StudentExportFilters = {
  examType?: ExamType;
  activeOnly?: boolean;
  generation?: number;
};

export type ScoreExportFilters = {
  periodId?: number;
  examType?: ExamType;
};

export async function getStudentExportRows(filters: StudentExportFilters) {
  const students = await getPrisma().student.findMany({
    where: {
      AND: [
        NON_PLACEHOLDER_STUDENT_FILTER,
        {
          examType: filters.examType,
          isActive: filters.activeOnly === false ? undefined : true,
          generation: filters.generation,
        },
    ],
    },
    orderBy: [{ examType: "asc" }, { generation: "desc" }, { examNumber: "asc" }],
    select: {
      examNumber: true,
      name: true,
      phone: true,
      generation: true,
      className: true,
      examType: true,
      studentType: true,
      onlineId: true,
      registeredAt: true,
      isActive: true,
      note: true,
    },
  });

  return {
    fileName: `수강생명단_${formatFileDate()}`,
    sheetName: "Students",
    rows: students.map((student) => ({
      examNumber: student.examNumber,
      name: student.name,
      phone: student.phone ?? "",
      generation: student.generation ?? "",
      className: student.className ?? "",
      examType: EXAM_TYPE_LABEL[student.examType],
      studentType: STUDENT_TYPE_LABEL[student.studentType],
      onlineId: student.onlineId ?? "",
      registeredAt: student.registeredAt ? formatDate(student.registeredAt) : "",
      isActive: student.isActive ? "활성" : "비활성",
      note: student.note ?? "",
    })),
  };
}

export async function getScoreExportRows(filters: ScoreExportFilters) {
  const scores = await getPrisma().score.findMany({
    where: {
      student: {
        examType: filters.examType,
      },
      session: {
        periodId: filters.periodId,
      },
    },
    select: {
      examNumber: true,
      rawScore: true,
      oxScore: true,
      finalScore: true,
      attendType: true,
      sourceType: true,
      note: true,
      student: {
        select: {
          name: true,
          onlineId: true,
        },
      },
      session: {
        select: {
          examDate: true,
          examType: true,
          week: true,
          subject: true,
          period: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: [
      { session: { examDate: "asc" } },
      { session: { examType: "asc" } },
      { examNumber: "asc" },
    ],
  });

  return {
    fileName: `성적raw_${formatFileDate()}`,
    sheetName: "Scores",
    rows: scores.map((score) => ({
      periodName: score.session.period.name,
      examDate: formatDate(score.session.examDate),
      examType: EXAM_TYPE_LABEL[score.session.examType],
      week: `${score.session.week}주차`,
      subject: SUBJECT_LABEL[score.session.subject],
      examNumber: score.examNumber,
      studentName: score.student.name,
      onlineId: score.student.onlineId ?? "",
      attendType: ATTEND_TYPE_LABEL[score.attendType],
      sourceType: SCORE_SOURCE_LABEL[score.sourceType],
      rawScore: score.rawScore ?? "",
      oxScore: score.oxScore ?? "",
      finalScore: score.finalScore ?? "",
      note: score.note ?? "",
    })),
  };
}
