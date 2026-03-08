import {
  AbsenceStatus,
  AttendType,
  ExamType,
  NotificationChannel,
  PointType,
  StudentStatus,
  StudentType,
  Subject,
} from "@/generated/prisma";
import {
  buildNotificationMessage,
  notificationTypeFromStatus,
} from "@/lib/notifications/templates";
import { getPrisma } from "@/lib/prisma";

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
  displayScore: number | null;
  normalizedScore: number | null;
  isOccurred: boolean;
  grantsPerfectAttendance: boolean;
  inferredAbsent: boolean;
};

type StudentAggregate = {
  student: DatasetStudent;
  entries: StudentEntry[];
  weekAbsences: Map<number, number>;
  monthAbsences: Map<string, number>;
  monthPerfectAttendance: Map<string, boolean>;
  overallStatus: StudentStatus;
  recoveryDate: Date | null;
};

export type RankingRow = {
  examNumber: string;
  name: string;
  studentType: StudentType;
  isActive: boolean;
  average: number | null;
  participationRate: number;
  overallRank: number | null;
  newRank: number | null;
  hasNormalRecord: boolean;
  perfectAttendance: boolean;
};

export type WeeklyGridCell = {
  sessionId: number;
  subject: Subject;
  display: string;
};

export type WeeklyGridRow = {
  examNumber: string;
  name: string;
  studentType: StudentType;
  weekAverage: number | null;
  absentCount: number;
  weekStatus: StudentStatus;
  cells: WeeklyGridCell[];
};

export type DropoutMonitorRow = {
  examNumber: string;
  name: string;
  studentType: StudentType;
  isActive: boolean;
  status: StudentStatus;
  recoveryDate: Date | null;
  weekAbsences: Record<string, number>;
  monthAbsences: Record<string, number>;
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

function endOfToday() {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return now;
}

function normalizeScore(score: DatasetScore | null) {
  const value = score?.finalScore ?? score?.rawScore ?? null;

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

async function loadDataset(periodId: number, examType: ExamType) {
  const prisma = getPrisma();
  const period = await prisma.examPeriod.findUniqueOrThrow({
    where: { id: periodId },
  });

  const [sessions, students, scores, absenceNotes, pointLogs] = await Promise.all([
    prisma.examSession.findMany({
      where: {
        periodId,
        examType,
      },
      orderBy: [{ examDate: "asc" }, { week: "asc" }],
    }),
    prisma.student.findMany({
      where: {
        examType,
      },
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
        },
      },
      select: {
        id: true,
        examNumber: true,
        sessionId: true,
        attendType: true,
        rawScore: true,
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
        displayScore: score?.finalScore ?? score?.rawScore ?? null,
        normalizedScore: attendType === AttendType.NORMAL ? normalizeScore(score) : null,
        isOccurred,
        grantsPerfectAttendance: approvedAbsence
          ? Boolean(absence?.attendGrantsPerfectAttendance)
          : false,
        inferredAbsent,
      };
    });

    const weekAbsences = new Map<number, number>();
    const monthAbsences = new Map<string, number>();
    const monthPerfectAttendance = new Map<string, boolean>();

    for (const entry of entries) {
      if (!entry.isOccurred || entry.session.isCancelled) {
        continue;
      }

      const key = monthKey(entry.session.examDate);
      const wasAbsent = entry.attendType === AttendType.ABSENT;
      const breaksPerfectAttendance =
        entry.attendType === AttendType.EXCUSED && !entry.grantsPerfectAttendance;

      if (!monthPerfectAttendance.has(key)) {
        monthPerfectAttendance.set(key, true);
      }

      if (wasAbsent) {
        weekAbsences.set(entry.session.week, (weekAbsences.get(entry.session.week) ?? 0) + 1);
        monthAbsences.set(key, (monthAbsences.get(key) ?? 0) + 1);
      }

      if (wasAbsent || breaksPerfectAttendance) {
        monthPerfectAttendance.set(key, false);
      }
    }

    let overallStatus: StudentStatus = StudentStatus.NORMAL;
    let recoveryDate: Date | null = null;
    let highestWarning = 0;

    for (const [week, absenceCount] of weekAbsences) {
      if (absenceCount >= 3) {
        overallStatus = StudentStatus.DROPOUT;
        const triggerSession = dataset.sessions.find((session) => session.week === week);
        recoveryDate = triggerSession ? nextMonthFirstDay(triggerSession.examDate) : null;
        break;
      }

      if (absenceCount === 2) {
        highestWarning = Math.max(highestWarning, 2);
      } else if (absenceCount === 1) {
        highestWarning = Math.max(highestWarning, 1);
      }
    }

    if (overallStatus !== StudentStatus.DROPOUT) {
      for (const [key, absenceCount] of monthAbsences) {
        if (absenceCount < 8) {
          continue;
        }

        const [year, month] = key.split("-").map(Number);
        overallStatus = StudentStatus.DROPOUT;
        recoveryDate = new Date(year, month, 1);
        break;
      }
    }

    if (overallStatus !== StudentStatus.DROPOUT && highestWarning === 2) {
      overallStatus = StudentStatus.WARNING_2;
    } else if (overallStatus !== StudentStatus.DROPOUT && highestWarning === 1) {
      overallStatus = StudentStatus.WARNING_1;
    }

    return {
      student,
      entries,
      weekAbsences,
      monthAbsences,
      monthPerfectAttendance,
      overallStatus,
      recoveryDate,
    } satisfies StudentAggregate;
  });
}

function buildRankingRows(
  aggregates: StudentAggregate[],
  sessions: DatasetSession[],
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
      (entry) => entry.attendType !== AttendType.ABSENT && entry.attendType !== null,
    ).length;
    const scopedMonthKeys = Array.from(
      new Set(scopedEntries.map((entry) => monthKey(entry.session.examDate))),
    );

    return {
      examNumber: aggregate.student.examNumber,
      name: aggregate.student.name,
      studentType: aggregate.student.studentType,
      isActive: aggregate.student.isActive,
      average: average(normalScores),
      participationRate: percentage(occurredSessions.length - absentCount, occurredSessions.length),
      overallRank: null,
      newRank: null,
      hasNormalRecord: normalScores.length > 0,
      perfectAttendance:
        scopedMonthKeys.length > 0 &&
        scopedMonthKeys.every((key) => aggregate.monthPerfectAttendance.get(key) ?? false) &&
        activeEntryCount > 0,
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

export async function recalculateStatusCache(periodId: number, examType: ExamType) {
  const prisma = getPrisma();
  const dataset = await loadDataset(periodId, examType);
  const aggregates = buildAggregates(dataset);
  const calculatedAt = new Date();

  await prisma.$transaction(async (tx) => {
    for (const aggregate of aggregates) {
      const previousStatus = aggregate.student.currentStatus;
      const nextStatus = aggregate.overallStatus;
      const notificationType =
        previousStatus === nextStatus ? null : notificationTypeFromStatus(nextStatus);

      await tx.student.update({
        where: {
          examNumber: aggregate.student.examNumber,
        },
        data: {
          currentStatus: nextStatus,
          statusUpdatedAt: calculatedAt,
        },
      });

      if (!notificationType || !aggregate.student.isActive) {
        continue;
      }

      const weekAbsenceCount = Math.max(0, ...aggregate.weekAbsences.values());
      const monthAbsenceCount = Math.max(0, ...aggregate.monthAbsences.values());
      const canQueue =
        aggregate.student.notificationConsent && Boolean(aggregate.student.phone?.trim());

      await tx.notificationLog.create({
        data: {
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
              ? "연락처가 없어 자동 발송 대기열에 추가하지 못했습니다."
              : "수신 동의 미설정으로 자동 발송 대상에서 제외되었습니다.",
        },
      });
    }
  });

  return aggregates;
}

export async function getWeeklyGrid(periodId: number, examType: ExamType, week: number) {
  const dataset = await loadDataset(periodId, examType);
  const aggregates = buildAggregates(dataset);
  const sessions = dataset.sessions.filter((session) => session.week === week);

  return {
    period: dataset.period,
    sessions,
    rows: aggregates.map((aggregate) => {
      const sessionEntries = aggregate.entries.filter((entry) => entry.session.week === week);
      const normalScores = sessionEntries
        .filter((entry) => entry.attendType === AttendType.NORMAL && entry.normalizedScore !== null)
        .map((entry) => entry.normalizedScore as number);
      const absentCount = aggregate.weekAbsences.get(week) ?? 0;
      const weekStatus =
        absentCount >= 3
          ? StudentStatus.DROPOUT
          : absentCount === 2
            ? StudentStatus.WARNING_2
            : absentCount === 1
              ? StudentStatus.WARNING_1
              : StudentStatus.NORMAL;

      const cells: WeeklyGridCell[] = sessions.map((session) => {
        const entry = sessionEntries.find((candidate) => candidate.session.id === session.id) ?? null;

        if (session.isCancelled) {
          return {
            sessionId: session.id,
            subject: session.subject,
            display: "취소",
          };
        }

        if (entry?.attendType === AttendType.LIVE) {
          return {
            sessionId: session.id,
            subject: session.subject,
            display: `${entry.displayScore ?? "-"} (LIVE)`,
          };
        }

        if (entry?.attendType === AttendType.NORMAL) {
          return {
            sessionId: session.id,
            subject: session.subject,
            display: String(entry.displayScore ?? "-"),
          };
        }

        if (entry?.attendType === AttendType.EXCUSED) {
          return {
            sessionId: session.id,
            subject: session.subject,
            display: "사유",
          };
        }

        if (entry?.attendType === AttendType.ABSENT) {
          return {
            sessionId: session.id,
            subject: session.subject,
            display: "결시",
          };
        }

        return {
          sessionId: session.id,
          subject: session.subject,
          display: "-",
        };
      });

      return {
        examNumber: aggregate.student.examNumber,
        name: aggregate.student.name,
        studentType: aggregate.student.studentType,
        weekAverage: average(normalScores),
        absentCount,
        weekStatus,
        cells,
      } satisfies WeeklyGridRow;
    }),
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
      studentType: aggregate.student.studentType,
      isActive: aggregate.student.isActive,
      status: aggregate.overallStatus,
      recoveryDate: aggregate.recoveryDate,
      weekAbsences: Object.fromEntries(aggregate.weekAbsences),
      monthAbsences: Object.fromEntries(aggregate.monthAbsences),
    })) satisfies DropoutMonitorRow[],
  };
}

export async function getWeeklyResults(
  periodId: number,
  examType: ExamType,
  week: number,
  view: "overall" | "new",
) {
  const dataset = await loadDataset(periodId, examType);
  const aggregates = buildAggregates(dataset);
  const sessions = dataset.sessions.filter((session) => session.week === week);

  return {
    period: dataset.period,
    sessions,
    rows: buildRankingRows(aggregates, sessions, view),
  };
}

export async function getMonthlyResults(
  periodId: number,
  examType: ExamType,
  year: number,
  month: number,
  view: "overall" | "new",
) {
  const dataset = await loadDataset(periodId, examType);
  const aggregates = buildAggregates(dataset);
  const sessions = dataset.sessions.filter(
    (session) =>
      session.examDate.getFullYear() === year && session.examDate.getMonth() + 1 === month,
  );

  return {
    period: dataset.period,
    sessions,
    rows: buildRankingRows(aggregates, sessions, view),
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
    rows: buildRankingRows(aggregates, dataset.sessions, view),
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

    return {
      sessionId: session.id,
      date: session.examDate,
      subject: session.subject,
      isCancelled: session.isCancelled,
      normalCount: entries.filter((entry) => entry?.attendType === AttendType.NORMAL).length,
      liveCount: entries.filter((entry) => entry?.attendType === AttendType.LIVE).length,
      absentCount: entries.filter((entry) => entry?.attendType === AttendType.ABSENT).length,
      warningCount: aggregates.filter((aggregate) => {
        const absenceCount = aggregate.weekAbsences.get(session.week) ?? 0;
        return absenceCount === 1 || absenceCount === 2;
      }).length,
      dropoutCount: aggregates.filter((aggregate) => {
        const weeklyDropout = (aggregate.weekAbsences.get(session.week) ?? 0) >= 3;
        const monthlyDropout = (aggregate.monthAbsences.get(monthKey(session.examDate)) ?? 0) >= 8;
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

  const [gongchae, gyeongchae, pendingAbsenceCount, pendingNotificationCount, todaySessions] =
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
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: new Date(new Date().setHours(23, 59, 59, 999)),
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
    ]);

  const combined = [...buildAggregates(gongchae), ...buildAggregates(gyeongchae)];

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
    pendingAbsenceCount,
    pendingNotificationCount,
  };
}
