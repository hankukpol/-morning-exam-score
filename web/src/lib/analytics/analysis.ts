import { Prisma } from "@/generated/prisma";
import {
  AttendType,
  ExamType,
  StudentStatus,
  StudentType,
  Subject,
} from "@/generated/prisma";
import { EXAM_TYPE_SUBJECTS } from "@/lib/constants";
import { getPrisma } from "@/lib/prisma";
import {
  countsAsAttendance,
  getCombinedAverage,
  getScoredMockScore,
} from "@/lib/scores/calculation";

export type SubjectTargetScores = Partial<Record<Subject, number>>;

type ScoreLike = {
  examNumber: string;
  rawScore: number | null;
  oxScore?: number | null;
  finalScore: number | null;
  attendType: AttendType;
};

type ScoreWithStudent = ScoreLike & {
  student: {
    name: string;
  };
};

function scoredMockScoreValue(
  score: Pick<ScoreLike, "rawScore" | "oxScore" | "finalScore" | "attendType">,
) {
  return getScoredMockScore(score);
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
    .map(scoredMockScoreValue)
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

function formatTrendDateLabel(date: Date) {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function startOfTomorrow() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

function isMissingWeeklyStatusSnapshotError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
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
    const value = scoredMockScoreValue(score);

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
  const tomorrow = startOfTomorrow();

  if (start >= tomorrow) {
    return [];
  }

  const boundedEnd = end < tomorrow ? end : tomorrow;
  const search = input.search?.trim();

  const sessions = await getPrisma().examSession.findMany({
    where: {
      periodId: input.periodId,
      examType: input.examType,
      isCancelled: false,
      examDate: {
        gte: start,
        lt: boundedEnd,
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
    const participantCount = values.length;
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
        searchedScore && scoredMockScoreValue(searchedScore) !== null
          ? {
              examNumber: searchedScore.examNumber,
              name: searchedScore.student.name,
              score: scoredMockScoreValue(searchedScore),
              rank: percentileRank(values, scoredMockScoreValue(searchedScore) ?? 0),
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
  const tomorrow = startOfTomorrow();
  const boundedEnd = end < tomorrow ? end : tomorrow;
  const search = input.examNumber.trim();
  const student = await getPrisma().student.findFirst({
    where: {
      examType: input.examType,
      OR: [
        { examNumber: search },
        { name: search },
      ],
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
        lt: boundedEnd,
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
      .map(scoredMockScoreValue)
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
      countsAsAttendance(score.attendType),
  ).length;
  const studentMonthScores = monthScores.filter((score) => score.examNumber === student.examNumber);
  const monthlyMockAverage = average(
    studentMonthScores
      .map(scoredMockScoreValue)
      .filter((value): value is number => value !== null),
  );
  const monthlyPoliceOxAverage = average(
    studentMonthScores
      .filter(
        (score) =>
          score.session.subject === Subject.POLICE_SCIENCE &&
          score.attendType === AttendType.NORMAL &&
          score.oxScore !== null,
      )
      .map((score) => score.oxScore as number),
  );

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
      monthlyAverage: getCombinedAverage(
        monthlyMockAverage,
        monthlyPoliceOxAverage,
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

  const search = input.examNumber?.trim();
  const tomorrow = startOfTomorrow();
  let resolvedExamNumber = search;

  if (search && !/^\d/.test(search)) {
    const found = await getPrisma().student.findFirst({
      where: { examType: input.examType, name: search },
      select: { examNumber: true },
    });
    resolvedExamNumber = found?.examNumber ?? search;
  }

  const sessions = await getPrisma().examSession.findMany({
    where: {
      periodId: input.periodId,
      examType: input.examType,
      subject: input.subject,
      isCancelled: false,
      examDate: {
        lt: tomorrow,
      },
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
      resolvedExamNumber
        ? session.scores.find((score) => score.examNumber === resolvedExamNumber) ?? null
        : null;

    return {
      sessionId: session.id,
      examDate: session.examDate,
      week: session.week,
      subject: session.subject,
      participantCount: values.length,
      averageScore: average(values),
      top10Average: topAverage(values, 0.1),
      top30Average: topAverage(values, 0.3),
      highestScore: values.length > 0 ? Math.max(...values) : null,
      studentScore: studentScore ? scoredMockScoreValue(studentScore) : null,
      studentName: studentScore?.student.name ?? null,
    };
  });
}

export type SubjectStudentRankingRow = {
  examNumber: string;
  name: string;
  studentType: StudentType;
  isActive: boolean;
  sessionCount: number;
  totalSessions: number;
  attendanceRate: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  rank: number | null;
};

export async function getSubjectStudentRanking(input: {
  periodId?: number;
  examType: ExamType;
  subject?: Subject;
}): Promise<SubjectStudentRankingRow[]> {
  if (!input.subject) {
    return [];
  }

  const sessions = await getPrisma().examSession.findMany({
    where: {
      periodId: input.periodId,
      examType: input.examType,
      subject: input.subject,
      isCancelled: false,
      examDate: {
        lt: startOfTomorrow(),
      },
    },
    include: {
      scores: {
        include: {
          student: {
            select: {
              name: true,
              studentType: true,
              isActive: true,
            },
          },
        },
      },
    },
    orderBy: { examDate: "asc" },
  });

  const totalSessions = sessions.length;

  const studentMap = new Map<string, {
    examNumber: string;
    name: string;
    studentType: StudentType;
    isActive: boolean;
    scores: number[];
    sessionCount: number;
  }>();

  for (const session of sessions) {
    for (const score of session.scores) {
      if (score.attendType !== AttendType.NORMAL && score.attendType !== AttendType.LIVE) {
        continue;
      }
      const value = scoredMockScoreValue(score);
      if (value === null) {
        continue;
      }
      const existing = studentMap.get(score.examNumber) ?? {
        examNumber: score.examNumber,
        name: score.student.name,
        studentType: score.student.studentType,
        isActive: score.student.isActive,
        scores: [],
        sessionCount: 0,
      };
      existing.scores.push(value);
      existing.sessionCount++;
      studentMap.set(score.examNumber, existing);
    }
  }

  const sorted = Array.from(studentMap.values())
    .map((s) => ({
      examNumber: s.examNumber,
      name: s.name,
      studentType: s.studentType,
      isActive: s.isActive,
      sessionCount: s.sessionCount,
      totalSessions,
      attendanceRate:
        totalSessions === 0 ? 0 : Math.round((s.sessionCount / totalSessions) * 1000) / 10,
      average: average(s.scores),
      highest: s.scores.length > 0 ? Math.max(...s.scores) : null,
      lowest: s.scores.length > 0 ? Math.min(...s.scores) : null,
    }))
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1));

  let rank = 1;
  return sorted.map((row, index) => {
    if (index > 0 && row.average !== sorted[index - 1].average) {
      rank = index + 1;
    }
    return { ...row, rank: row.average !== null ? rank : null };
  });
}

export type CumulativeAnalysisData = {
  student: {
    examNumber: string;
    name: string;
    className: string | null;
    generation: number | null;
    examType: ExamType;
    currentStatus: StudentStatus;
    isActive: boolean;
    targetScores: SubjectTargetScores;
  };
  periods: Array<{
    id: number;
    name: string;
    avg: number | null;
    sessionCount: number;
    attendedCount: number;
  }>;
  trend: Array<{
    date: string;
    label: string;
    subject: Subject;
    finalScore: number | null;
    attendType: string | null;
    periodName: string;
    periodId: number;
    week: number;
  }>;
  subjectStats: Array<{
    subject: Subject;
    avg: number | null;
    target: number | null;
    sessionCount: number;
    scoredCount: number;
    highest: number | null;
    lowest: number | null;
    trend: "up" | "down" | "flat";
    isWeak: boolean;
  }>;
  weakSubjects: Subject[];
  statusHistory: Array<{
    weekKey: string;
    weekStartDate: string;
    status: StudentStatus;
  }>;
  totalSessions: number;
  attendedCount: number;
  overallAvg: number | null;
  attendanceRate: number;
  bestPeriod: { id: number; name: string; avg: number | null } | null;
};

export async function getStudentCumulativeAnalysis(
  examNumber: string,
): Promise<CumulativeAnalysisData | null> {
  const prisma = getPrisma();
  const tomorrow = startOfTomorrow();

  const student = await prisma.student.findUnique({ where: { examNumber } });
  if (!student) return null;

  const relevantPeriods = await prisma.examPeriod.findMany({
    where: {
      OR: [
        {
          enrollments: {
            some: {
              examNumber,
            },
          },
        },
        {
          sessions: {
            some: {
              examType: student.examType,
              scores: {
                some: {
                  examNumber,
                },
              },
            },
          },
        },
        {
          sessions: {
            some: {
              examType: student.examType,
              absenceNotes: {
                some: {
                  examNumber,
                },
              },
            },
          },
        },
        {
          weeklyStatusSnapshots: {
            some: {
              examNumber,
              examType: student.examType,
            },
          },
        },
      ],
    },
    orderBy: { startDate: "asc" },
  });
  const relevantPeriodIds = relevantPeriods.map((period) => period.id);

  const sessions = relevantPeriodIds.length
    ? await prisma.examSession.findMany({
        where: {
          periodId: { in: relevantPeriodIds },
          examType: student.examType,
          isCancelled: false,
          examDate: {
            lt: tomorrow,
          },
        },
        include: {
          period: true,
          scores: { where: { examNumber } },
        },
        orderBy: [{ examDate: "asc" }, { week: "asc" }],
      })
    : [];

  type SnapRow = { weekKey: string; weekStartDate: Date; status: StudentStatus };
  let rawSnapshots: SnapRow[] = [];
  if (relevantPeriodIds.length > 0) {
    try {
      rawSnapshots = await prisma.weeklyStatusSnapshot.findMany({
        where: {
          examNumber,
          examType: student.examType,
          periodId: { in: relevantPeriodIds },
        },
        orderBy: [{ weekStartDate: "asc" }, { weekKey: "asc" }],
      });
    } catch (error) {
      if (!isMissingWeeklyStatusSnapshotError(error)) {
        throw error;
      }
    }
  }

  const targets = parseTargetScores(student.targetScores);

  const trend = sessions.map((session) => {
    const score = session.scores[0] ?? null;
    return {
      date: session.examDate.toISOString(),
      label: formatTrendDateLabel(session.examDate),
      subject: session.subject,
      finalScore: score ? (scoredMockScoreValue(score) ?? null) : null,
      attendType: score?.attendType ?? null,
      periodName: session.period.name,
      periodId: session.periodId,
      week: session.week,
    };
  });

  const periodMap = new Map<
    number,
    {
      id: number;
      name: string;
      startDate: Date;
      mockScores: number[];
      policeOxScores: number[];
      sessionCount: number;
      attendedCount: number;
    }
  >();
  for (const session of sessions) {
    const score = session.scores[0] ?? null;
    const existing = periodMap.get(session.periodId) ?? {
      id: session.periodId,
      name: session.period.name,
      startDate: session.period.startDate,
      mockScores: [],
      policeOxScores: [],
      sessionCount: 0,
      attendedCount: 0,
    };
    existing.sessionCount++;
    if (score) {
      if (score.attendType === AttendType.NORMAL) {
        const value = scoredMockScoreValue(score);
        if (value !== null) {
          existing.mockScores.push(value);
          if (session.subject === Subject.POLICE_SCIENCE && score.oxScore !== null) {
            existing.policeOxScores.push(score.oxScore);
          }
          existing.attendedCount++;
        }
      } else if (countsAsAttendance(score.attendType)) {
        existing.attendedCount++;
      }
    }
    periodMap.set(session.periodId, existing);
  }
  const periods = Array.from(periodMap.values())
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .map((p) => ({
      id: p.id,
      name: p.name,
      avg: getCombinedAverage(average(p.mockScores), average(p.policeOxScores)),
      sessionCount: p.sessionCount,
      attendedCount: p.attendedCount,
    }));

  const subjectScoreListMap = new Map<Subject, number[]>();
  for (const session of sessions) {
    const score = session.scores[0];
    if (!score || score.attendType !== AttendType.NORMAL) continue;
    const value = scoredMockScoreValue(score);
    if (value === null) continue;
    const list = subjectScoreListMap.get(session.subject) ?? [];
    list.push(value);
    subjectScoreListMap.set(session.subject, list);
  }

  const allSubjects = Array.from(
    new Set([...EXAM_TYPE_SUBJECTS[student.examType], ...Array.from(subjectScoreListMap.keys())]),
  );

  const subjectSessionCounts = new Map<Subject, number>();
  for (const session of sessions) {
    subjectSessionCounts.set(session.subject, (subjectSessionCounts.get(session.subject) ?? 0) + 1);
  }

  const subjectStats = allSubjects.map((subject) => {
    const scores = subjectScoreListMap.get(subject) ?? [];
    const avg = average(scores);
    const target = targets[subject] ?? null;
    let trendDir: "up" | "down" | "flat" = "flat";
    if (scores.length >= 4) {
      const mid = Math.floor(scores.length / 2);
      const delta = (average(scores.slice(mid)) ?? 0) - (average(scores.slice(0, mid)) ?? 0);
      if (delta >= 3) trendDir = "up";
      else if (delta <= -3) trendDir = "down";
    }
    return {
      subject,
      avg,
      target,
      sessionCount: subjectSessionCounts.get(subject) ?? 0,
      scoredCount: scores.length,
      highest: scores.length > 0 ? Math.max(...scores) : null,
      lowest: scores.length > 0 ? Math.min(...scores) : null,
      trend: trendDir,
      isWeak: avg !== null && target !== null && avg < target,
    };
  });

  const allScoreValues = sessions.flatMap((session) => {
    const score = session.scores[0];
    if (!score || score.attendType !== AttendType.NORMAL) return [];
    const value = scoredMockScoreValue(score);
    return value !== null ? [value] : [];
  });
  const allPoliceOxValues = sessions.flatMap((session) => {
    const score = session.scores[0];
    if (
      !score ||
      score.attendType !== AttendType.NORMAL ||
      session.subject !== Subject.POLICE_SCIENCE ||
      score.oxScore === null
    ) {
      return [];
    }
    return [score.oxScore];
  });

  const attendedCount = sessions.filter((session) => {
    const score = session.scores[0];
    return score && countsAsAttendance(score.attendType);
  }).length;

  const bestPeriod = periods.reduce<{ id: number; name: string; avg: number | null } | null>(
    (best, p) => {
      if (p.avg === null) return best;
      if (!best || p.avg > (best.avg ?? -1)) return { id: p.id, name: p.name, avg: p.avg };
      return best;
    },
    null,
  );

  return {
    student: {
      examNumber: student.examNumber,
      name: student.name,
      className: student.className,
      generation: student.generation,
      examType: student.examType,
      currentStatus: student.currentStatus,
      isActive: student.isActive,
      targetScores: targets,
    },
    periods,
    trend,
    subjectStats,
    weakSubjects: subjectStats.filter((s) => s.isWeak).map((s) => s.subject),
    statusHistory: rawSnapshots.map((snap) => ({
      weekKey: snap.weekKey,
      weekStartDate: snap.weekStartDate.toISOString(),
      status: snap.status,
    })),
    totalSessions: sessions.length,
    attendedCount,
    overallAvg: getCombinedAverage(average(allScoreValues), average(allPoliceOxValues)),
    attendanceRate:
      sessions.length === 0 ? 0 : Math.round((attendedCount / sessions.length) * 1000) / 10,
    bestPeriod,
  };
}

export async function getStudentDetailAnalysis(input: {
  examNumber: string;
  periodId?: number;
}) {
  const prisma = getPrisma();
  const tomorrow = startOfTomorrow();
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
        examDate: {
          lt: tomorrow,
        },
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
      .map(scoredMockScoreValue)
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
      studentScore: studentScore ? scoredMockScoreValue(studentScore) : null,
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
