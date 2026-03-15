import {
  AbsenceCategory,
  AbsenceStatus,
  AttendType,
  ExamType,
  ScoreSource,
  StudentStatus,
  Subject,
  type Prisma,
} from "@prisma/client";
import {
  getDailyAnalysis,
  getMonthlyStudentAnalysis,
  getStudentCumulativeAnalysis,
  getSubjectTrendAnalysis,
  parseTargetScores,
} from "@/lib/analytics/analysis";
import { recalculateStatusCache } from "@/lib/analytics/service";
import { buildAbsenceNoteSystemNote } from "@/lib/absence-notes/system-note";
import { EXAM_TYPE_SUBJECTS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { countsAsConfiguredAttendance } from "@/lib/scores/calculation";

type StudentPortalProfile = {
  examNumber: string;
  name: string;
  examType: ExamType;
  className: string | null;
  generation: number | null;
  currentStatus: StudentStatus;
  targetScores: ReturnType<typeof parseTargetScores>;
  isActive: boolean;
};

type StudentPortalScoreFilters = {
  examNumber: string;
  periodId?: number;
  date?: string;
  monthKey?: string;
  subject?: Subject;
};



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

function resolveSelectedPeriod<T extends { id: number; isActive: boolean }>(
  periods: T[],
  requestedPeriodId?: number,
) {
  return (
    periods.find((period) => period.id === requestedPeriodId) ??
    periods.find((period) => period.isActive) ??
    periods[0] ??
    null
  );
}

function subjectOptionsForExamType(examType: ExamType, subjects: Subject[]) {
  const preferred = EXAM_TYPE_SUBJECTS[examType];
  const subjectSet = new Set([...preferred, ...subjects]);
  return Array.from(subjectSet);
}

function resolveStudentAbsenceAttendanceOptions(absenceCategory: AbsenceCategory) {
  if (absenceCategory === AbsenceCategory.MILITARY) {
    return {
      attendCountsAsAttendance: true,
      attendGrantsPerfectAttendance: true,
    };
  }

  return {
    attendCountsAsAttendance: false,
    attendGrantsPerfectAttendance: false,
  };
}

function startOfTomorrow() {
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

async function loadStudentPortalProfile(examNumber: string): Promise<StudentPortalProfile | null> {
  const student = await getPrisma().student.findUnique({
    where: {
      examNumber,
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

async function loadStudentPortalScorePeriods(student: StudentPortalProfile) {
  return getPrisma().examPeriod.findMany({
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
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
  });
}

async function loadStudentPortalAttendancePeriods(student: StudentPortalProfile) {
  return getPrisma().examPeriod.findMany({
    where: {
      OR: [
        {
          sessions: {
            some: {
              examType: student.examType,
              OR: [
                {
                  scores: {
                    some: {
                      examNumber: student.examNumber,
                    },
                  },
                },
                {
                  absenceNotes: {
                    some: {
                      examNumber: student.examNumber,
                    },
                  },
                },
              ],
            },
          },
        },
        {
          weeklyStatusSnapshots: {
            some: {
              examNumber: student.examNumber,
              examType: student.examType,
            },
          },
        },
      ],
    },
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
  });
}

async function loadStudentPortalAbsenceNotePeriods(student: StudentPortalProfile) {
  return getPrisma().examPeriod.findMany({
    where: {
      OR: [
        {
          enrollments: {
            some: {
              examNumber: student.examNumber,
            },
          },
        },
        {
          sessions: {
            some: {
              examType: student.examType,
              OR: [
                {
                  scores: {
                    some: {
                      examNumber: student.examNumber,
                    },
                  },
                },
                {
                  absenceNotes: {
                    some: {
                      examNumber: student.examNumber,
                    },
                  },
                },
              ],
            },
          },
        },
      ],
    },
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
  });
}

async function hasStudentPortalPeriodAccess(
  prisma: Prisma.TransactionClient | ReturnType<typeof getPrisma>,
  input: {
  examNumber: string;
  examType: ExamType;
  periodId: number;
},
) {
  const [enrollment, score, absenceNote] = await Promise.all([
    prisma.periodEnrollment.findUnique({
      where: {
        periodId_examNumber: {
          periodId: input.periodId,
          examNumber: input.examNumber,
        },
      },
      select: {
        id: true,
      },
    }),
    prisma.score.findFirst({
      where: {
        examNumber: input.examNumber,
        session: {
          periodId: input.periodId,
          examType: input.examType,
        },
      },
      select: {
        id: true,
      },
    }),
    prisma.absenceNote.findFirst({
      where: {
        examNumber: input.examNumber,
        session: {
          periodId: input.periodId,
          examType: input.examType,
        },
      },
      select: {
        id: true,
      },
    }),
  ]);

  return Boolean(enrollment || score || absenceNote);
}

async function buildStudentPortalAttendancePeriodData(
  student: StudentPortalProfile,
  requestedPeriodId?: number,
) {
  const prisma = getPrisma();
  const periods = await loadStudentPortalAttendancePeriods(student);
  const selectedPeriod = resolveSelectedPeriod(periods, requestedPeriodId);

  if (!selectedPeriod) {
    const cumulative = await getStudentCumulativeAnalysis(student.examNumber);

    return {
      student,
      periods,
      selectedPeriod: null,
      currentStatus: cumulative?.student.currentStatus ?? student.currentStatus,
      thisWeekAbsences: 0,
      thisMonthAbsences: 0,
      totalSessions: cumulative?.totalSessions ?? 0,
      attendedSessions: cumulative?.attendedCount ?? 0,
      attendanceRate: cumulative?.attendanceRate ?? 0,
      attendanceIncludedSessionIds: new Set<number>(),
      scoreBySessionId: new Map<number, {
        sessionId: number;
        attendType: AttendType;
        finalScore: number | null;
      }>(),
      approvedAbsenceBySessionId: new Map<number, {
        sessionId: number;
        status: AbsenceStatus;
        reason: string;
        absenceCategory: AbsenceCategory | null;
        attendCountsAsAttendance: boolean;
      }>(),
      sessionIds: [] as number[],
    };
  }

  const sessions = await prisma.examSession.findMany({
    where: {
      periodId: selectedPeriod.id,
      examType: student.examType,
      isCancelled: false,
      examDate: {
        lt: startOfTomorrow(),
      },
    },
    select: {
      id: true,
    },
  });

  const sessionIds = sessions.map((session) => session.id);
  const [scores, approvedAbsences, latestSnapshot] = await Promise.all([
    sessionIds.length > 0
      ? prisma.score.findMany({
          where: {
            examNumber: student.examNumber,
            sessionId: {
              in: sessionIds,
            },
          },
          select: {
            sessionId: true,
            attendType: true,
            finalScore: true,
          },
        })
      : Promise.resolve([]),
    sessionIds.length > 0
      ? prisma.absenceNote.findMany({
          where: {
            examNumber: student.examNumber,
            status: AbsenceStatus.APPROVED,
            sessionId: {
              in: sessionIds,
            },
          },
          select: {
            sessionId: true,
            status: true,
            reason: true,
            absenceCategory: true,
            attendCountsAsAttendance: true,
          },
        })
      : Promise.resolve([]),
    prisma.weeklyStatusSnapshot.findFirst({
      where: {
        periodId: selectedPeriod.id,
        examNumber: student.examNumber,
        examType: student.examType,
      },
      orderBy: [{ weekStartDate: "desc" }, { weekKey: "desc" }],
      select: {
        status: true,
        weekAbsenceCount: true,
        monthAbsenceCount: true,
      },
    }),
  ]);

  const scoreBySessionId = new Map(scores.map((score) => [score.sessionId, score]));
  const approvedAbsenceBySessionId = new Map(
    approvedAbsences.map((absence) => [absence.sessionId, absence]),
  );
  const attendanceIncludedSessionIds = new Set(
    approvedAbsences
      .filter((absence) => absence.attendCountsAsAttendance)
      .map((absence) => absence.sessionId),
  );

  const attendedSessions = sessions.filter((session) =>
    countsAsConfiguredAttendance(
      scoreBySessionId.get(session.id)?.attendType ?? AttendType.ABSENT,
      attendanceIncludedSessionIds.has(session.id),
    ),
  ).length;

  return {
    student,
    periods,
    selectedPeriod,
    currentStatus: latestSnapshot?.status ?? student.currentStatus,
    thisWeekAbsences: latestSnapshot?.weekAbsenceCount ?? 0,
    thisMonthAbsences: latestSnapshot?.monthAbsenceCount ?? 0,
    totalSessions: sessions.length,
    attendedSessions,
    attendanceRate:
      sessions.length === 0 ? 0 : Math.round((attendedSessions / sessions.length) * 1000) / 10,
    attendanceIncludedSessionIds,
    scoreBySessionId,
    approvedAbsenceBySessionId,
    sessionIds,
  };
}

async function applyApprovedStudentAbsenceNote(
  tx: Parameters<Parameters<ReturnType<typeof getPrisma>["$transaction"]>[0]>[0],
  note: {
    id: number;
    examNumber: string;
    sessionId: number;
    reason: string;
  },
) {
  const score = await tx.score.findUnique({
    where: {
      examNumber_sessionId: {
        examNumber: note.examNumber,
        sessionId: note.sessionId,
      },
    },
  });

  if (score && (score.attendType === AttendType.NORMAL || score.attendType === AttendType.LIVE)) {
    throw new Error("SESSION_ALREADY_SCORED");
  }

  const systemNote = buildAbsenceNoteSystemNote(note.id, note.reason);

  if (!score) {
    await tx.score.create({
      data: {
        examNumber: note.examNumber,
        sessionId: note.sessionId,
        rawScore: null,
        oxScore: null,
        finalScore: null,
        attendType: AttendType.EXCUSED,
        sourceType: ScoreSource.MANUAL_INPUT,
        note: systemNote,
      },
    });
    return;
  }

  await tx.score.update({
    where: {
      id: score.id,
    },
    data: {
      attendType: AttendType.EXCUSED,
      note: systemNote,
    },
  });
}

export async function getStudentPortalScoresData(input: StudentPortalScoreFilters) {
  const student = await loadStudentPortalProfile(input.examNumber);

  if (!student) {
    return null;
  }

  const prisma = getPrisma();
  const periods = await loadStudentPortalScorePeriods(student);
  const selectedPeriod = resolveSelectedPeriod(periods, input.periodId);

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

export async function getStudentPortalAttendanceSummary(input: { examNumber: string }) {
  const student = await loadStudentPortalProfile(input.examNumber);

  if (!student) {
    return null;
  }
  const summary = await buildStudentPortalAttendancePeriodData(student);

  return {
    student: summary.student,
    selectedPeriod: summary.selectedPeriod,
    currentStatus: summary.currentStatus,
    thisWeekAbsences: summary.thisWeekAbsences,
    thisMonthAbsences: summary.thisMonthAbsences,
    totalSessions: summary.totalSessions,
    attendedSessions: summary.attendedSessions,
    attendanceRate: summary.attendanceRate,
  };
}

export async function getStudentPortalScorePageData(input: {
  examNumber: string;
  periodId?: number;
}) {
  const student = await loadStudentPortalProfile(input.examNumber);

  if (!student) {
    return null;
  }

  const prisma = getPrisma();
  const periods = await loadStudentPortalScorePeriods(student);
  const selectedPeriod = resolveSelectedPeriod(periods, input.periodId);
  const scoreRows = selectedPeriod
    ? await prisma.score.findMany({
        where: {
          examNumber: student.examNumber,
          session: {
            periodId: selectedPeriod.id,
            examType: student.examType,
          },
        },
        orderBy: [{ session: { examDate: "desc" } }, { session: { subject: "asc" } }],
        select: {
          id: true,
          rawScore: true,
          oxScore: true,
          finalScore: true,
          attendType: true,
          sourceType: true,
          note: true,
          updatedAt: true,
          session: {
            select: {
              id: true,
              week: true,
              subject: true,
              examDate: true,
            },
          },
        },
      })
    : [];

  const scoredRows = scoreRows.filter((row) => row.finalScore !== null);
  const averageScore =
    scoredRows.length === 0
      ? null
      : Math.round(
          (scoredRows.reduce((sum, row) => sum + (row.finalScore ?? 0), 0) / scoredRows.length) *
            100,
        ) / 100;

  return {
    student,
    periods,
    selectedPeriod,
    scoreRows,
    summary: {
      totalRows: scoreRows.length,
      scoredRows: scoredRows.length,
      averageScore,
      latestExamDate: scoreRows[0]?.session.examDate ?? null,
    },
  };
}

export async function getStudentPortalAttendancePageData(input: {
  examNumber: string;
  periodId?: number;
}) {
  const student = await loadStudentPortalProfile(input.examNumber);

  if (!student) {
    return null;
  }

  const prisma = getPrisma();
  const summary = await buildStudentPortalAttendancePeriodData(student, input.periodId);
  const recentSessions = summary.selectedPeriod
    ? await prisma.examSession.findMany({
        where: {
          periodId: summary.selectedPeriod.id,
          examType: student.examType,
          isCancelled: false,
          examDate: {
            lt: startOfTomorrow(),
          },
        },
        orderBy: [{ examDate: "desc" }, { subject: "asc" }],
        take: 16,
        select: {
          id: true,
          week: true,
          subject: true,
          examDate: true,
        },
      })
    : [];

  return {
    student,
    periods: summary.periods,
    selectedPeriod: summary.selectedPeriod,
    summary: {
      currentStatus: summary.currentStatus,
      thisWeekAbsences: summary.thisWeekAbsences,
      thisMonthAbsences: summary.thisMonthAbsences,
      totalSessions: summary.totalSessions,
      attendedSessions: summary.attendedSessions,
      attendanceRate: summary.attendanceRate,
    },
    recentSessions: recentSessions.map((session) => {
      const score = summary.scoreBySessionId.get(session.id) ?? null;
      const approvedAbsence = summary.approvedAbsenceBySessionId.get(session.id) ?? null;

      return {
        id: session.id,
        week: session.week,
        subject: session.subject,
        examDate: session.examDate,
        attendType: score?.attendType ?? AttendType.ABSENT,
        finalScore: score && score.attendType !== AttendType.ABSENT ? score.finalScore ?? null : null,
        noteStatus: approvedAbsence?.status ?? null,
        noteReason: approvedAbsence?.reason ?? null,
        noteCategory: approvedAbsence?.absenceCategory ?? null,
        countedAsAttendance: countsAsConfiguredAttendance(
          score?.attendType ?? AttendType.ABSENT,
          summary.attendanceIncludedSessionIds.has(session.id),
        ),
      };
    }),
  };
}

export async function getStudentPortalAbsenceNotePageData(input: {
  examNumber: string;
  periodId?: number;
}) {
  const student = await loadStudentPortalProfile(input.examNumber);

  if (!student) {
    return null;
  }

  const prisma = getPrisma();
  const periods = await loadStudentPortalAbsenceNotePeriods(student);
  const selectedPeriod = resolveSelectedPeriod(periods, input.periodId);

  const [notes, sessions] = await Promise.all([
    prisma.absenceNote.findMany({
      where: {
        examNumber: student.examNumber,
        session: {
          periodId: selectedPeriod?.id,
        },
      },
      orderBy: [{ session: { examDate: "desc" } }, { createdAt: "desc" }],
      select: {
        id: true,
        sessionId: true,
        reason: true,
        absenceCategory: true,
        status: true,
        submittedAt: true,
        approvedAt: true,
        adminNote: true,
        attendCountsAsAttendance: true,
        attendGrantsPerfectAttendance: true,
        session: {
          select: {
            id: true,
            week: true,
            subject: true,
            examDate: true,
          },
        },
      },
    }),
    selectedPeriod
      ? prisma.examSession.findMany({
          where: {
            periodId: selectedPeriod.id,
            examType: student.examType,
            isCancelled: false,
            examDate: {
              lt: startOfTomorrow(),
            },
          },
          orderBy: [{ examDate: "desc" }, { subject: "asc" }],
          take: 24,
          select: {
            id: true,
            week: true,
            subject: true,
            examDate: true,
            scores: {
              where: {
                examNumber: student.examNumber,
              },
              take: 1,
              select: {
                attendType: true,
                finalScore: true,
              },
            },
            absenceNotes: {
              where: {
                examNumber: student.examNumber,
              },
              take: 1,
              select: {
                id: true,
                status: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  return {
    student,
    periods,
    selectedPeriod,
    notes,
    sessionOptions: sessions.map((session) => {
      const existingNote = session.absenceNotes[0] ?? null;
      const score = session.scores[0] ?? null;
      const canSubmit =
        !existingNote || existingNote.status === AbsenceStatus.REJECTED;

      return {
        id: session.id,
        week: session.week,
        subject: session.subject,
        examDate: session.examDate,
        existingStatus: existingNote?.status ?? null,
        canSubmit,
        attendType: score?.attendType ?? null,
        finalScore: score?.finalScore ?? null,
      };
    }),
  };
}

export async function getStudentPortalPointsPageData(input: {
  examNumber: string;
}) {
  const student = await loadStudentPortalProfile(input.examNumber);

  if (!student) {
    return null;
  }

  const prisma = getPrisma();
  const pointLogs = await prisma.pointLog.findMany({
    where: {
      examNumber: student.examNumber,
    },
    orderBy: [{ grantedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      type: true,
      amount: true,
      reason: true,
      year: true,
      month: true,
      grantedAt: true,
      period: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const now = new Date();
  const currentMonthPoints = pointLogs
    .filter(
      (log) =>
        log.grantedAt.getFullYear() === now.getFullYear() &&
        log.grantedAt.getMonth() === now.getMonth(),
    )
    .reduce((sum, log) => sum + log.amount, 0);

  return {
    student,
    pointLogs,
    summary: {
      totalPoints: pointLogs.reduce((sum, log) => sum + log.amount, 0),
      currentMonthPoints,
      historyCount: pointLogs.length,
      latestGrantedAt: pointLogs[0]?.grantedAt ?? null,
    },
  };
}

export async function createStudentAbsenceNote(input: {
  examNumber: string;
  sessionId: number;
  reason: string;
  absenceCategory: AbsenceCategory;
}) {
  const examNumber = input.examNumber.trim();
  const reason = input.reason.trim();

  if (!examNumber) {
    throw new Error("INVALID_EXAM_NUMBER");
  }

  if (!Number.isInteger(input.sessionId) || input.sessionId <= 0) {
    throw new Error("INVALID_SESSION_ID");
  }

  if (!reason) {
    throw new Error("INVALID_REASON");
  }

  const result = await getPrisma().$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: {
        examNumber,
      },
      select: {
        examNumber: true,
        examType: true,
        isActive: true,
      },
    });

    if (!student?.isActive) {
      throw new Error("STUDENT_NOT_FOUND");
    }

    const session = await tx.examSession.findUnique({
      where: {
        id: input.sessionId,
      },
      select: {
        id: true,
        periodId: true,
        examType: true,
        isCancelled: true,
      },
    });

    if (!session) {
      throw new Error("SESSION_NOT_FOUND");
    }

    if (session.examType !== student.examType) {
      throw new Error("SESSION_FORBIDDEN");
    }

    const hasPeriodAccess = await hasStudentPortalPeriodAccess(tx, {
      examNumber: student.examNumber,
      examType: student.examType,
      periodId: session.periodId,
    });

    if (!hasPeriodAccess) {
      throw new Error("SESSION_FORBIDDEN");
    }

    if (session.isCancelled) {
      throw new Error("SESSION_CANCELLED");
    }

    const existing = await tx.absenceNote.findUnique({
      where: {
        examNumber_sessionId: {
          examNumber,
          sessionId: input.sessionId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (existing && existing.status !== AbsenceStatus.REJECTED) {
      throw new Error("ABSENCE_NOTE_ALREADY_EXISTS");
    }

    const autoApprove = input.absenceCategory === AbsenceCategory.MILITARY;
    const attendanceOptions = resolveStudentAbsenceAttendanceOptions(input.absenceCategory);
    const note = existing
      ? await tx.absenceNote.update({
          where: {
            id: existing.id,
          },
          data: {
            reason,
            absenceCategory: input.absenceCategory,
            status: autoApprove ? AbsenceStatus.APPROVED : AbsenceStatus.PENDING,
            submittedAt: new Date(),
            approvedAt: autoApprove ? new Date() : null,
            adminNote: null,
            ...attendanceOptions,
          },
        })
      : await tx.absenceNote.create({
          data: {
            examNumber,
            sessionId: input.sessionId,
            reason,
            absenceCategory: input.absenceCategory,
            status: autoApprove ? AbsenceStatus.APPROVED : AbsenceStatus.PENDING,
            submittedAt: new Date(),
            approvedAt: autoApprove ? new Date() : null,
            adminNote: null,
            ...attendanceOptions,
          },
        });

    if (autoApprove) {
      await applyApprovedStudentAbsenceNote(tx, note);
    }

    return {
      note,
      autoApprove,
      session,
    };
  });

  if (result.autoApprove) {
    try {
      await recalculateStatusCache(result.session.periodId, result.session.examType, {
        examNumbers: [examNumber],
      });
    } catch (error) {
      console.error("Failed to recalculate student absence-note status cache.", error);
    }
  }

  return result.note;
}

