import {
  AbsenceCategory,
  AbsenceStatus,
  AttendType,
  ExamType,
  ScoreSource,
} from "@prisma/client";
import { toAuditJson } from "@/lib/audit";
import { recalculateStatusCache } from "@/lib/analytics/service";
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
      throw new Error("승인된 사유서만 취소할 수 있습니다.");
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
    await recalculateStatusCache(result.session.periodId, result.session.examType, {
      examNumbers: [result.note.examNumber],
    });
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
    await recalculateStatusCache(result.session.periodId, result.session.examType, {
      examNumbers: [result.note.examNumber],
    });
  }

  return result.note;
}

/**
 * 사유서의 회차(날짜)를 다른 회차로 변경한다.
 *
 * 운영 시나리오:
 * - 학생이 화요일 사유서를 제출했는데 실제 결시는 목요일인 경우
 * - 관리자가 사유서를 잘못된 회차로 등록한 경우
 *
 * 동작 원칙:
 * 1. 중복 검사: 목표 회차에 같은 학생 사유서가 이미 있으면 실패
 *    (AbsenceNote 테이블의 @@unique([examNumber, sessionId]) 제약 조건)
 * 2. 승인된 사유서 처리:
 *    - APPROVED 상태이면 기존 회차의 점수를 EXCUSED → ABSENT로 되돌림 (revertApprovedAbsenceNote)
 *    - 회차 변경 후 상태를 PENDING으로 리셋 (새 회차에서 다시 승인 필요)
 * 3. 경고/탈락 상태 재계산: APPROVED였던 경우 출결 캐시 재계산 필요
 */
export async function changeAbsenceNoteSession(input: {
  adminId: string;
  noteId: number;
  newSessionId: number;
  ipAddress?: string | null;
}) {
  const result = await getPrisma().$transaction(async (tx) => {
    // 변경 전 상태 저장 (session 포함: periodId, examType 참조용)
    const before = await tx.absenceNote.findUniqueOrThrow({
      where: { id: input.noteId },
      include: { session: true },
    });

    if (before.sessionId === input.newSessionId) {
      throw new Error("현재 회차와 동일합니다.");
    }

    // 목표 회차가 실제 존재하는지 확인
    await tx.examSession.findUniqueOrThrow({ where: { id: input.newSessionId } });

    // 목표 회차에 같은 학생 사유서가 이미 있으면 충돌 오류
    const conflict = await tx.absenceNote.findUnique({
      where: {
        examNumber_sessionId: {
          examNumber: before.examNumber,
          sessionId: input.newSessionId,
        },
      },
    });
    if (conflict) {
      throw new Error("해당 회차에 이미 같은 학생의 사유서가 있습니다.");
    }

    // 승인 상태이면 기존 회차의 EXCUSED 점수를 먼저 되돌림
    const wasApproved = before.status === AbsenceStatus.APPROVED;
    if (wasApproved) {
      await revertApprovedAbsenceNote(tx, before);
    }

    // 회차 변경 + 승인됐던 경우 상태를 PENDING으로 리셋
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

  // 트랜잭션 외부에서 경고/탈락 상태 캐시 재계산 (승인 상태였던 경우만)
  if (result.wasApproved) {
    await recalculateStatusCache(result.oldSession.periodId, result.oldSession.examType, {
      examNumbers: [result.updated.examNumber],
    });
  }

  return result.updated;
}

/**
 * 사유서 일괄 등록 결과 타입
 * - succeeded: 새로 생성된 사유서 수
 * - skipped: 이미 존재해 건너뛴 회차 수 (중복 방지)
 * - autoApproved: MILITARY 카테고리로 자동 승인된 수
 * - errors: 처리 실패한 회차 목록
 */
export type BulkCreateAbsenceNotesResult = {
  succeeded: number;
  skipped: number;
  autoApproved: number;
  errors: { sessionId: number; message: string }[];
};

/**
 * 한 학생의 여러 회차에 사유서를 한 번에 등록한다.
 *
 * 운영 시나리오:
 * - 매주 금요일 결석하는 학생이 4주치 사유서를 한 번에 제출
 * - 학원 행사로 특정 요일들에 모두 결석 처리가 필요한 경우
 * - UI에서 날짜 범위 + 요일 필터로 회차를 자동 선택 후 호출
 *
 * 동작 원칙:
 * 1. 이미 사유서가 있는 회차는 조용히 건너뜀 (skipped 카운트)
 *    → 중복 제출에 안전, 재시도 가능
 * 2. MILITARY 카테고리: 생성 즉시 자동 승인 + 점수에 EXCUSED 적용
 * 3. Promise.allSettled 사용: 한 회차 실패가 다른 회차를 막지 않음
 * 4. 자동 승인된 건이 있으면 트랜잭션 종료 후 경고/탈락 상태 재계산
 */
export async function bulkCreateAbsenceNotes(input: {
  adminId: string;
  payload: {
    examNumber: string;
    sessionIds: number[];
    reason: string;
    absenceCategory: AbsenceCategory;
    attendGrantsPerfectAttendance?: boolean;
    adminNote?: string | null;
  };
  ipAddress?: string | null;
}): Promise<BulkCreateAbsenceNotesResult> {
  const { payload } = input;
  const examNumber = payload.examNumber.trim();
  const reason = payload.reason.trim();

  // 필수 입력값 사전 검증
  if (!examNumber) throw new Error("수험번호를 입력하세요.");
  if (!reason) throw new Error("사유 내용을 입력하세요.");
  if (!payload.sessionIds.length) throw new Error("회차를 선택하세요.");

  // MILITARY(군 입소) 카테고리는 생성 즉시 자동 승인
  const autoApprove = payload.absenceCategory === AbsenceCategory.MILITARY;

  type SingleResult =
    | { type: "created"; periodId: number; examType: ExamType; autoApprove: boolean }
    | { type: "skipped" };

  // 각 회차를 병렬 처리, 실패해도 다른 회차에 영향 없음
  const results = await Promise.allSettled<SingleResult>(
    payload.sessionIds.map(async (sessionId) => {
      return getPrisma().$transaction(async (tx) => {
        // 이미 존재하는 회차는 건너뜀 (@@unique 제약 조건 사전 회피)
        const existing = await tx.absenceNote.findUnique({
          where: { examNumber_sessionId: { examNumber, sessionId } },
        });
        if (existing) return { type: "skipped" as const };

        // periodId, examType 참조를 위해 session 조회
        const session = await tx.examSession.findUniqueOrThrow({ where: { id: sessionId } });

        const note = await tx.absenceNote.create({
          data: {
            examNumber,
            sessionId,
            reason,
            absenceCategory: payload.absenceCategory,
            status: autoApprove ? AbsenceStatus.APPROVED : AbsenceStatus.PENDING,
            submittedAt: new Date(),
            approvedAt: autoApprove ? new Date() : null,
            // MILITARY 자동 승인 시 개근 인정 강제 true
            attendGrantsPerfectAttendance: autoApprove ? true : Boolean(payload.attendGrantsPerfectAttendance),
            adminNote: payload.adminNote?.trim() || null,
          },
        });

        // 자동 승인이면 해당 회차 점수를 EXCUSED로 즉시 적용
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
  // 자동 승인된 건이 있으면 학생의 경고/탈락 상태 캐시 재계산
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
        message: (r as PromiseRejectedResult).reason?.message ?? "알 수 없는 오류",
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
