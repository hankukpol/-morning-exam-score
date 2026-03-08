import {
  AbsenceCategory,
  AbsenceStatus,
  AttendType,
  ExamType,
  ScoreSource,
} from "@/generated/prisma";
import { toAuditJson } from "@/lib/audit";
import { recalculateStatusCache } from "@/lib/analytics/service";
import { getPrisma } from "@/lib/prisma";

export type AbsenceNoteFilters = {
  periodId?: number;
  examType?: ExamType;
  status?: AbsenceStatus;
  absenceCategory?: AbsenceCategory;
  search?: string;
};

export type AbsenceNoteFormInput = {
  examNumber: string;
  sessionId: number;
  reason: string;
  absenceCategory: AbsenceCategory;
  attendGrantsPerfectAttendance?: boolean;
  adminNote?: string | null;
};

const ABSENCE_NOTE_PREFIX = "[absence-note:";

function startOfToday() {
  return new Date(new Date().setHours(0, 0, 0, 0));
}

function buildSystemNote(noteId: number, reason: string) {
  return `${ABSENCE_NOTE_PREFIX}${noteId}] ${reason}`.trim();
}

function stripSystemNote(value: string | null, noteId: number) {
  if (!value) {
    return null;
  }

  const prefix = `${ABSENCE_NOTE_PREFIX}${noteId}]`;

  if (!value.startsWith(prefix)) {
    return value;
  }

  const next = value.slice(prefix.length).trim();
  return next || null;
}

function isSessionClosed(examDate: Date) {
  return examDate < startOfToday();
}

function validateAbsenceNoteInput(input: AbsenceNoteFormInput) {
  const examNumber = input.examNumber.trim();
  const reason = input.reason.trim();

  if (!examNumber) {
    throw new Error("수험번호를 입력하세요.");
  }

  if (!Number.isInteger(input.sessionId) || input.sessionId <= 0) {
    throw new Error("시험 회차를 선택하세요.");
  }

  if (!reason) {
    throw new Error("사유 내용을 입력하세요.");
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
    throw new Error("정상 응시 기록이 있는 회차는 사유 결시로 승인할 수 없습니다.");
  }

  const systemNote = buildSystemNote(note.id, note.reason);

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

  const noteMarker = `${ABSENCE_NOTE_PREFIX}${note.id}]`;
  const generatedByAbsenceNote = score.note?.startsWith(noteMarker) ?? false;

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
      note: stripSystemNote(score.note, note.id),
    },
  });
}

export async function listAbsenceNotes(filters: AbsenceNoteFilters) {
  const search = filters.search?.trim();

  return getPrisma().absenceNote.findMany({
    where: {
      status: filters.status,
      absenceCategory: filters.absenceCategory,
      session: {
        periodId: filters.periodId,
        examType: filters.examType,
      },
      OR: search
        ? [
            {
              examNumber: {
                contains: search,
              },
            },
            {
              student: {
                name: {
                  contains: search,
                },
              },
            },
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

    if (isSessionClosed(session.examDate)) {
      throw new Error("시험 종료 후 사유서는 등록할 수 없습니다.");
    }

    const autoApprove = payload.absenceCategory === AbsenceCategory.MILITARY;
    const note = await tx.absenceNote.create({
      data: {
        examNumber: payload.examNumber,
        sessionId: payload.sessionId,
        reason: payload.reason,
        absenceCategory: payload.absenceCategory,
        status: autoApprove ? AbsenceStatus.APPROVED : AbsenceStatus.PENDING,
        submittedAt: new Date(),
        approvedAt: autoApprove ? new Date() : null,
        attendGrantsPerfectAttendance:
          payload.absenceCategory === AbsenceCategory.MILITARY
            ? true
            : Boolean(payload.attendGrantsPerfectAttendance),
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
    await recalculateStatusCache(result.session.periodId, result.session.examType);
  }

  return result.note;
}

export async function updateAbsenceNote(input: {
  adminId: string;
  noteId: number;
  payload: Pick<AbsenceNoteFormInput, "reason" | "absenceCategory" | "adminNote">;
  ipAddress?: string | null;
}) {
  const reason = input.payload.reason.trim();

  if (!reason) {
    throw new Error("사유 내용을 입력하세요.");
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
      throw new Error("승인된 사유서는 수정 대신 삭제 후 다시 등록하세요.");
    }

    if (isSessionClosed(before.session.examDate)) {
      throw new Error("시험 종료 후 사유서는 수정할 수 없습니다.");
    }

    const autoApprove = input.payload.absenceCategory === AbsenceCategory.MILITARY;
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
        attendGrantsPerfectAttendance:
          input.payload.absenceCategory === AbsenceCategory.MILITARY
            ? true
            : before.attendGrantsPerfectAttendance,
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
    await recalculateStatusCache(result.session.periodId, result.session.examType);
  }

  return result.note;
}

export async function reviewAbsenceNote(input: {
  adminId: string;
  noteId: number;
  action: "approve" | "reject";
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
      const note = await tx.absenceNote.update({
        where: {
          id: input.noteId,
        },
        data: {
          status: AbsenceStatus.APPROVED,
          approvedAt: new Date(),
          attendGrantsPerfectAttendance:
            before.absenceCategory === AbsenceCategory.MILITARY
              ? true
              : Boolean(input.attendGrantsPerfectAttendance),
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
        attendGrantsPerfectAttendance: false,
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
    await recalculateStatusCache(result.session.periodId, result.session.examType);
  }

  return result.note;
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
    await recalculateStatusCache(result.note.session.periodId, result.note.session.examType);
  }

  return {
    success: true,
  };
}
