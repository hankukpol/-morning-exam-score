import { AbsenceCategory, AdminRole } from "@/generated/prisma";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  deleteAbsenceNote,
  reviewAbsenceNote,
  updateAbsenceNote,
} from "@/lib/absence-notes/service";

type RequestBody = {
  action?: "update" | "approve" | "reject";
  reason?: string;
  absenceCategory?: AbsenceCategory;
  adminNote?: string | null;
  attendGrantsPerfectAttendance?: boolean;
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
