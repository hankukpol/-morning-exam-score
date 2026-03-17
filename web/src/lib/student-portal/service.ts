import { ExamType, Subject } from "@prisma/client";
import {
  getDailyAnalysis,
  getMonthlyStudentAnalysis,
  getSubjectTrendAnalysis,
  parseTargetScores,
} from "@/lib/analytics/analysis";
import { EXAM_TYPE_SUBJECTS } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { requireStudent } from "@/lib/auth/require-student";

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function parseMonthKey(value?: string | null) {
  if (!value) {
    return null;
  }

  const [year, month] = value.split("-").map((item) => Number(item));

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return null;
  }

  return { year, month };
}

function monthKey(year: number, month: number) {
  return `${year}-${month}`;
}

function sortDateValues(values: string[]) {
  return [...values].sort((left, right) => right.localeCompare(left));
}

function subjectOptionsForExamType(examType: ExamType, subjects: Subject[]) {
  const preferred = EXAM_TYPE_SUBJECTS[examType];
  const subjectSet = new Set([...preferred, ...subjects]);
  return Array.from(subjectSet);
}

export async function lookupStudentPortalStudent(input: {
  examNumber: string;
  birthDate: string; // YYMMDD 형식 6자리
}) {
  if (!hasDatabaseConfig()) {
    throw new Error("학생 포털은 데이터베이스 연결 후 사용할 수 있습니다.");
  }

  const examNumber = input.examNumber.trim();
  const birthDate = input.birthDate.trim().replace(/\D/g, "");

  if (!examNumber) {
    throw new Error("수험번호를 입력해 주세요.");
  }

  if (!birthDate || birthDate.length !== 6) {
    throw new Error("생년월일 6자리를 입력해 주세요. (예: 901231)");
  }

  const student = await getPrisma().student.findUnique({
    where: {
      examNumber,
    },
    select: {
      examNumber: true,
      name: true,
      examType: true,
      isActive: true,
      birthDate: true,
    },
  });

  if (!student || !student.isActive) {
    throw new Error("수험번호 또는 생년월일이 일치하지 않습니다.");
  }

  // birthDate가 DB에 없으면 로그인 불가
  if (!student.birthDate) {
    throw new Error("수험번호 또는 생년월일이 일치하지 않습니다.");
  }

  // YYMMDD 형식으로 비교 (DB의 DateTime → YY/MM/DD 추출)
  const d = student.birthDate;
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const storedYYMMDD = `${yy}${mm}${dd}`;

  if (storedYYMMDD !== birthDate) {
    throw new Error("수험번호 또는 생년월일이 일치하지 않습니다.");
  }

  return student;
}

export async function getStudentPortalViewer() {
  if (!hasDatabaseConfig()) {
    return null;
  }

  let authenticatedStudent: Awaited<ReturnType<typeof requireStudent>>;

  try {
    authenticatedStudent = await requireStudent();
  } catch {
    return null;
  }

  const student = await getPrisma().student.findUnique({
    where: {
      examNumber: authenticatedStudent.examNumber,
    },
    select: {
      examNumber: true,
      name: true,
      examType: true,
      className: true,
      generation: true,
      currentStatus: true,
      targetScores: true,
      isActive: true,
    },
  });

  if (!student || !student.isActive) {
    return null;
  }

  return {
    ...student,
    targetScores: parseTargetScores(student.targetScores),
  };
}

export async function getStudentPortalPageData(input: {
  periodId?: number;
  date?: string;
  monthKey?: string;
  subject?: Subject;
}) {
  const student = await getStudentPortalViewer();

  if (!student) {
    return null;
  }

  const prisma = getPrisma();
  const periods = await prisma.examPeriod.findMany({
    where: {
      sessions: {
        some: {
          examType: student.examType,
          scores: {
            some: {
              examNumber: student.examNumber,
            },
          },
        },
      },
    },
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
  });

  const selectedPeriod =
    periods.find((period) => period.id === input.periodId) ??
    periods.find((period) => period.isActive) ??
    periods[0] ??
    null;

  const sessions = selectedPeriod
    ? await prisma.examSession.findMany({
        where: {
          periodId: selectedPeriod.id,
          examType: student.examType,
          isCancelled: false,
          scores: {
            some: {
              examNumber: student.examNumber,
            },
          },
        },
        orderBy: [{ examDate: "desc" }, { subject: "asc" }],
        select: {
          id: true,
          week: true,
          subject: true,
          examDate: true,
        },
      })
    : [];

  const dateOptions = sortDateValues(
    Array.from(new Set(sessions.map((session) => formatDate(session.examDate)))),
  );
  const monthOptions = Array.from(
    new Map(
      sessions.map((session) => {
        const year = session.examDate.getFullYear();
        const month = session.examDate.getMonth() + 1;
        return [monthKey(year, month), { year, month }];
      }),
    ).values(),
  ).sort((left, right) => right.year - left.year || right.month - left.month);
  const subjectOptions = subjectOptionsForExamType(
    student.examType,
    Array.from(new Set(sessions.map((session) => session.subject))),
  );

  const selectedDate = dateOptions.includes(input.date ?? "") ? input.date ?? "" : dateOptions[0] ?? "";
  const requestedMonth = parseMonthKey(input.monthKey);
  const selectedMonth =
    monthOptions.find(
      (option) =>
        option.year === requestedMonth?.year && option.month === requestedMonth?.month,
    ) ?? monthOptions[0] ?? null;
  const selectedSubject = input.subject && subjectOptions.includes(input.subject)
    ? input.subject
    : subjectOptions[0];

  const [dailyAnalysis, monthlyAnalysis, subjectAnalysis, wrongNoteBookmarks] =
    await Promise.all([
      selectedDate
        ? getDailyAnalysis({
            periodId: selectedPeriod?.id,
            examType: student.examType,
            date: selectedDate,
            search: student.examNumber,
          }).then((rows) => rows.filter((row) => row.searchedStudent))
        : Promise.resolve([]),
      selectedMonth
        ? getMonthlyStudentAnalysis({
            periodId: selectedPeriod?.id,
            examType: student.examType,
            year: selectedMonth.year,
            month: selectedMonth.month,
            examNumber: student.examNumber,
          })
        : Promise.resolve(null),
      selectedSubject
        ? getSubjectTrendAnalysis({
            periodId: selectedPeriod?.id,
            examType: student.examType,
            subject: selectedSubject,
            examNumber: student.examNumber,
          })
        : Promise.resolve([]),
      prisma.wrongNoteBookmark.findMany({
        where: {
          examNumber: student.examNumber,
        },
        select: {
          id: true,
          questionId: true,
        },
      }),
    ]);

  return {
    student,
    periods,
    selectedPeriod,
    dateOptions,
    selectedDate,
    monthOptions,
    selectedMonth,
    selectedMonthKey: selectedMonth ? monthKey(selectedMonth.year, selectedMonth.month) : "",
    subjectOptions,
    selectedSubject,
    dailyAnalysis,
    monthlyAnalysis,
    subjectAnalysis,
    wrongNoteQuestionIds: wrongNoteBookmarks.map((bookmark) => bookmark.questionId),
    wrongNoteCount: wrongNoteBookmarks.length,
  };
}

export async function listStudentWrongNotes(input: {
  examNumber: string;
  subject?: Subject;
  startDate?: string;
  endDate?: string;
}) {
  const startDate = input.startDate ? new Date(input.startDate) : null;
  const endDate = input.endDate ? new Date(input.endDate) : null;

  if (startDate && Number.isNaN(startDate.getTime())) {
    throw new Error("시작 날짜 형식을 확인해 주세요.");
  }

  if (endDate && Number.isNaN(endDate.getTime())) {
    throw new Error("종료 날짜 형식을 확인해 주세요.");
  }

  const inclusiveEndDate = endDate ? new Date(endDate) : null;

  if (inclusiveEndDate) {
    inclusiveEndDate.setDate(inclusiveEndDate.getDate() + 1);
  }

  const bookmarks = await getPrisma().wrongNoteBookmark.findMany({
    where: {
      examNumber: input.examNumber,
      question: {
        questionSession: {
          subject: input.subject,
          examDate: {
            gte: startDate ?? undefined,
            lt: inclusiveEndDate ?? undefined,
          },
        },
      },
    },
    include: {
      question: {
        include: {
          questionSession: true,
          studentAnswers: {
            where: {
              examNumber: input.examNumber,
            },
            take: 1,
          },
        },
      },
    },
    orderBy: [
      {
        question: {
          questionSession: {
            examDate: "desc",
          },
        },
      },
      {
        question: {
          questionNo: "asc",
        },
      },
    ],
  });

  return bookmarks.map((bookmark) => ({
    id: bookmark.id,
    questionId: bookmark.questionId,
    memo: bookmark.memo,
    createdAt: bookmark.createdAt,
    updatedAt: bookmark.updatedAt,
    examDate: bookmark.question.questionSession.examDate,
    subject: bookmark.question.questionSession.subject,
    sessionId: bookmark.question.questionSession.id,
    questionNo: bookmark.question.questionNo,
    correctAnswer: bookmark.question.correctAnswer,
    correctRate: bookmark.question.correctRate,
    difficulty: bookmark.question.difficulty,
    studentAnswer: bookmark.question.studentAnswers[0]?.answer ?? null,
  }));
}

export async function createStudentWrongNote(input: {
  examNumber: string;
  questionId: number;
  memo?: string | null;
}) {
  if (!Number.isInteger(input.questionId) || input.questionId <= 0) {
    throw new Error("저장할 문항 번호를 확인해 주세요.");
  }

  const studentAnswer = await getPrisma().studentAnswer.findUnique({
    where: {
      examNumber_questionId: {
        examNumber: input.examNumber,
        questionId: input.questionId,
      },
    },
  });

  if (!studentAnswer) {
    throw new Error("해당 문항의 학생 답안을 찾지 못했습니다.");
  }

  if (studentAnswer.isCorrect) {
    throw new Error("오답 문항만 노트에 저장할 수 있습니다.");
  }

  const memo = input.memo?.trim() ? input.memo.trim() : null;

  return getPrisma().wrongNoteBookmark.upsert({
    where: {
      examNumber_questionId: {
        examNumber: input.examNumber,
        questionId: input.questionId,
      },
    },
    create: {
      examNumber: input.examNumber,
      questionId: input.questionId,
      memo,
    },
    update: memo === null ? {} : { memo },
  });
}

export async function updateStudentWrongNote(input: {
  examNumber: string;
  noteId: number;
  memo?: string | null;
}) {
  const bookmark = await getPrisma().wrongNoteBookmark.findUniqueOrThrow({
    where: {
      id: input.noteId,
    },
  });

  if (bookmark.examNumber !== input.examNumber) {
    throw new Error("본인 오답 노트만 수정할 수 있습니다.");
  }

  return getPrisma().wrongNoteBookmark.update({
    where: {
      id: input.noteId,
    },
    data: {
      memo: input.memo?.trim() ? input.memo.trim() : null,
    },
  });
}

export async function deleteStudentWrongNote(input: {
  examNumber: string;
  noteId: number;
}) {
  const bookmark = await getPrisma().wrongNoteBookmark.findUniqueOrThrow({
    where: {
      id: input.noteId,
    },
  });

  if (bookmark.examNumber !== input.examNumber) {
    throw new Error("본인 오답 노트만 삭제할 수 있습니다.");
  }

  await getPrisma().wrongNoteBookmark.delete({
    where: {
      id: input.noteId,
    },
  });

  return { success: true };
}

export async function clearStudentWrongNotes(input: { examNumber: string }) {
  const result = await getPrisma().wrongNoteBookmark.deleteMany({
    where: {
      examNumber: input.examNumber,
    },
  });

  return {
    deletedCount: result.count,
  };
}


