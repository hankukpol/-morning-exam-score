import {
  AbsenceStatus,
  AttendType,
  DropoutReason,
  ExamType,
  NotificationChannel,
  PointType,
  StudentStatus,
  StudentType,
  Subject,
} from "@/generated/prisma";
import { ATTENDANCE_STATUS_RULES, EXAM_TYPE_SUBJECTS } from "@/lib/constants";
import {
  buildNotificationMessage,
  notificationTypeFromStatus,
} from "@/lib/notifications/templates";
import { getPrisma } from "@/lib/prisma";
import {
  formatTuesdayWeekLabel,
  getTuesdayWeekKey,
  getTuesdayWeekStart,
  parseTuesdayWeekKey,
} from "@/lib/analytics/week";
import {
  countsAsAttendance,
  getCombinedScore,
  getMockScore,
  getPoliceOxScore,
  getScoredMockScore,
} from "@/lib/scores/calculation";

type DatasetSession = {
  id: number;
  week: number;
  subject: Subject;
  examDate: Date;
  isCancelled: boolean;
  periodId: number;
  examType: ExamType;
};

type DatasetStudent = {
  examNumber: string;
  name: string;
  phone: string | null;
  studentType: StudentType;
  isActive: boolean;
  notificationConsent: boolean;
  currentStatus: StudentStatus;
};

type DatasetScore = {
  id: number;
  examNumber: string;
  sessionId: number;
  attendType: AttendType;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
};

type DatasetAbsence = {
  examNumber: string;
  sessionId: number;
  attendGrantsPerfectAttendance: boolean;
  status: AbsenceStatus;
};

type DatasetPointLog = {
  id: number;
  examNumber: string;
  type: PointType;
  amount: number;
  reason: string;
  periodId: number | null;
  month: number | null;
  year: number | null;
  grantedAt: Date;
  grantedBy: string | null;
  student: {
    name: string;
  };
};

type StudentEntry = {
  session: DatasetSession;
  attendType: AttendType | null;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
  displayScore: number | null;
  normalizedScore: number | null;
  isOccurred: boolean;
  grantsPerfectAttendance: boolean;
};

type StudentAggregate = {
  student: DatasetStudent;
  entries: StudentEntry[];
  weekAbsences: Map<string, number>;
  monthAbsences: Map<string, number>;
  monthPerfectAttendance: Map<string, boolean>;
  currentWeekAbsenceCount: number;
  currentMonthAbsenceCount: number;
  overallStatus: StudentStatus;
  recoveryDate: Date | null;
  weeklySnapshots: StudentWeeklySnapshot[];
};

type StudentWeeklySnapshot = {
  weekKey: string;
  weekStartDate: Date;
  weekEndDate: Date;
  weekAbsenceCount: number;
  monthAbsenceCount: number;
  status: StudentStatus;
  recoveryDate: Date | null;
  dropoutReason: DropoutReason | null;
};

export type TuesdayWeekSummary = {
  key: string;
  label: string;
  startDate: Date;
  endDate: Date;
  legacyWeeks: number[];
};

export type RankingRow = {
  examNumber: string;
  name: string;
  studentType: StudentType;
  isActive: boolean;
  currentStatus: StudentStatus;
  average: number | null;
  participationRate: number;
  overallRank: number | null;
  newRank: number | null;
  hasNormalRecord: boolean;
  perfectAttendance: boolean;
  profile: StudentResultProfile;
};

export type WeeklyResultsSheetCell = {
  sessionId: number;
  attendType: AttendType | null;
  mockScore: number | null;
  policeOxScore: number | null;
};

export type WeeklyResultsSheetRow = {
  examNumber: string;
  name: string;
  studentType: StudentType;
  isActive: boolean;
  weekStatus: StudentStatus;
  attendanceRate: number;
  mockAverage: number;
  mockRank: number | null;
  policeOxAverage: number | null;
  policeOxRank: number | null;
  cells: WeeklyResultsSheetCell[];
};

export type MonthlyResultsSheetRow = {
  examNumber: string;
  name: string;
  studentType: StudentType;
  isActive: boolean;
  mockAverage: number;
  mockRank: number | null;
  policeOxAverage: number | null;
  policeOxRank: number | null;
  combinedAverage: number;
  combinedRank: number | null;
  participationRate: number;
  note: string | null;
};

export type StudentResultSubjectSummary = {
  subject: Subject;
  sessionCount: number;
  scoredCount: number;
  normalCount: number;
  liveCount: number;
  excusedCount: number;
  absentCount: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  latestScore: number | null;
  latestExamDate: Date | null;
};

export type StudentResultRecentEntry = {
  sessionId: number;
  examDate: Date;
  week: number;
  subject: Subject;
  attendType: AttendType | null;
  score: number | null;
};

export type StudentResultProfile = {
  examNumber: string;
  name: string;
  phone: string | null;
  studentType: StudentType;
  isActive: boolean;
  currentStatus: StudentStatus;
  summary: {
    sessionCount: number;
    scoredCount: number;
    normalCount: number;
    liveCount: number;
    excusedCount: number;
    absentCount: number;
    participationRate: number;
    rankingAverage: number | null;
    bestScore: number | null;
    latestExamDate: Date | null;
    perfectAttendance: boolean;
  };
  subjects: StudentResultSubjectSummary[];
  recentEntries: StudentResultRecentEntry[];
};

export type DropoutMonitorRow = {
  examNumber: string;
  name: string;
  phone: string | null;
  studentType: StudentType;
  isActive: boolean;
  status: StudentStatus;
  recoveryDate: Date | null;
  currentWeekAbsenceCount: number;
  currentMonthAbsenceCount: number;
  weekAbsences: Record<string, number>;
  monthAbsences: Record<string, number>;
};

export type WeeklyStatusHistoryRow = {
  examNumber: string;
  name: string;
  phone: string | null;
  studentType: StudentType;
  isActive: boolean;
  status: StudentStatus;
  weekKey: string;
  weekStartDate: Date;
  weekEndDate: Date;
  weekAbsenceCount: number;
  monthAbsenceCount: number;
  recoveryDate: Date | null;
  dropoutReason: DropoutReason | null;
};

export type PointCandidate = {
  examNumber: string;
  name: string;
  studentType: StudentType;
  perfectAttendance: boolean;
  currentStatus: StudentStatus;
  totalPoints: number;
  alreadyGranted: boolean;
  monthSessionCount: number;
};

export type AttendanceCalendarDay = {
  sessionId: number;
  date: Date;
  subject: Subject;
  isCancelled: boolean;
  weekKey: string;
  weekLabel: string;
  normalCount: number;
  liveCount: number;
  absentCount: number;
  warningCount: number;
  dropoutCount: number;
};

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonthFirstDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function isBeforeDate(left: Date, right: Date) {
  return left.getTime() < right.getTime();
}

function endOfToday() {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return now;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function percentage(numerator: number, denominator: number) {
  if (denominator === 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 1000) / 10;
}

function assignRank(rows: Array<{ examNumber: string; average: number | null }>) {
  const ranked = rows
    .filter((row) => row.average !== null)
    .sort((left, right) => (right.average ?? 0) - (left.average ?? 0));
  const result = new Map<string, number>();
  let previousScore: number | null = null;
  let previousRank = 0;

  for (let index = 0; index < ranked.length; index += 1) {
    const row = ranked[index];
    const rank = previousScore === row.average ? previousRank : index + 1;
    result.set(row.examNumber, rank);
    previousScore = row.average;
    previousRank = rank;
  }

  return result;
}

function buildTuesdayWeekSummary(weekKey: string, sessions: DatasetSession[]): TuesdayWeekSummary {
  const baseDate = sessions[0]?.examDate ?? parseTuesdayWeekKey(weekKey) ?? new Date();
  const startDate = getTuesdayWeekStart(baseDate);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);

  return {
    key: weekKey,
    label: formatTuesdayWeekLabel(weekKey),
    startDate,
    endDate,
    legacyWeeks: Array.from(new Set(sessions.map((session) => session.week))).sort(
      (left, right) => left - right,
    ),
  };
}

async function loadDataset(periodId: number, examType: ExamType, examNumbers?: string[]) {
  const prisma = getPrisma();
  const period = await prisma.examPeriod.findUniqueOrThrow({
    where: { id: periodId },
  });
  const studentFilter = examNumbers?.length
    ? {
        examType,
        examNumber: {
          in: examNumbers,
        },
      }
    : {
        examType,
        OR: [
          {
            enrollments: {
              some: {
                periodId,
              },
            },
          },
          {
            scores: {
              some: {
                session: {
                  periodId,
                  examType,
                },
              },
            },
          },
          {
            absenceNotes: {
              some: {
                session: {
                  periodId,
                  examType,
                },
              },
            },
          },
          {
            pointLogs: {
              some: {
                periodId,
              },
            },
          },
        ],
      };
  const scoreStudentFilter = examNumbers?.length
    ? {
        in: examNumbers,
      }
    : undefined;

  const [sessions, students, scores, absenceNotes, pointLogs] = await Promise.all([
    prisma.examSession.findMany({
      where: {
        periodId,
        examType,
      },
      orderBy: [{ examDate: "asc" }, { week: "asc" }],
    }),
    prisma.student.findMany({
      where: studentFilter,
      orderBy: [{ isActive: "desc" }, { examNumber: "asc" }],
      select: {
        examNumber: true,
        name: true,
        phone: true,
        studentType: true,
        isActive: true,
        notificationConsent: true,
        currentStatus: true,
      },
    }),
    prisma.score.findMany({
      where: {
        session: {
          periodId,
          examType,
        },
        student: {
          examType,
          ...(scoreStudentFilter ? { examNumber: scoreStudentFilter } : {}),
        },
      },
      select: {
        id: true,
        examNumber: true,
        sessionId: true,
        attendType: true,
        rawScore: true,
        oxScore: true,
        finalScore: true,
      },
    }),
    prisma.absenceNote.findMany({
      where: {
        session: {
          periodId,
          examType,
        },
        student: {
          examType,
          ...(scoreStudentFilter ? { examNumber: scoreStudentFilter } : {}),
        },
      },
      select: {
        examNumber: true,
        sessionId: true,
        attendGrantsPerfectAttendance: true,
        status: true,
      },
    }),
    prisma.pointLog.findMany({
      where: {
        periodId,
        student: {
          examType,
          ...(scoreStudentFilter ? { examNumber: scoreStudentFilter } : {}),
        },
      },
      select: {
        id: true,
        examNumber: true,
        type: true,
        amount: true,
        reason: true,
        periodId: true,
        month: true,
        year: true,
        grantedAt: true,
        grantedBy: true,
        student: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        grantedAt: "desc",
      },
    }),
  ]);

  return {
    period,
    sessions: sessions as DatasetSession[],
    students: students as DatasetStudent[],
    scores: scores as DatasetScore[],
    absenceNotes: absenceNotes as DatasetAbsence[],
    pointLogs: pointLogs as DatasetPointLog[],
  };
}

function buildAggregates(dataset: Awaited<ReturnType<typeof loadDataset>>) {
  const scoreMap = new Map<string, DatasetScore>();
  const absenceMap = new Map<string, DatasetAbsence>();
  const today = endOfToday();
  const occurredSessions = dataset.sessions.filter(
    (session) => !session.isCancelled && session.examDate <= today,
  );
  const latestOccurredSession = occurredSessions.at(-1) ?? null;
  const currentWeekKey = latestOccurredSession
    ? getTuesdayWeekKey(latestOccurredSession.examDate)
    : null;
  const currentMonthKey = latestOccurredSession ? monthKey(latestOccurredSession.examDate) : null;
  const occurredWeekSessions = new Map<string, DatasetSession[]>();

  for (const session of occurredSessions) {
    const weekKey = getTuesdayWeekKey(session.examDate);
    const current = occurredWeekSessions.get(weekKey) ?? [];
    current.push(session);
    occurredWeekSessions.set(weekKey, current);
  }

  for (const score of dataset.scores) {
    scoreMap.set(`${score.examNumber}:${score.sessionId}`, score);
  }

  for (const absence of dataset.absenceNotes) {
    absenceMap.set(`${absence.examNumber}:${absence.sessionId}`, absence);
  }

  return dataset.students.map((student) => {
    const entries: StudentEntry[] = dataset.sessions.map((session) => {
      const key = `${student.examNumber}:${session.id}`;
      const score = scoreMap.get(key) ?? null;
      const absence = absenceMap.get(key) ?? null;
      const approvedAbsence = absence?.status === AbsenceStatus.APPROVED;
      const isOccurred = !session.isCancelled && session.examDate <= today;
      const inferredAbsent = isOccurred && !score && !approvedAbsence;
      const attendType =
        score?.attendType ??
        (approvedAbsence ? AttendType.EXCUSED : inferredAbsent ? AttendType.ABSENT : null);

      return {
        session,
        attendType,
        rawScore: score?.rawScore ?? null,
        oxScore: score?.oxScore ?? null,
        finalScore: score?.finalScore ?? null,
        displayScore: score ? getCombinedScore(score) : null,
        normalizedScore:
          score && attendType === AttendType.NORMAL
            ? getScoredMockScore({
                rawScore: score.rawScore,
                oxScore: score.oxScore,
                finalScore: score.finalScore,
                attendType,
              })
            : null,
        isOccurred,
        grantsPerfectAttendance: approvedAbsence
          ? Boolean(absence?.attendGrantsPerfectAttendance)
          : false,
      };
    });

    const weekAbsences = new Map<string, number>();
    const monthAbsences = new Map<string, number>();
    const monthPerfectAttendance = new Map<string, boolean>();

    for (const entry of entries) {
      if (!entry.isOccurred || entry.session.isCancelled) {
        continue;
      }

      const currentMonthKey = monthKey(entry.session.examDate);
      const currentWeekKey = getTuesdayWeekKey(entry.session.examDate);
      const wasAbsent = entry.attendType === AttendType.ABSENT;
      const breaksPerfectAttendance =
        entry.attendType === AttendType.EXCUSED && !entry.grantsPerfectAttendance;

      if (!monthPerfectAttendance.has(currentMonthKey)) {
        monthPerfectAttendance.set(currentMonthKey, true);
      }

      if (wasAbsent) {
        const nextWeekAbsenceCount = (weekAbsences.get(currentWeekKey) ?? 0) + 1;
        const nextMonthAbsenceCount = (monthAbsences.get(currentMonthKey) ?? 0) + 1;

        weekAbsences.set(currentWeekKey, nextWeekAbsenceCount);
        monthAbsences.set(currentMonthKey, nextMonthAbsenceCount);
      }

      if (wasAbsent || breaksPerfectAttendance) {
        monthPerfectAttendance.set(currentMonthKey, false);
      }
    }

    const currentWeekAbsenceCount = currentWeekKey ? (weekAbsences.get(currentWeekKey) ?? 0) : 0;
    const currentMonthAbsenceCount = currentMonthKey ? (monthAbsences.get(currentMonthKey) ?? 0) : 0;
    const occurredEntries = entries.filter((entry) => entry.isOccurred && !entry.session.isCancelled);
    let activeDropoutUntil: Date | null = null;
    let activeDropoutReason: DropoutReason | null = null;
    const weeklySnapshots = Array.from(occurredWeekSessions.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([weekKey, sessions]) => {
        const week = buildTuesdayWeekSummary(weekKey, sessions);
        const entriesThroughWeek = occurredEntries.filter(
          (entry) => entry.session.examDate.getTime() <= week.endDate.getTime(),
        );
        const entriesForWeek = entriesThroughWeek.filter(
          (entry) => getTuesdayWeekKey(entry.session.examDate) === weekKey,
        );
        const latestWeekEntry = entriesForWeek.at(-1) ?? null;
        const snapshotMonthKey = latestWeekEntry
          ? monthKey(latestWeekEntry.session.examDate)
          : monthKey(week.endDate);
        const weekAbsenceCount = entriesForWeek.filter(
          (entry) => entry.attendType === AttendType.ABSENT,
        ).length;
        const monthAbsenceCount = entriesThroughWeek.filter(
          (entry) =>
            entry.attendType === AttendType.ABSENT &&
            monthKey(entry.session.examDate) === snapshotMonthKey,
        ).length;

        if (
          activeDropoutUntil &&
          week.startDate.getTime() >= activeDropoutUntil.getTime()
        ) {
          activeDropoutUntil = null;
          activeDropoutReason = null;
        }

        let status: StudentStatus = StudentStatus.NORMAL;
        let snapshotRecoveryDate: Date | null = null;
        let dropoutReason: DropoutReason | null = null;

        if (activeDropoutUntil) {
          status = StudentStatus.DROPOUT;
          snapshotRecoveryDate = activeDropoutUntil;
          dropoutReason = activeDropoutReason;
        } else if (
          weekAbsenceCount >= ATTENDANCE_STATUS_RULES.weeklyDropoutAbsences ||
          monthAbsenceCount >= ATTENDANCE_STATUS_RULES.monthlyDropoutAbsences
        ) {
          status = StudentStatus.DROPOUT;
          snapshotRecoveryDate = nextMonthFirstDay(latestWeekEntry?.session.examDate ?? week.endDate);
          dropoutReason =
            weekAbsenceCount >= ATTENDANCE_STATUS_RULES.weeklyDropoutAbsences
              ? DropoutReason.WEEKLY_3
              : DropoutReason.MONTHLY_8;
          activeDropoutUntil = snapshotRecoveryDate;
          activeDropoutReason = dropoutReason;
        } else if (weekAbsenceCount === ATTENDANCE_STATUS_RULES.weeklyWarning2Absences) {
          status = StudentStatus.WARNING_2;
        } else if (weekAbsenceCount === ATTENDANCE_STATUS_RULES.weeklyWarning1Absences) {
          status = StudentStatus.WARNING_1;
        }

        return {
          weekKey,
          weekStartDate: week.startDate,
          weekEndDate: week.endDate,
          weekAbsenceCount,
          monthAbsenceCount,
          status,
          recoveryDate: snapshotRecoveryDate,
          dropoutReason,
        } satisfies StudentWeeklySnapshot;
      });

    if (activeDropoutUntil && !isBeforeDate(today, activeDropoutUntil)) {
      activeDropoutUntil = null;
      activeDropoutReason = null;
    }

    let overallStatus: StudentStatus = StudentStatus.NORMAL;
    let recoveryDate: Date | null = null;

    if (activeDropoutUntil) {
      overallStatus = StudentStatus.DROPOUT;
      recoveryDate = activeDropoutUntil;
    } else if (
      currentWeekAbsenceCount >= ATTENDANCE_STATUS_RULES.weeklyDropoutAbsences ||
      currentMonthAbsenceCount >= ATTENDANCE_STATUS_RULES.monthlyDropoutAbsences
    ) {
      overallStatus = StudentStatus.DROPOUT;
      recoveryDate = latestOccurredSession ? nextMonthFirstDay(latestOccurredSession.examDate) : null;
    } else if (currentWeekAbsenceCount === ATTENDANCE_STATUS_RULES.weeklyWarning2Absences) {
      overallStatus = StudentStatus.WARNING_2;
    } else if (currentWeekAbsenceCount === ATTENDANCE_STATUS_RULES.weeklyWarning1Absences) {
      overallStatus = StudentStatus.WARNING_1;
    }

    return {
      student,
      entries,
      weekAbsences,
      monthAbsences,
      monthPerfectAttendance,
      currentWeekAbsenceCount,
      currentMonthAbsenceCount,
      overallStatus,
      recoveryDate,
      weeklySnapshots,
    } satisfies StudentAggregate;
  });
}

function buildRankingRows(
  aggregates: StudentAggregate[],
  sessions: DatasetSession[],
  examType: ExamType,
  view: "overall" | "new",
) {
  const occurredSessions = sessions.filter(
    (session) => !session.isCancelled && session.examDate <= endOfToday(),
  );
  const occurredSessionIds = new Set(occurredSessions.map((session) => session.id));

  const rows: RankingRow[] = aggregates.map((aggregate) => {
    const scopedEntries = aggregate.entries.filter((entry) => occurredSessionIds.has(entry.session.id));
    const normalScores = scopedEntries
      .filter((entry) => entry.attendType === AttendType.NORMAL && entry.normalizedScore !== null)
      .map((entry) => entry.normalizedScore as number);
    const absentCount = scopedEntries.filter((entry) => entry.attendType === AttendType.ABSENT).length;
    const activeEntryCount = scopedEntries.filter(
      (entry) => countsAsAttendance(entry.attendType),
    ).length;
    const scopedMonthKeys = Array.from(
      new Set(scopedEntries.map((entry) => monthKey(entry.session.examDate))),
    );

    return {
      examNumber: aggregate.student.examNumber,
      name: aggregate.student.name,
      studentType: aggregate.student.studentType,
      isActive: aggregate.student.isActive,
      currentStatus: aggregate.overallStatus,
      average: average(normalScores),
      participationRate: percentage(occurredSessions.length - absentCount, occurredSessions.length),
      overallRank: null,
      newRank: null,
      hasNormalRecord: normalScores.length > 0,
      perfectAttendance:
        scopedMonthKeys.length > 0 &&
        scopedMonthKeys.every((key) => aggregate.monthPerfectAttendance.get(key) ?? false) &&
        activeEntryCount > 0,
      profile: buildStudentResultProfile(
        aggregate,
        scopedEntries,
        examType,
        average(normalScores),
        percentage(occurredSessions.length - absentCount, occurredSessions.length),
        scopedMonthKeys.length > 0 &&
          scopedMonthKeys.every((key) => aggregate.monthPerfectAttendance.get(key) ?? false) &&
          activeEntryCount > 0,
      ),
    };
  });

  const activeRows = rows.filter((row) => row.isActive && row.hasNormalRecord);
  const overallRank = assignRank(activeRows);
  const newRank = assignRank(activeRows.filter((row) => row.studentType === StudentType.NEW));

  for (const row of rows) {
    row.overallRank = overallRank.get(row.examNumber) ?? null;
    row.newRank = newRank.get(row.examNumber) ?? null;
  }

  const filteredRows =
    view === "new" ? rows.filter((row) => row.studentType === StudentType.NEW) : rows;

  return filteredRows.sort((left, right) => {
    const leftRank =
      view === "new"
        ? left.newRank ?? Number.MAX_SAFE_INTEGER
        : left.overallRank ?? Number.MAX_SAFE_INTEGER;
    const rightRank =
      view === "new"
        ? right.newRank ?? Number.MAX_SAFE_INTEGER
        : right.overallRank ?? Number.MAX_SAFE_INTEGER;

    return leftRank - rightRank || left.examNumber.localeCompare(right.examNumber);
  });
}

function buildWeeklyResultsSheetRows(
  aggregates: StudentAggregate[],
  sessions: DatasetSession[],
  weekKey: string,
  view: "overall" | "new",
) {
  const occurredSessions = sessions.filter(
    (session) => !session.isCancelled && session.examDate <= endOfToday(),
  );
  const occurredSessionIds = new Set(occurredSessions.map((session) => session.id));
  const policeSessions = occurredSessions.filter((session) => session.subject === Subject.POLICE_SCIENCE);

  const rows: WeeklyResultsSheetRow[] = aggregates.map((aggregate) => {
    const scopedEntries = aggregate.entries
      .filter((entry) => occurredSessionIds.has(entry.session.id))
      .sort(
        (left, right) =>
          left.session.examDate.getTime() - right.session.examDate.getTime() ||
          left.session.id - right.session.id,
      );
    const weekSnapshot =
      aggregate.weeklySnapshots.find((snapshot) => snapshot.weekKey === weekKey) ?? null;
    const attendanceCount = scopedEntries.filter(
      (entry) => countsAsAttendance(entry.attendType),
    ).length;

    const mockScores = scopedEntries.map((entry) => {
      if (entry.attendType !== AttendType.NORMAL) {
        return 0;
      }

      return getMockScore(entry) ?? 0;
    });
    const policeOxScores = policeSessions.map((session) => {
      const entry = scopedEntries.find((candidate) => candidate.session.id === session.id) ?? null;

      if (!entry || entry.attendType !== AttendType.NORMAL) {
        return 0;
      }

      return getPoliceOxScore(entry) ?? 0;
    });

    return {
      examNumber: aggregate.student.examNumber,
      name: aggregate.student.name,
      studentType: aggregate.student.studentType,
      isActive: aggregate.student.isActive,
      weekStatus: weekSnapshot?.status ?? StudentStatus.NORMAL,
      attendanceRate: percentage(attendanceCount, occurredSessions.length),
      mockAverage: occurredSessions.length === 0 ? 0 : Math.round((mockScores.reduce((sum, value) => sum + value, 0) / occurredSessions.length) * 100) / 100,
      policeOxAverage:
        policeSessions.length === 0
          ? null
          : Math.round((policeOxScores.reduce((sum, value) => sum + value, 0) / policeSessions.length) * 100) / 100,
      mockRank: null,
      policeOxRank: null,
      cells: occurredSessions.map((session) => {
        const entry = scopedEntries.find((candidate) => candidate.session.id === session.id) ?? null;

        return {
          sessionId: session.id,
          attendType: entry?.attendType ?? null,
          mockScore: entry ? getMockScore(entry) : null,
          policeOxScore: session.subject === Subject.POLICE_SCIENCE && entry ? getPoliceOxScore(entry) : null,
        } satisfies WeeklyResultsSheetCell;
      }),
    } satisfies WeeklyResultsSheetRow;
  });

  const activeRows = rows.filter((row) => row.isActive);
  const filteredRows =
    view === "new" ? rows.filter((row) => row.studentType === StudentType.NEW) : rows;
  const mockRank = assignRank(
    activeRows.map((row) => ({ examNumber: row.examNumber, average: row.mockAverage })),
  );
  const policeOxRank = assignRank(
    activeRows
      .filter((row) => row.policeOxAverage !== null)
      .map((row) => ({ examNumber: row.examNumber, average: row.policeOxAverage })),
  );

  for (const row of rows) {
    row.mockRank = mockRank.get(row.examNumber) ?? null;
    row.policeOxRank = policeOxRank.get(row.examNumber) ?? null;
  }

  return filteredRows.sort((left, right) => {
    const leftRank = left.mockRank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.mockRank ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.examNumber.localeCompare(right.examNumber);
  });
}

function buildMonthlyResultsSheetRows(
  aggregates: StudentAggregate[],
  sessions: DatasetSession[],
  view: "overall" | "new",
) {
  const occurredSessions = sessions.filter(
    (session) => !session.isCancelled && session.examDate <= endOfToday(),
  );
  const occurredSessionIds = new Set(occurredSessions.map((session) => session.id));
  const policeSessions = occurredSessions.filter((session) => session.subject === Subject.POLICE_SCIENCE);

  const rows: MonthlyResultsSheetRow[] = aggregates.map((aggregate) => {
    const scopedEntries = aggregate.entries.filter((entry) => occurredSessionIds.has(entry.session.id));
    const attendanceCount = scopedEntries.filter(
      (entry) => countsAsAttendance(entry.attendType),
    ).length;
    const mockScores = scopedEntries.map((entry) => {
      if (entry.attendType !== AttendType.NORMAL) {
        return 0;
      }

      return getMockScore(entry) ?? 0;
    });
    const policeOxScores = policeSessions.map((session) => {
      const entry = scopedEntries.find((candidate) => candidate.session.id === session.id) ?? null;

      if (!entry || entry.attendType !== AttendType.NORMAL) {
        return 0;
      }

      return getPoliceOxScore(entry) ?? 0;
    });
    const mockAverage =
      occurredSessions.length === 0
        ? 0
        : Math.round((mockScores.reduce((sum, value) => sum + value, 0) / occurredSessions.length) * 100) / 100;
    const policeOxAverage =
      policeSessions.length === 0
        ? null
        : Math.round((policeOxScores.reduce((sum, value) => sum + value, 0) / policeSessions.length) * 100) / 100;
    const combinedScores = scopedEntries.map((entry) => {
      if (entry.attendType !== AttendType.NORMAL) {
        return 0;
      }

      return getCombinedScore(entry) ?? 0;
    });
    const combinedAverage =
      occurredSessions.length === 0
        ? 0
        : Math.round((combinedScores.reduce((sum, value) => sum + value, 0) / occurredSessions.length) * 100) / 100;

    return {
      examNumber: aggregate.student.examNumber,
      name: aggregate.student.name,
      studentType: aggregate.student.studentType,
      isActive: aggregate.student.isActive,
      mockAverage,
      mockRank: null,
      policeOxAverage,
      policeOxRank: null,
      combinedAverage,
      combinedRank: null,
      participationRate: percentage(attendanceCount, occurredSessions.length),
      note:
        occurredSessions.length > 0 &&
        occurredSessions.every((session) => {
          const entry = scopedEntries.find((e) => e.session.id === session.id);
          return entry !== undefined && entry.attendType !== AttendType.ABSENT;
        })
          ? "개근"
          : null,
    } satisfies MonthlyResultsSheetRow;
  });

  const activeRows = rows.filter((row) => row.isActive);
  const filteredRows =
    view === "new" ? rows.filter((row) => row.studentType === StudentType.NEW) : rows;
  const mockRank = assignRank(
    activeRows.map((row) => ({ examNumber: row.examNumber, average: row.mockAverage })),
  );
  const policeOxRank = assignRank(
    activeRows
      .filter((row) => row.policeOxAverage !== null)
      .map((row) => ({ examNumber: row.examNumber, average: row.policeOxAverage })),
  );
  const combinedRank = assignRank(
    activeRows.map((row) => ({ examNumber: row.examNumber, average: row.combinedAverage })),
  );

  for (const row of rows) {
    row.mockRank = mockRank.get(row.examNumber) ?? null;
    row.policeOxRank = policeOxRank.get(row.examNumber) ?? null;
    row.combinedRank = combinedRank.get(row.examNumber) ?? null;
  }

  return filteredRows.sort((left, right) => {
    const leftRank = left.combinedRank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.combinedRank ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.examNumber.localeCompare(right.examNumber);
  });
}

function buildIntegratedResultsSheetRows(
  aggregates: StudentAggregate[],
  sessions: DatasetSession[],
  view: "overall" | "new",
) {
  const occurredSessions = sessions.filter(
    (session) => !session.isCancelled && session.examDate <= endOfToday(),
  );
  const occurredSessionIds = new Set(occurredSessions.map((session) => session.id));
  const policeSessions = occurredSessions.filter((session) => session.subject === Subject.POLICE_SCIENCE);

  const rows: MonthlyResultsSheetRow[] = aggregates.map((aggregate) => {
    const scopedEntries = aggregate.entries.filter((entry) => occurredSessionIds.has(entry.session.id));
    const attendanceCount = scopedEntries.filter(
      (entry) => countsAsAttendance(entry.attendType),
    ).length;
    const mockScores = scopedEntries.map((entry) => {
      if (entry.attendType !== AttendType.NORMAL) {
        return 0;
      }

      return getMockScore(entry) ?? 0;
    });
    const policeOxScores = policeSessions.map((session) => {
      const entry = scopedEntries.find((candidate) => candidate.session.id === session.id) ?? null;

      if (!entry || entry.attendType !== AttendType.NORMAL) {
        return 0;
      }

      return getPoliceOxScore(entry) ?? 0;
    });
    const mockAverage =
      occurredSessions.length === 0
        ? 0
        : Math.round((mockScores.reduce((sum, value) => sum + value, 0) / occurredSessions.length) * 100) / 100;
    const policeOxAverage =
      policeSessions.length === 0
        ? null
        : Math.round((policeOxScores.reduce((sum, value) => sum + value, 0) / policeSessions.length) * 100) / 100;
    const combinedScores = scopedEntries.map((entry) => {
      if (entry.attendType !== AttendType.NORMAL) {
        return 0;
      }

      return getCombinedScore(entry) ?? 0;
    });
    const combinedAverage =
      occurredSessions.length === 0
        ? 0
        : Math.round((combinedScores.reduce((sum, value) => sum + value, 0) / occurredSessions.length) * 100) / 100;

    return {
      examNumber: aggregate.student.examNumber,
      name: aggregate.student.name,
      studentType: aggregate.student.studentType,
      isActive: aggregate.student.isActive,
      mockAverage,
      mockRank: null,
      policeOxAverage,
      policeOxRank: null,
      combinedAverage,
      combinedRank: null,
      participationRate: percentage(attendanceCount, occurredSessions.length),
      note: null,
    } satisfies MonthlyResultsSheetRow;
  });

  const activeRows = rows.filter((row) => row.isActive);
  const filteredRows =
    view === "new" ? rows.filter((row) => row.studentType === StudentType.NEW) : rows;
  const mockRank = assignRank(
    activeRows.map((row) => ({ examNumber: row.examNumber, average: row.mockAverage })),
  );
  const policeOxRank = assignRank(
    activeRows
      .filter((row) => row.policeOxAverage !== null)
      .map((row) => ({ examNumber: row.examNumber, average: row.policeOxAverage })),
  );
  const combinedRank = assignRank(
    activeRows.map((row) => ({ examNumber: row.examNumber, average: row.combinedAverage })),
  );

  for (const row of rows) {
    row.mockRank = mockRank.get(row.examNumber) ?? null;
    row.policeOxRank = policeOxRank.get(row.examNumber) ?? null;
    row.combinedRank = combinedRank.get(row.examNumber) ?? null;
  }

  return filteredRows.sort((left, right) => {
    const leftRank = left.combinedRank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.combinedRank ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.examNumber.localeCompare(right.examNumber);
  });
}

function buildStudentResultProfile(
  aggregate: StudentAggregate,
  scopedEntries: StudentEntry[],
  examType: ExamType,
  rankingAverage: number | null,
  participationRate: number,
  perfectAttendance: boolean,
): StudentResultProfile {
  const subjects = EXAM_TYPE_SUBJECTS[examType].filter((subject) =>
    scopedEntries.some((entry) => entry.session.subject === subject),
  );
  const extraSubjects = Array.from(
    new Set(scopedEntries.map((entry) => entry.session.subject).filter((subject) => !subjects.includes(subject))),
  );
  const subjectOrder = [...subjects, ...extraSubjects];
  const scoredEntries = scopedEntries.filter(
    (entry) =>
      (entry.attendType === AttendType.NORMAL || entry.attendType === AttendType.LIVE) &&
      entry.normalizedScore !== null,
  );
  const latestEntry = [...scopedEntries]
    .sort((left, right) => right.session.examDate.getTime() - left.session.examDate.getTime())[0] ?? null;

  return {
    examNumber: aggregate.student.examNumber,
    name: aggregate.student.name,
    phone: aggregate.student.phone,
    studentType: aggregate.student.studentType,
    isActive: aggregate.student.isActive,
    currentStatus: aggregate.overallStatus,
    summary: {
      sessionCount: scopedEntries.length,
      scoredCount: scoredEntries.length,
      normalCount: scopedEntries.filter((entry) => entry.attendType === AttendType.NORMAL).length,
      liveCount: scopedEntries.filter((entry) => entry.attendType === AttendType.LIVE).length,
      excusedCount: scopedEntries.filter((entry) => entry.attendType === AttendType.EXCUSED).length,
      absentCount: scopedEntries.filter((entry) => entry.attendType === AttendType.ABSENT).length,
      participationRate,
      rankingAverage,
      bestScore: scoredEntries.length > 0 ? Math.max(...scoredEntries.map((entry) => entry.normalizedScore as number)) : null,
      latestExamDate: latestEntry?.session.examDate ?? null,
      perfectAttendance,
    },
    subjects: subjectOrder.map((subject) => {
      const subjectEntries = scopedEntries
        .filter((entry) => entry.session.subject === subject)
        .sort((left, right) => right.session.examDate.getTime() - left.session.examDate.getTime());
      const subjectScores = subjectEntries
        .filter(
          (entry) =>
            (entry.attendType === AttendType.NORMAL || entry.attendType === AttendType.LIVE) &&
            entry.normalizedScore !== null,
        )
        .map((entry) => entry.normalizedScore as number);
      const latestScoredEntry =
        subjectEntries.find(
          (entry) =>
            (entry.attendType === AttendType.NORMAL || entry.attendType === AttendType.LIVE) &&
            entry.normalizedScore !== null,
        ) ?? null;

      return {
        subject,
        sessionCount: subjectEntries.length,
        scoredCount: subjectScores.length,
        normalCount: subjectEntries.filter((entry) => entry.attendType === AttendType.NORMAL).length,
        liveCount: subjectEntries.filter((entry) => entry.attendType === AttendType.LIVE).length,
        excusedCount: subjectEntries.filter((entry) => entry.attendType === AttendType.EXCUSED).length,
        absentCount: subjectEntries.filter((entry) => entry.attendType === AttendType.ABSENT).length,
        average: average(subjectScores),
        highest: subjectScores.length > 0 ? Math.max(...subjectScores) : null,
        lowest: subjectScores.length > 0 ? Math.min(...subjectScores) : null,
        latestScore: latestScoredEntry?.normalizedScore ?? null,
        latestExamDate: latestScoredEntry?.session.examDate ?? null,
      } satisfies StudentResultSubjectSummary;
    }),
    recentEntries: [...scopedEntries]
      .sort((left, right) => right.session.examDate.getTime() - left.session.examDate.getTime())
      .slice(0, 8)
      .map((entry) => ({
        sessionId: entry.session.id,
        examDate: entry.session.examDate,
        week: entry.session.week,
        subject: entry.session.subject,
        attendType: entry.attendType,
        score: entry.normalizedScore,
      })),
  };
}

export function getTuesdayWeekOptionsFromSessions(
  sessions: DatasetSession[],
  examType: ExamType,
): TuesdayWeekSummary[] {
  const grouped = new Map<string, DatasetSession[]>();

  for (const session of sessions) {
    if (session.examType !== examType) {
      continue;
    }

    const weekKey = getTuesdayWeekKey(session.examDate);
    const current = grouped.get(weekKey) ?? [];
    current.push(session);
    grouped.set(weekKey, current);
  }

  return Array.from(grouped.entries())
    .map(([weekKey, groupedSessions]) => buildTuesdayWeekSummary(weekKey, groupedSessions))
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
}

async function syncWeeklyStatusSnapshots(
  periodId: number,
  examType: ExamType,
  aggregates: StudentAggregate[],
  calculatedAt: Date,
  examNumbers?: string[],
) {
  const prisma = getPrisma();
  const snapshotRows = aggregates.flatMap((aggregate) =>
    aggregate.weeklySnapshots.map((snapshot) => ({
      periodId,
      examNumber: aggregate.student.examNumber,
      examType,
      weekKey: snapshot.weekKey,
      weekStartDate: snapshot.weekStartDate,
      weekEndDate: snapshot.weekEndDate,
      weekAbsenceCount: snapshot.weekAbsenceCount,
      monthAbsenceCount: snapshot.monthAbsenceCount,
      status: snapshot.status,
      recoveryDate: snapshot.recoveryDate,
      dropoutReason: snapshot.dropoutReason,
      calculatedAt,
    })),
  );

  await prisma.$transaction(
    async (tx) => {
      await tx.weeklyStatusSnapshot.deleteMany({
        where: {
          periodId,
          examType,
          ...(examNumbers?.length
            ? {
                examNumber: {
                  in: examNumbers,
                },
              }
            : {}),
        },
      });

      if (snapshotRows.length > 0) {
        await tx.weeklyStatusSnapshot.createMany({
          data: snapshotRows,
        });
      }
    },
    {
      maxWait: 10_000,
      timeout: 60_000,
    },
  );

  return snapshotRows.length;
}

export async function rebuildWeeklyStatusSnapshots(periodId: number, examType: ExamType) {
  const dataset = await loadDataset(periodId, examType);
  const aggregates = buildAggregates(dataset);
  const calculatedAt = new Date();

  await syncWeeklyStatusSnapshots(periodId, examType, aggregates, calculatedAt);

  return {
    period: dataset.period,
    aggregates,
  };
}

export async function recalculateStatusCache(
  periodId: number,
  examType: ExamType,
  options?: {
    examNumbers?: string[];
  },
) {
  const prisma = getPrisma();
  const targetExamNumbers = Array.from(new Set(options?.examNumbers?.filter(Boolean) ?? []));
  const dataset = await loadDataset(
    periodId,
    examType,
    targetExamNumbers.length > 0 ? targetExamNumbers : undefined,
  );
  const aggregates = buildAggregates(dataset);
  const calculatedAt = new Date();

  await syncWeeklyStatusSnapshots(
    periodId,
    examType,
    aggregates,
    calculatedAt,
    targetExamNumbers.length > 0 ? targetExamNumbers : undefined,
  );

  if (!dataset.period.isActive) {
    return aggregates;
  }

  const statusChanges = aggregates.filter(
    (aggregate) => aggregate.student.currentStatus !== aggregate.overallStatus,
  );

  if (statusChanges.length > 0) {
    await prisma.$transaction(
      statusChanges.map((aggregate) =>
        prisma.student.update({
          where: { examNumber: aggregate.student.examNumber },
          data: {
            currentStatus: aggregate.overallStatus,
            statusUpdatedAt: calculatedAt,
          },
        }),
      ),
    );
  }

  const notificationRows = aggregates
    .filter((aggregate) => {
      const previousStatus = aggregate.student.currentStatus;
      const nextStatus = aggregate.overallStatus;
      return previousStatus !== nextStatus && aggregate.student.isActive;
    })
    .flatMap((aggregate) => {
      const notificationType = notificationTypeFromStatus(aggregate.overallStatus);

      if (!notificationType) {
        return [];
      }

      const weekAbsenceCount = aggregate.currentWeekAbsenceCount;
      const monthAbsenceCount = aggregate.currentMonthAbsenceCount;
      const canQueue =
        aggregate.student.notificationConsent && Boolean(aggregate.student.phone?.trim());

      return [
        {
          examNumber: aggregate.student.examNumber,
          type: notificationType,
          channel: NotificationChannel.ALIMTALK,
          message: buildNotificationMessage({
            type: notificationType,
            studentName: aggregate.student.name,
            recoveryDate: aggregate.recoveryDate,
            weekAbsenceCount,
            monthAbsenceCount,
          }),
          status: canQueue ? "pending" : "skipped",
          sentAt: calculatedAt,
          failReason: canQueue
            ? null
            : aggregate.student.notificationConsent
              ? "전화번호가 없어 자동 발송에 실패했습니다"
              : "학생의 동의 없이 자동 발송 대상에서 제외됩니다",
        },
      ];
    });

  if (notificationRows.length > 0) {
    await prisma.notificationLog.createMany({ data: notificationRows });
  }

  return aggregates;
}

export async function getWeeklyStatusHistory(periodId: number, examType: ExamType, weekKey: string) {
  const prisma = getPrisma();
  let rows = await prisma.weeklyStatusSnapshot.findMany({
    where: {
      periodId,
      examType,
      weekKey,
    },
    include: {
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
          studentType: true,
          isActive: true,
        },
      },
    },
    orderBy: [{ status: "desc" }, { examNumber: "asc" }],
  });

  if (rows.length === 0) {
    await rebuildWeeklyStatusSnapshots(periodId, examType);
    rows = await prisma.weeklyStatusSnapshot.findMany({
      where: {
        periodId,
        examType,
        weekKey,
      },
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            phone: true,
            studentType: true,
            isActive: true,
          },
        },
      },
      orderBy: [{ status: "desc" }, { examNumber: "asc" }],
    });
  }

  const sessions = await prisma.examSession.findMany({
    where: {
      periodId,
      examType,
      isCancelled: false,
      examDate: {
        gte: parseTuesdayWeekKey(weekKey) ?? undefined,
        lte: parseTuesdayWeekKey(weekKey)
          ? buildTuesdayWeekSummary(weekKey, []).endDate
          : undefined,
      },
    },
    orderBy: [{ examDate: "asc" }, { week: "asc" }],
  });

  return {
    week: buildTuesdayWeekSummary(weekKey, sessions as DatasetSession[]),
    rows: rows.map((row) => ({
      examNumber: row.student.examNumber,
      name: row.student.name,
      phone: row.student.phone,
      studentType: row.student.studentType,
      isActive: row.student.isActive,
      status: row.status,
      weekKey: row.weekKey,
      weekStartDate: row.weekStartDate,
      weekEndDate: row.weekEndDate,
      weekAbsenceCount: row.weekAbsenceCount,
      monthAbsenceCount: row.monthAbsenceCount,
      recoveryDate: row.recoveryDate,
      dropoutReason: row.dropoutReason,
    })) satisfies WeeklyStatusHistoryRow[],
  };
}

export async function getDropoutMonitor(periodId: number, examType: ExamType) {
  const dataset = await loadDataset(periodId, examType);
  const aggregates = buildAggregates(dataset);

  return {
    period: dataset.period,
    rows: aggregates.map((aggregate) => ({
      examNumber: aggregate.student.examNumber,
      name: aggregate.student.name,
      phone: aggregate.student.phone,
      studentType: aggregate.student.studentType,
      isActive: aggregate.student.isActive,
      status: aggregate.overallStatus,
      recoveryDate: aggregate.recoveryDate,
      currentWeekAbsenceCount: aggregate.currentWeekAbsenceCount,
      currentMonthAbsenceCount: aggregate.currentMonthAbsenceCount,
      weekAbsences: Object.fromEntries(aggregate.weekAbsences),
      monthAbsences: Object.fromEntries(aggregate.monthAbsences),
    })) satisfies DropoutMonitorRow[],
  };
}

export async function getWeeklyResults(
  periodId: number,
  examType: ExamType,
  weekKey: string,
  view: "overall" | "new",
) {
  const dataset = await loadDataset(periodId, examType);
  const aggregates = buildAggregates(dataset);
  const sessions = dataset.sessions.filter((session) => getTuesdayWeekKey(session.examDate) === weekKey);

  return {
    period: dataset.period,
    week: buildTuesdayWeekSummary(weekKey, sessions),
    sessions,
    rows: buildRankingRows(aggregates, sessions, examType, view),
    sheetRows: buildWeeklyResultsSheetRows(aggregates, sessions, weekKey, view),
  };
}

export async function getMonthlyResults(
  periodId: number,
  examType: ExamType,
  fromWeekKey: string,
  toWeekKey: string,
  view: "overall" | "new",
) {
  const dataset = await loadDataset(periodId, examType);
  const aggregates = buildAggregates(dataset);
  const sessions = dataset.sessions.filter((session) => {
    const wk = getTuesdayWeekKey(session.examDate);
    return wk >= fromWeekKey && wk <= toWeekKey;
  });

  return {
    period: dataset.period,
    sessions,
    rows: buildRankingRows(aggregates, sessions, examType, view),
    sheetRows: buildMonthlyResultsSheetRows(aggregates, sessions, view),
  };
}

export async function getIntegratedResults(
  periodId: number,
  examType: ExamType,
  view: "overall" | "new",
) {
  const dataset = await loadDataset(periodId, examType);
  const aggregates = buildAggregates(dataset);

  return {
    period: dataset.period,
    rows: buildRankingRows(aggregates, dataset.sessions, examType, view),
    sheetRows: buildIntegratedResultsSheetRows(aggregates, dataset.sessions, view),
  };
}

export async function getPointManagementData(
  periodId: number,
  examType: ExamType,
  year: number,
  month: number,
) {
  const dataset = await loadDataset(periodId, examType);
  const aggregates = buildAggregates(dataset);
  const targetMonthKey = `${year}-${String(month).padStart(2, "0")}`;

  const candidates: PointCandidate[] = aggregates.map((aggregate) => {
    const monthEntries = aggregate.entries.filter(
      (entry) => monthKey(entry.session.examDate) === targetMonthKey && entry.isOccurred,
    );

    return {
      examNumber: aggregate.student.examNumber,
      name: aggregate.student.name,
      studentType: aggregate.student.studentType,
      perfectAttendance: aggregate.monthPerfectAttendance.get(targetMonthKey) ?? false,
      currentStatus: aggregate.overallStatus,
      totalPoints: dataset.pointLogs
        .filter((log) => log.examNumber === aggregate.student.examNumber)
        .reduce((sum, log) => sum + log.amount, 0),
      alreadyGranted: dataset.pointLogs.some(
        (log) =>
          log.examNumber === aggregate.student.examNumber &&
          log.type === PointType.PERFECT_ATTENDANCE &&
          log.year === year &&
          log.month === month,
      ),
      monthSessionCount: monthEntries.length,
    };
  });

  return {
    period: dataset.period,
    candidates,
    logs: dataset.pointLogs,
  };
}

export async function getAttendanceCalendar(
  periodId: number,
  examType: ExamType,
  year: number,
  month: number,
) {
  const dataset = await loadDataset(periodId, examType);
  const aggregates = buildAggregates(dataset);
  const sessions = dataset.sessions.filter(
    (session) =>
      session.examDate.getFullYear() === year && session.examDate.getMonth() + 1 === month,
  );

  const days: AttendanceCalendarDay[] = sessions.map((session) => {
    const entries = aggregates.map((aggregate) =>
      aggregate.entries.find((entry) => entry.session.id === session.id),
    );
    const weekKey = getTuesdayWeekKey(session.examDate);

    return {
      sessionId: session.id,
      date: session.examDate,
      subject: session.subject,
      isCancelled: session.isCancelled,
      weekKey,
      weekLabel: formatTuesdayWeekLabel(weekKey),
      normalCount: entries.filter((entry) => entry?.attendType === AttendType.NORMAL).length,
      liveCount: entries.filter((entry) => entry?.attendType === AttendType.LIVE).length,
      absentCount: entries.filter((entry) => entry?.attendType === AttendType.ABSENT).length,
      warningCount: aggregates.filter((aggregate) => {
        const absenceCount = aggregate.weekAbsences.get(weekKey) ?? 0;
        return absenceCount === 1 || absenceCount === 2;
      }).length,
      dropoutCount: aggregates.filter((aggregate) => {
        const weeklyDropout =
          (aggregate.weekAbsences.get(weekKey) ?? 0) >=
          ATTENDANCE_STATUS_RULES.weeklyDropoutAbsences;
        const monthlyDropout =
          (aggregate.monthAbsences.get(monthKey(session.examDate)) ?? 0) >=
          ATTENDANCE_STATUS_RULES.monthlyDropoutAbsences;
        return weeklyDropout || monthlyDropout;
      }).length,
    };
  });

  return {
    period: dataset.period,
    days,
  };
}

export async function getDashboardSummary() {
  const prisma = getPrisma();
  const activePeriod =
    (await prisma.examPeriod.findFirst({
      where: {
        isActive: true,
      },
      orderBy: {
        startDate: "desc",
      },
    })) ??
    (await prisma.examPeriod.findFirst({
      orderBy: {
        startDate: "desc",
      },
    }));

  if (!activePeriod) {
    return null;
  }

  const today = new Date();
  const todayStart = new Date(today.setHours(0, 0, 0, 0));
  const todayEnd = new Date(new Date().setHours(23, 59, 59, 999));

  const [gongchae, gyeongchae, pendingAbsenceCount, pendingNotificationCount, todaySessions, pastSessionsWithCounts] =
    await Promise.all([
      loadDataset(activePeriod.id, ExamType.GONGCHAE),
      loadDataset(activePeriod.id, ExamType.GYEONGCHAE),
      prisma.absenceNote.count({
        where: {
          session: {
            periodId: activePeriod.id,
          },
          status: AbsenceStatus.PENDING,
        },
      }),
      prisma.notificationLog.count({
        where: {
          status: {
            in: ["pending", "failed"],
          },
        },
      }),
      prisma.examSession.findMany({
        where: {
          periodId: activePeriod.id,
          examDate: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
        include: {
          _count: {
            select: {
              scores: true,
            },
          },
        },
        orderBy: {
          examDate: "asc",
        },
      }),
      prisma.examSession.findMany({
        where: {
          periodId: activePeriod.id,
          isCancelled: false,
          examDate: {
            lt: todayStart,
          },
        },
        include: {
          _count: {
            select: {
              scores: true,
            },
          },
        },
        orderBy: {
          examDate: "desc",
        },
        take: 60,
      }),
    ]);

  const combined = [...buildAggregates(gongchae), ...buildAggregates(gyeongchae)];
  const missingScoredSessions = pastSessionsWithCounts.filter(
    (session) => session._count.scores === 0,
  );

  return {
    activePeriod,
    studentCounts: {
      gongchae: gongchae.students.filter((student) => student.isActive).length,
      gyeongchae: gyeongchae.students.filter((student) => student.isActive).length,
    },
    todaySessions,
    statusCounts: {
      dropout: combined.filter((row) => row.overallStatus === StudentStatus.DROPOUT).length,
      warning2: combined.filter((row) => row.overallStatus === StudentStatus.WARNING_2).length,
      warning1: combined.filter((row) => row.overallStatus === StudentStatus.WARNING_1).length,
    },
    currentWeekLabel: formatTuesdayWeekLabel(getTuesdayWeekKey(new Date())),
    pendingAbsenceCount,
    pendingNotificationCount,
    missingScoredSessionCount: missingScoredSessions.length,
  };
}
