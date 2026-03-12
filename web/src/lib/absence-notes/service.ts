import {
  AbsenceCategory,
  AbsenceStatus,
  AttendType,
  ExamType,
  ScoreSource,
} from "@prisma/client";
import { toAuditJson } from "@/lib/audit";
import { recalculateStatusCache } from "@/lib/analytics/service";
import {
  buildAbsenceNoteSystemNote,
  getAbsenceNoteSystemNoteId,
  stripAbsenceNoteSystemNote,
} from "@/lib/absence-notes/system-note";
import { getPrisma } from "@/lib/prisma";

export type AbsenceNoteFilters = {
  periodId?: number;
  examType?: ExamType;
  status?: AbsenceStatus;
  absenceCategory?: AbsenceCategory;
  search?: string;
  submittedFrom?: string; // YYYY-MM-DD
  submittedTo?: string;   // YYYY-MM-DD
};

export type AbsenceNoteFormInput = {
  examNumber: string;
  sessionId: number;
  reason: string;
  absenceCategory: AbsenceCategory;
  attendCountsAsAttendance?: boolean;
  attendGrantsPerfectAttendance?: boolean;
  adminNote?: string | null;
};

type AbsenceAttendanceOptions = Pick<
  AbsenceNoteFormInput,
  "attendCountsAsAttendance" | "attendGrantsPerfectAttendance"
>;

function resolveAbsenceAttendanceOptions(
  absenceCategory: AbsenceCategory,
  input: AbsenceAttendanceOptions,
) {
  if (absenceCategory === AbsenceCategory.MILITARY) {
    return {
      attendCountsAsAttendance: true,
      attendGrantsPerfectAttendance: true,
    };
  }

  const attendGrantsPerfectAttendance = Boolean(input.attendGrantsPerfectAttendance);
  const attendCountsAsAttendance = Boolean(
    input.attendCountsAsAttendance || attendGrantsPerfectAttendance,
  );

  return {
    attendCountsAsAttendance,
    attendGrantsPerfectAttendance,
  };
}

function startOfToday() {
  return new Date(new Date().setHours(0, 0, 0, 0));
}

function validateAbsenceNoteInput(input: AbsenceNoteFormInput) {
  const examNumber = input.examNumber.trim();
  const reason = input.reason.trim();

  if (!examNumber) {
    throw new Error("????? ??? ???.");
  }

  if (!Number.isInteger(input.sessionId) || input.sessionId <= 0) {
    throw new Error("?? ??? ??? ???.");
  }

  if (!reason) {
    throw new Error("?? ??? ??? ???.");
  }

  return {
    ...input,
    examNumber,
    reason,
    adminNote: input.adminNote?.trim() || null,
  };
}

async function applyApprovedAbsenceNote(
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

  if (
    score &&
    (score.attendType === AttendType.NORMAL || score.attendType === AttendType.LIVE)
  ) {
    throw new Error("?? ?? ??? ?? ???? ?? ??? ??? ? ????.");
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

async function revertApprovedAbsenceNote(
  tx: Parameters<Parameters<ReturnType<typeof getPrisma>["$transaction"]>[0]>[0],
  note: {
    id: number;
    examNumber: string;
    sessionId: number;
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

  if (!score) {
    return;
  }

  const generatedByAbsenceNote = getAbsenceNoteSystemNoteId(score.note) === note.id;

  if (!generatedByAbsenceNote && score.attendType !== AttendType.EXCUSED) {
    return;
  }

  if (
    generatedByAbsenceNote &&
    score.sourceType === ScoreSource.MANUAL_INPUT &&
    score.rawScore === null &&
    score.oxScore === null &&
    score.finalScore === null
  ) {
    await tx.score.delete({
      where: {
        id: score.id,
      },
    });
    return;
  }

  await tx.score.update({
    where: {
      id: score.id,
    },
    data: {
      attendType: AttendType.ABSENT,
      note: stripAbsenceNoteSystemNote(score.note, note.id),
    },
  });
}

export async function revertAbsenceNote(input: {
  adminId: string;
  noteId: number;
  ipAddress?: string | null;
}) {
  return getPrisma().$transaction(async (tx) => {
    const note = await tx.absenceNote.findUniqueOrThrow({
      where: { id: input.noteId },
      include: { session: true },
    });

    if (note.status !== "APPROVED") {
      throw new Error("??? ???? ??? ? ????.");
    }

    await revertApprovedAbsenceNote(tx, note);

    const updated = await tx.absenceNote.update({
      where: { id: input.noteId },
      data: { status: "PENDING", adminNote: null },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "ABSENCE_NOTE_REVERT",
        targetType: "AbsenceNote",
        targetId: String(input.noteId),
        before: toAuditJson(note),
        after: toAuditJson(updated),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return updated;
  });
}

export async function listAbsenceNotes(filters: AbsenceNoteFilters) {
  const search = filters.search?.trim();

  const submittedFrom = filters.submittedFrom
    ? new Date(filters.submittedFrom + "T00:00:00")
    : undefined;
  const submittedTo = filters.submittedTo
    ? new Date(filters.submittedTo + "T23:59:59")
    : undefined;

  return getPrisma().absenceNote.findMany({
    where: {
      status: filters.status,
      absenceCategory: filters.absenceCategory,
      session: {
        periodId: filters.periodId,
        examType: filters.examType,
      },
      submittedAt:
        submittedFrom || submittedTo
          ? { gte: submittedFrom, lte: submittedTo }
          : undefined,
      OR: search
        ? [
            { examNumber: { contains: search } },
            { student: { name: { contains: search } } },
          ]
        : undefined,
    },
    include: {
      student: {
        select: {
          name: true,
          examType: true,
          currentStatus: true,
        },
      },
      session: {
        include: {
          period: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { session: { examDate: "desc" } }, { examNumber: "asc" }],
  });
}

export async function getAbsenceNoteDashboard(periodId: number, examType: ExamType) {
  const today = startOfToday();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const sessionFilter = { session: { periodId, examType } } as const;

  const [pending, approvedToday, rejected, approvedTotal, categoryGroups] = await Promise.all([
    getPrisma().absenceNote.count({ where: { status: AbsenceStatus.PENDING, ...sessionFilter } }),
    getPrisma().absenceNote.count({
      where: {
        status: AbsenceStatus.APPROVED,
        approvedAt: { gte: today, lt: tomorrow },
        ...sessionFilter,
      },
    }),
    getPrisma().absenceNote.count({ where: { status: AbsenceStatus.REJECTED, ...sessionFilter } }),
    getPrisma().absenceNote.count({ where: { status: AbsenceStatus.APPROVED, ...sessionFilter } }),
    getPrisma().absenceNote.groupBy({
      by: ["absenceCategory"],
      where: { ...sessionFilter },
      _count: { id: true },
    }),
  ]);

  const categoryBreakdown = Object.fromEntries(
    categoryGroups.map((g) => [g.absenceCategory ?? "OTHER", g._count.id]),
  ) as Partial<Record<AbsenceCategory, number>>;

  return {
    pending,
    approvedToday,
    rejected,
    approved: approvedTotal,
    total: pending + approvedTotal + rejected,
    categoryBreakdown,
  };
}

export async function createAbsenceNote(input: {
  adminId: string;
  payload: AbsenceNoteFormInput;
  ipAddress?: string | null;
}) {
  const payload = validateAbsenceNoteInput(input.payload);
  const result = await getPrisma().$transaction(async (tx) => {
    const session = await tx.examSession.findUniqueOrThrow({
      where: {
        id: payload.sessionId,
      },
    });

    const autoApprove = payload.absenceCategory === AbsenceCategory.MILITARY;
    const attendanceOptions = resolveAbsenceAttendanceOptions(payload.absenceCategory, payload);
    const note = await tx.absenceNote.create({
      data: {
        examNumber: payload.examNumber,
        sessionId: payload.sessionId,
        reason: payload.reason,
        absenceCategory: payload.absenceCategory,
        status: autoApprove ? AbsenceStatus.APPROVED : AbsenceStatus.PENDING,
        submittedAt: new Date(),
        approvedAt: autoApprove ? new Date() : null,
        ...attendanceOptions,
        adminNote: payload.adminNote,
      },
    });

    if (autoApprove) {
      await applyApprovedAbsenceNote(tx, note);
    }

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: autoApprove ? "ABSENCE_NOTE_CREATE_AUTO_APPROVE" : "ABSENCE_NOTE_CREATE",
        targetType: "AbsenceNote",
        targetId: String(note.id),
        before: toAuditJson(null),
        after: toAuditJson(note),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      note,
      session,
      autoApprove,
    };
  });

  if (result.autoApprove) {
    await recalculateStatusCache(result.session.periodId, result.session.examType, {
      examNumbers: [result.note.examNumber],
    });
  }

  return result.note;
}

export async function updateAbsenceNote(input: {
  adminId: string;
  noteId: number;
  payload: Pick<AbsenceNoteFormInput, "reason" | "absenceCategory" | "attendCountsAsAttendance" | "attendGrantsPerfectAttendance" | "adminNote">;
  ipAddress?: string | null;
}) {
  const reason = input.payload.reason.trim();

  if (!reason) {
    throw new Error("?? ??? ??? ???.");
  }

  const result = await getPrisma().$transaction(async (tx) => {
    const before = await tx.absenceNote.findUniqueOrThrow({
      where: {
        id: input.noteId,
      },
      include: {
        session: true,
      },
    });

    if (before.status === AbsenceStatus.APPROVED) {
      throw new Error("??? ???? ??? ? ????. ?? ??? ???.");
    }

    const autoApprove = input.payload.absenceCategory === AbsenceCategory.MILITARY;
    const attendanceOptions = resolveAbsenceAttendanceOptions(
      input.payload.absenceCategory,
      input.payload,
    );
    const note = await tx.absenceNote.update({
      where: {
        id: input.noteId,
      },
      data: {
        reason,
        absenceCategory: input.payload.absenceCategory,
        adminNote: input.payload.adminNote?.trim() || null,
        status: autoApprove ? AbsenceStatus.APPROVED : before.status,
        approvedAt: autoApprove ? new Date() : before.approvedAt,
        ...attendanceOptions,
      },
    });

    if (autoApprove) {
      await applyApprovedAbsenceNote(tx, note);
    }

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: autoApprove ? "ABSENCE_NOTE_UPDATE_AUTO_APPROVE" : "ABSENCE_NOTE_UPDATE",
        targetType: "AbsenceNote",
        targetId: String(note.id),
        before: toAuditJson(before),
        after: toAuditJson(note),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      note,
      session: before.session,
      autoApprove,
    };
  });

  if (result.autoApprove) {
    await recalculateStatusCache(result.session.periodId, result.session.examType, {
      examNumbers: [result.note.examNumber],
    });
  }

  return result.note;
}

export async function reviewAbsenceNote(input: {
  adminId: string;
  noteId: number;
  action: "approve" | "reject";
  attendCountsAsAttendance?: boolean;
  attendGrantsPerfectAttendance?: boolean;
  adminNote?: string | null;
  ipAddress?: string | null;
}) {
  const result = await getPrisma().$transaction(async (tx) => {
    const before = await tx.absenceNote.findUniqueOrThrow({
      where: {
        id: input.noteId,
      },
      include: {
        session: true,
      },
    });

    if (input.action === "approve") {
      const attendanceOptions = resolveAbsenceAttendanceOptions(
        before.absenceCategory ?? AbsenceCategory.OTHER,
        {
          attendCountsAsAttendance: input.attendCountsAsAttendance ?? before.attendCountsAsAttendance,
          attendGrantsPerfectAttendance:
            input.attendGrantsPerfectAttendance ?? before.attendGrantsPerfectAttendance,
        },
      );
      const note = await tx.absenceNote.update({
        where: {
          id: input.noteId,
        },
        data: {
          status: AbsenceStatus.APPROVED,
          approvedAt: new Date(),
          ...attendanceOptions,
          adminNote: input.adminNote?.trim() || null,
        },
      });

      await applyApprovedAbsenceNote(tx, note);

      await tx.auditLog.create({
        data: {
          adminId: input.adminId,
          action: "ABSENCE_NOTE_APPROVE",
          targetType: "AbsenceNote",
          targetId: String(note.id),
          before: toAuditJson(before),
          after: toAuditJson(note),
          ipAddress: input.ipAddress ?? null,
        },
      });

      return {
        note,
        session: before.session,
        shouldRecalculate: true,
      };
    }

    const note = await tx.absenceNote.update({
      where: {
        id: input.noteId,
      },
      data: {
        status: AbsenceStatus.REJECTED,
        approvedAt: null,
        adminNote: input.adminNote?.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "ABSENCE_NOTE_REJECT",
        targetType: "AbsenceNote",
        targetId: String(note.id),
        before: toAuditJson(before),
        after: toAuditJson(note),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      note,
      session: before.session,
      shouldRecalculate: false,
    };
  });

  if (result.shouldRecalculate) {
    await recalculateStatusCache(result.session.periodId, result.session.examType, {
      examNumbers: [result.note.examNumber],
    });
  }

  return result.note;
}

/**
 * Move an absence note to a different session.
 *
 * Typical cases:
 * - A student submitted the note for the wrong exam date.
 * - An admin needs to move the note to the correct session.
 *
 * Rules:
 * 1. Reject duplicates for the same student and session.
 * 2. Revert EXCUSED first when the note was already approved.
 * 3. Reset the moved note back to PENDING for re-review.
 * 4. Recalculate warning/dropout cache when approval was active.
 */

export async function changeAbsenceNoteSession(input: {
  adminId: string;
  noteId: number;
  newSessionId: number;
  ipAddress?: string | null;
}) {
  const result = await getPrisma().$transaction(async (tx) => {
    // Load the current note with session metadata for cache recalculation.
    const before = await tx.absenceNote.findUniqueOrThrow({
      where: { id: input.noteId },
      include: { session: true },
    });

    if (before.sessionId === input.newSessionId) {
      throw new Error("?? ??? ?????.");
    }

    // Make sure the target session exists.
    await tx.examSession.findUniqueOrThrow({ where: { id: input.newSessionId } });

    // Reject duplicates for the same student and session.
    const conflict = await tx.absenceNote.findUnique({
      where: {
        examNumber_sessionId: {
          examNumber: before.examNumber,
          sessionId: input.newSessionId,
        },
      },
    });
    if (conflict) {
      throw new Error("?? ???? ?? ?? ??? ???? ????.");
    }

    // Revert the old EXCUSED entry before moving an approved note.
    const wasApproved = before.status === AbsenceStatus.APPROVED;
    if (wasApproved) {
      await revertApprovedAbsenceNote(tx, before);
    }

    // Reset approval when an approved note moves to a new session.
    const updated = await tx.absenceNote.update({
      where: { id: input.noteId },
      data: {
        sessionId: input.newSessionId,
        status: wasApproved ? AbsenceStatus.PENDING : before.status,
        approvedAt: wasApproved ? null : before.approvedAt,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "ABSENCE_NOTE_SESSION_CHANGE",
        targetType: "AbsenceNote",
        targetId: String(input.noteId),
        before: toAuditJson(before),
        after: toAuditJson(updated),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return { updated, oldSession: before.session, wasApproved };
  });

  // Recalculate warning/dropout cache for the original session when needed.
  if (result.wasApproved) {
    await recalculateStatusCache(result.oldSession.periodId, result.oldSession.examType, {
      examNumbers: [result.updated.examNumber],
    });
  }

  return result.updated;
}

/**
 * Summary of a bulk absence note creation request.
 */

export type BulkCreateAbsenceNotesResult = {
  succeeded: number;
  skipped: number;
  autoApproved: number;
  errors: { sessionId: number; message: string }[];
};

/**
 * Create absence notes for multiple sessions at once.
 *
 * Typical cases:
 * - Register the same reason across several future or past sessions.
 * - Backfill a scheduled absence across a date range.
 *
 * Rules:
 * 1. Skip existing notes quietly and count them as skipped.
 * 2. Auto-approve military absences and apply EXCUSED immediately.
 * 3. Keep per-session failures isolated with Promise.allSettled.
 * 4. Recalculate warning/dropout cache after auto-approved changes.
 */
export async function bulkCreateAbsenceNotes(input: {
  adminId: string;
  payload: {
    examNumber: string;
    sessionIds: number[];
    reason: string;
    absenceCategory: AbsenceCategory;
    attendCountsAsAttendance?: boolean;
    attendGrantsPerfectAttendance?: boolean;
    adminNote?: string | null;
  };
  ipAddress?: string | null;
}): Promise<BulkCreateAbsenceNotesResult> {
  const { payload } = input;
  const examNumber = payload.examNumber.trim();
  const reason = payload.reason.trim();

  // Required input validation.
  if (!examNumber) throw new Error("????? ??? ???.");
  if (!reason) throw new Error("?? ??? ??? ???.");
  if (!payload.sessionIds.length) throw new Error("?? ??? ??? ???.");

  // Military absences are auto-approved on creation.
  const autoApprove = payload.absenceCategory === AbsenceCategory.MILITARY;

  type SingleResult =
    | { type: "created"; periodId: number; examType: ExamType; autoApprove: boolean }
    | { type: "skipped" };

  // Process each session independently so one failure does not block the rest.
  const results = await Promise.allSettled<SingleResult>(
    payload.sessionIds.map(async (sessionId) => {
      return getPrisma().$transaction(async (tx) => {
        // Skip duplicates before hitting the unique constraint.
        const existing = await tx.absenceNote.findUnique({
          where: { examNumber_sessionId: { examNumber, sessionId } },
        });
        if (existing) return { type: "skipped" as const };

        // Load session metadata for follow-up cache recalculation.
        const session = await tx.examSession.findUniqueOrThrow({ where: { id: sessionId } });

        const attendanceOptions = resolveAbsenceAttendanceOptions(payload.absenceCategory, payload);
        const note = await tx.absenceNote.create({
          data: {
            examNumber,
            sessionId,
            reason,
            absenceCategory: payload.absenceCategory,
            status: autoApprove ? AbsenceStatus.APPROVED : AbsenceStatus.PENDING,
            submittedAt: new Date(),
            approvedAt: autoApprove ? new Date() : null,
            ...attendanceOptions,
            adminNote: payload.adminNote?.trim() || null,
          },
        });

        // Apply EXCUSED immediately for auto-approved notes.
        if (autoApprove) {
          await applyApprovedAbsenceNote(tx, note);
        }

        await tx.auditLog.create({
          data: {
            adminId: input.adminId,
            action: autoApprove ? "ABSENCE_NOTE_CREATE_AUTO_APPROVE" : "ABSENCE_NOTE_CREATE",
            targetType: "AbsenceNote",
            targetId: String(note.id),
            before: toAuditJson(null),
            after: toAuditJson(note),
            ipAddress: input.ipAddress ?? null,
          },
        });

        return { type: "created" as const, periodId: session.periodId, examType: session.examType, autoApprove };
      });
    }),
  );

  // 결과 분류
  const createdResults = results
    .filter((r): r is PromiseFulfilledResult<{ type: "created"; periodId: number; examType: ExamType; autoApprove: boolean }> =>
      r.status === "fulfilled" && r.value.type === "created",
    )
    .map((r) => r.value);

  const autoApprovedResults = createdResults.filter((r) => r.autoApprove);
  if (autoApprovedResults.length > 0) {
    const { periodId, examType } = autoApprovedResults[0];
    await recalculateStatusCache(periodId, examType, { examNumbers: [examNumber] });
  }

  return {
    succeeded: createdResults.length,
    skipped: results.filter((r) => r.status === "fulfilled" && r.value.type === "skipped").length,
    autoApproved: autoApprovedResults.length,
    errors: results
      .map((r, i) => ({ r, sessionId: payload.sessionIds[i] }))
      .filter(({ r }) => r.status === "rejected")
      .map(({ r, sessionId }) => ({
        sessionId,
        message: (r as PromiseRejectedResult).reason?.message ?? "? ? ?? ??",
      })),
  };
}

export async function deleteAbsenceNote(input: {
  adminId: string;
  noteId: number;
  ipAddress?: string | null;
}) {
  const result = await getPrisma().$transaction(async (tx) => {
    const note = await tx.absenceNote.findUniqueOrThrow({
      where: {
        id: input.noteId,
      },
      include: {
        session: true,
      },
    });

    if (note.status === AbsenceStatus.APPROVED) {
      await revertApprovedAbsenceNote(tx, note);
    }

    await tx.absenceNote.delete({
      where: {
        id: input.noteId,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "ABSENCE_NOTE_DELETE",
        targetType: "AbsenceNote",
        targetId: String(note.id),
        before: toAuditJson(note),
        after: toAuditJson(null),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      note,
      shouldRecalculate: note.status === AbsenceStatus.APPROVED,
    };
  });

  if (result.shouldRecalculate) {
    await recalculateStatusCache(result.note.session.periodId, result.note.session.examType, {
      examNumbers: [result.note.examNumber],
    });
  }

  return {
    success: true,
  };
}

