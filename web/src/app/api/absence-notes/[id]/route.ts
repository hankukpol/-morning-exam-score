/**
 * PUT  /api/absence-notes/[id]  - 사유서 처리
 * DELETE /api/absence-notes/[id] - 사유서 삭제
 *
 * PUT action 분기:
 * - "update" (기본): 사유 내용·카테고리·메모 수정
 * - "approve": 사유서 승인 (점수 EXCUSED 처리)
 * - "reject": 사유서 반려
 * - "revert": 승인 취소 (APPROVED → PENDING, 점수 복원)
 * - "changeSession": 사유서가 속한 회차(날짜) 변경
 *   → 잘못된 날짜로 제출된 사유서를 올바른 날짜로 이전
 */
import { AbsenceCategory, AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  changeAbsenceNoteSession,
  deleteAbsenceNote,
  revertAbsenceNote,
  reviewAbsenceNote,
  updateAbsenceNote,
} from "@/lib/absence-notes/service";

type RequestBody = {
  action?: "update" | "approve" | "reject" | "revert" | "changeSession";
  reason?: string;
  absenceCategory?: AbsenceCategory;
  adminNote?: string | null;
  attendGrantsPerfectAttendance?: boolean;
  newSessionId?: number;  // action === "changeSession" 일 때 필수
};

type RouteContext = {
  params: {
    id: string;
  };
};

function parseId(context: RouteContext) {
  return Number(context.params.id);
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const noteId = parseId(context);

    if (!Number.isInteger(noteId)) {
      return NextResponse.json({ error: "사유서 ID가 올바르지 않습니다." }, { status: 400 });
    }

    const body = (await request.json()) as RequestBody;
    const action = body.action ?? "update";

    // 승인 / 반려: 점수 EXCUSED 적용 또는 취소
    if (action === "approve" || action === "reject") {
      const note = await reviewAbsenceNote({
        adminId: auth.context.adminUser.id,
        noteId,
        action,
        attendGrantsPerfectAttendance: Boolean(body.attendGrantsPerfectAttendance),
        adminNote: body.adminNote ?? null,
        ipAddress: request.headers.get("x-forwarded-for"),
      });

      return NextResponse.json(note);
    }

    // 회차 변경: 기존 회차의 EXCUSED 점수를 되돌리고 새 회차로 이전
    if (action === "changeSession") {
      if (!body.newSessionId || !Number.isInteger(Number(body.newSessionId))) {
        return NextResponse.json({ error: "변경할 회차를 선택하세요." }, { status: 400 });
      }
      const note = await changeAbsenceNoteSession({
        adminId: auth.context.adminUser.id,
        noteId,
        newSessionId: Number(body.newSessionId),
        ipAddress: request.headers.get("x-forwarded-for"),
      });
      return NextResponse.json(note);
    }

    // 승인 취소: APPROVED → PENDING, 점수를 ABSENT로 복원
    if (action === "revert") {
      const note = await revertAbsenceNote({
        adminId: auth.context.adminUser.id,
        noteId,
        ipAddress: request.headers.get("x-forwarded-for"),
      });

      return NextResponse.json(note);
    }

    // 기본: 사유 내용·카테고리·메모 수정
    const note = await updateAbsenceNote({
      adminId: auth.context.adminUser.id,
      noteId,
      payload: {
        reason: String(body.reason ?? ""),
        absenceCategory: body.absenceCategory ?? AbsenceCategory.OTHER,
        adminNote: body.adminNote ?? null,
      },
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(note);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "사유서 처리에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const noteId = parseId(context);

    if (!Number.isInteger(noteId)) {
      return NextResponse.json({ error: "사유서 ID가 올바르지 않습니다." }, { status: 400 });
    }

    const result = await deleteAbsenceNote({
      adminId: auth.context.adminUser.id,
      noteId,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "사유서 삭제에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
