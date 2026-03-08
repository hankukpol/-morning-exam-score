import { Prisma } from "@/generated/prisma";
import {
  AttendType,
  ExamType,
  Subject,
} from "@/generated/prisma";
import { EXAM_TYPE_SUBJECTS } from "@/lib/constants";
import { getPrisma } from "@/lib/prisma";

export type SubjectTargetScores = Partial<Record<Subject, number>>;

type ScoreLike = {
  examNumber: string;
  rawScore: number | null;
  finalScore: number | null;
  attendType: AttendType;
};

type ScoreWithStudent = ScoreLike & {
  student: {
    name: string;
  };
};

function normalizeScoreValue(score: Pick<ScoreLike, "finalScore" | "rawScore">) {
  const value = score.finalScore ?? score.rawScore;

  if (value === null) {
    return null;
  }

  return value > 100 ? value / 2 : value;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function topAverage(values: number[], ratio: number) {
  if (values.length === 0) {
    return null;
  }

  const count = Math.max(1, Math.ceil(values.length * ratio));
  const topValues = [...values].sort((left, right) => right - left).slice(0, count);
  return average(topValues);
}

function percentileRank(values: number[], target: number) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => right - left);
  const rank = sorted.findIndex((value) => value <= target);
  return rank === -1 ? sorted.length : rank + 1;
}

function scoreValues(scores: ScoreLike[]) {
  return scores
    .filter((score) => score.attendType === AttendType.NORMAL || score.attendType === AttendType.LIVE)
    .map(normalizeScoreValue)
    .filter((value): value is number => value !== null);
}

function buildHistogram(values: number[]) {
  const bins = Array.from({ length: 21 }, (_, index) => ({
    range: `${index * 5}-${index === 20 ? 100 : index * 5 + 4}`,
    count: 0,
  }));

  for (const value of values) {
    const safeValue = Math.max(0, Math.min(100, Math.round(value)));
    const index = Math.min(Math.floor(safeValue / 5), bins.length - 1);
    bins[index].count += 1;
  }

  return bins;
}

function parseDistribution(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([key, raw]) => ({
      answer: key,
      percentage: typeof raw === "number" ? raw : Number(raw ?? 0),
    }))
    .sort((left, right) => right.percentage - left.percentage);
}

function subjectRowsForExamType(examType: ExamType, subjects: Subject[]) {
  const preferred = EXAM_TYPE_SUBJECTS[examType];
  const set = new Set([...preferred, ...subjects]);
  return Array.from(set);
}

export function parseTargetScores(value: Prisma.JsonValue | null): SubjectTargetScores {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: SubjectTargetScores = {};

  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (!Object.values(Subject).includes(key as Subject)) {
      continue;
    }

    const parsed = Number(rawValue);

    if (Number.isFinite(parsed) && parsed > 0) {
      result[key as Subject] = parsed;
    }
  }

  return result;
}

export function serializeTargetScores(value: SubjectTargetScores) {
  const entries = Object.entries(value).filter(([, score]) => Number.isFinite(score) && score! > 0);
  return Object.fromEntries(entries);
}

function buildStudentAverageMap(scores: ScoreWithStudent[]) {
  const grouped = new Map<string, number[]>();

  for (const score of scores) {
    const value = normalizeScoreValue(score);

    if (value === null) {
      continue;
    }

    const current = grouped.get(score.examNumber) ?? [];
    current.push(value);
    grouped.set(score.examNumber, current);
  }

  return new Map(
    Array.from(grouped.entries()).map(([examNumber, values]) => [examNumber, average(values) ?? 0]),
  );
}

export async function getDailyAnalysis(input: {
  periodId?: number;
  examType: ExamType;
  date?: string;
  search?: string;
}) {
  if (!input.date) {
    return [];
  }

  const start = new Date(input.date);

  if (Number.isNaN(start.getTime())) {
    return [];
  }

  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const search = input.search?.trim();

  const sessions = await getPrisma().examSession.findMany({
    where: {
      periodId: input.periodId,
      examType: input.examType,
      isCancelled: false,
      examDate: {
        gte: start,
        lt: end,
      },
    },
    include: {
      period: true,
      scores: {
        include: {
          student: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          examNumber: "asc",
        },
      },
      questions: {
        include: {
          studentAnswers: true,
        },
        orderBy: {
          questionNo: "asc",
        },
      },
    },
    orderBy: [{ examDate: "asc" }, { subject: "asc" }],
  });

  return sessions.map((session) => {
    const values = scoreValues(session.scores);
    const searchedScore =
      search
        ? session.scores.find(
            (score) =>
              score.examNumber.includes(search) || score.student.name.includes(search),
          ) ?? null
        : null;
    const participantCount = session.scores.filter(
      (score) => score.attendType === AttendType.NORMAL || score.attendType === AttendType.LIVE,
    ).length;
    const questionRows = session.questions.map((question) => {
      const distribution = parseDistribution(question.answerDistribution);
      const wrongAnswers = question.studentAnswers.filter((answer) => !answer.isCorrect);
      const wrongCounts = wrongAnswers.reduce<Record<string, number>>((accumulator, answer) => {
        accumulator[answer.answer] = (accumulator[answer.answer] ?? 0) + 1;
        return accumulator;
      }, {});
      const mostCommonWrongAnswer =
        Object.entries(wrongCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
      const searchedAnswer =
        searchedScore
          ? question.studentAnswers.find((answer) => answer.examNumber === searchedScore.examNumber)
          : null;

      return {
        questionId: question.id,
        questionNo: question.questionNo,
        correctAnswer: question.correctAnswer,
        correctRate: question.correctRate ?? 0,
        difficulty: question.difficulty ?? "-",
        mostCommonWrongAnswer,
        distribution,
        searchedStudentAnswer: searchedAnswer?.answer ?? null,
        searchedStudentCorrect: searchedAnswer?.isCorrect ?? null,
      };
    });

    return {
      sessionId: session.id,
      examDate: session.examDate,
      week: session.week,
      subject: session.subject,
      periodName: session.period.name,
      participantCount,
      averageScore: average(values),
      top10Average: topAverage(values, 0.1),
      top30Average: topAverage(values, 0.3),
      highestScore: values.length > 0 ? Math.max(...values) : null,
      histogram: buildHistogram(values),
      topWrongQuestions: [...questionRows]
        .sort((left, right) => left.correctRate - right.correctRate)
        .slice(0, 5),
      questionRows,
      searchedStudent:
        searchedScore && normalizeScoreValue(searchedScore) !== null
          ? {
              examNumber: searchedScore.examNumber,
              name: searchedScore.student.name,
              score: normalizeScoreValue(searchedScore),
              rank: percentileRank(values, normalizeScoreValue(searchedScore) ?? 0),
            }
          : null,
    };
  });
}

export async function getMonthlyStudentAnalysis(input: {
  periodId?: number;
  examType: ExamType;
  year?: number;
  month?: number;
  examNumber?: string;
}) {
  if (!input.year || !input.month || !input.examNumber) {
    return null;
  }

  const start = new Date(input.year, input.month - 1, 1);
  const end = new Date(input.year, input.month, 1);
  const student = await getPrisma().student.findUnique({
    where: {
      examNumber: input.examNumber,
    },
  });

  if (!student) {
    return null;
  }

  const sessions = await getPrisma().examSession.findMany({
    where: {
      periodId: input.periodId,
      examType: input.examType,
      examDate: {
        gte: start,
        lt: end,
      },
      isCancelled: false,
    },
    include: {
      scores: {
        include: {
          student: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      examDate: "asc",
    },
  });

  const monthScores = sessions.flatMap((session) =>
    session.scores.map((score) => ({
      ...score,
      session,
    })),
  );
  const targets = parseTargetScores(student.targetScores);
  const subjects = subjectRowsForExamType(
    input.examType,
    Array.from(new Set(sessions.map((session) => session.subject))),
  );
  const subjectSummary = subjects.map((subject) => {
    const subjectScores = monthScores.filter((score) => score.session.subject === subject);
    const studentScores = subjectScores.filter((score) => score.examNumber === student.examNumber);
    const studentValues = studentScores
      .map(normalizeScoreValue)
      .filter((value): value is number => value !== null);
    const cohortValues = scoreValues(subjectScores);
    const averageMap = buildStudentAverageMap(subjectScores);
    const averagedValues = Array.from(averageMap.values());
    const studentAverage = average(studentValues);
    const cohortAverage = average(cohortValues);
    const targetScore = targets[subject] ?? null;
    const achievementRate =
      targetScore && studentAverage !== null
        ? Math.round((studentAverage / targetScore) * 1000) / 10
        : null;
    const delta =
      studentAverage !== null && cohortAverage !== null
        ? studentAverage - cohortAverage
        : null;

    return {
      subject,
      sessionCount: subjectScores.length,
      studentAverage,
      cohortAverage,
      top10Average: topAverage(cohortValues, 0.1),
      top30Average: topAverage(cohortValues, 0.3),
      participantCount: averageMap.size,
      rank:
        studentAverage !== null ? percentileRank(averagedValues, studentAverage) : null,
      targetScore,
      achievementRate,
      status:
        delta === null ? "-" : delta >= 5 ? "우수" : delta <= -5 ? "미흡" : "보통",
    };
  });

  const attendedCount = monthScores.filter(
    (score) =>
      score.examNumber === student.examNumber &&
      (score.attendType === AttendType.NORMAL ||
        score.attendType === AttendType.LIVE ||
        score.attendType === AttendType.EXCUSED),
  ).length;

  return {
    student: {
      examNumber: student.examNumber,
      name: student.name,
      examType: student.examType,
      currentStatus: student.currentStatus,
      targetScores: targets,
    },
    summary: {
      sessionCount: sessions.length,
      attendedCount,
      attendanceRate:
        sessions.length === 0 ? 0 : Math.round((attendedCount / sessions.length) * 1000) / 10,
      monthlyAverage: average(
        monthScores
          .filter((score) => score.examNumber === student.examNumber)
          .map(normalizeScoreValue)
          .filter((value): value is number => value !== null),
      ),
    },
    subjectSummary,
    radarData: subjectSummary.map((row) => ({
      subject: row.subject,
      studentAverage: row.studentAverage ?? 0,
      cohortAverage: row.cohortAverage ?? 0,
      targetScore: row.targetScore ?? 0,
    })),
    barData: subjectSummary.map((row) => ({
      subject: row.subject,
      studentAverage: row.studentAverage ?? 0,
      cohortAverage: row.cohortAverage ?? 0,
      top10Average: row.top10Average ?? 0,
    })),
  };
}

export async function getSubjectTrendAnalysis(input: {
  periodId?: number;
  examType: ExamType;
  subject?: Subject;
  examNumber?: string;
}) {
  if (!input.subject) {
    return [];
  }

  const sessions = await getPrisma().examSession.findMany({
    where: {
      periodId: input.periodId,
      examType: input.examType,
      subject: input.subject,
      isCancelled: false,
    },
    include: {
      scores: {
        include: {
          student: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      examDate: "asc",
    },
  });

  return sessions.map((session) => {
    const values = scoreValues(session.scores);
    const studentScore =
      input.examNumber
        ? session.scores.find((score) => score.examNumber === input.examNumber) ?? null
        : null;

    return {
      sessionId: session.id,
      examDate: session.examDate,
      week: session.week,
      subject: session.subject,
      participantCount: session.scores.length,
      averageScore: average(values),
      top10Average: topAverage(values, 0.1),
      top30Average: topAverage(values, 0.3),
      highestScore: values.length > 0 ? Math.max(...values) : null,
      studentScore: studentScore ? normalizeScoreValue(studentScore) : null,
      studentName: studentScore?.student.name ?? null,
    };
  });
}

export async function getStudentDetailAnalysis(input: {
  examNumber: string;
  periodId?: number;
}) {
  const prisma = getPrisma();
  const student = await prisma.student.findUnique({
    where: {
      examNumber: input.examNumber,
    },
  });

  if (!student) {
    return null;
  }

  const availablePeriods = await prisma.examPeriod.findMany({
    where: {
      sessions: {
        some: {
          scores: {
            some: {
              examNumber: input.examNumber,
            },
          },
        },
      },
    },
    orderBy: {
      startDate: "desc",
    },
  });
  const periodId =
    input.periodId ??
    availablePeriods.find((period) => period.isActive)?.id ??
    availablePeriods[0]?.id;

  if (!periodId) {
    return {
      student,
      availablePeriods,
      selectedPeriod: null,
      subjectSummary: [],
      trendData: [],
      wrongQuestionRows: [],
      targetScores: parseTargetScores(student.targetScores),
    };
  }

  const [selectedPeriod, sessions, wrongAnswers] = await Promise.all([
    prisma.examPeriod.findUniqueOrThrow({
      where: {
        id: periodId,
      },
    }),
    prisma.examSession.findMany({
      where: {
        periodId,
        examType: student.examType,
        isCancelled: false,
      },
      include: {
        scores: {
          include: {
            student: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        examDate: "asc",
      },
    }),
    prisma.studentAnswer.findMany({
      where: {
        examNumber: input.examNumber,
        isCorrect: false,
        question: {
          questionSession: {
            periodId,
            examType: student.examType,
          },
        },
      },
      include: {
        question: {
          include: {
            questionSession: true,
          },
        },
      },
      orderBy: {
        question: {
          correctRate: "asc",
        },
      },
      take: 20,
    }),
  ]);

  const targets = parseTargetScores(student.targetScores);
  const scoreRows = sessions.flatMap((session) =>
    session.scores.map((score) => ({
      ...score,
      session,
    })),
  );
  const subjects = subjectRowsForExamType(
    student.examType,
    Array.from(new Set(sessions.map((session) => session.subject))),
  );
  const subjectSummary = subjects.map((subject) => {
    const subjectScores = scoreRows.filter((score) => score.session.subject === subject);
    const studentScores = subjectScores.filter((score) => score.examNumber === input.examNumber);
    const studentValues = studentScores
      .map(normalizeScoreValue)
      .filter((value): value is number => value !== null);
    const cohortValues = scoreValues(subjectScores);

    return {
      subject,
      studentAverage: average(studentValues),
      cohortAverage: average(cohortValues),
      top10Average: topAverage(cohortValues, 0.1),
      highestScore: cohortValues.length > 0 ? Math.max(...cohortValues) : null,
      targetScore: targets[subject] ?? null,
      sessionCount: subjectScores.length,
    };
  });

  const trendData = sessions.map((session) => {
    const studentScore =
      session.scores.find((score) => score.examNumber === input.examNumber) ?? null;
    const values = scoreValues(session.scores);

    return {
      label: `${session.examDate.getMonth() + 1}/${session.examDate.getDate()} ${session.subject}`,
      subject: session.subject,
      examDate: session.examDate,
      studentScore: studentScore ? normalizeScoreValue(studentScore) : null,
      cohortAverage: average(values),
      top10Average: topAverage(values, 0.1),
      top30Average: topAverage(values, 0.3),
      highestScore: values.length > 0 ? Math.max(...values) : null,
    };
  });

  return {
    student,
    availablePeriods,
    selectedPeriod,
    targetScores: targets,
    subjectSummary,
    radarData: subjectSummary.map((row) => ({
      subject: row.subject,
      studentAverage: row.studentAverage ?? 0,
      cohortAverage: row.cohortAverage ?? 0,
      targetScore: row.targetScore ?? 0,
    })),
    trendData,
    wrongQuestionRows: wrongAnswers.map((answer) => ({
      id: answer.id,
      subject: answer.question.questionSession.subject,
      examDate: answer.question.questionSession.examDate,
      questionNo: answer.question.questionNo,
      correctAnswer: answer.question.correctAnswer,
      answer: answer.answer,
      correctRate: answer.question.correctRate,
      difficulty: answer.question.difficulty,
    })),
  };
}
