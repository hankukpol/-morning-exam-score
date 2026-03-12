import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  deleteScoreEntry,
  parseScoreUpdate,
  updateScoreEntry,
} from "@/lib/scores/service";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const payload = parseScoreUpdate(body);
    const score = await updateScoreEntry({
      adminId: auth.context.adminUser.id,
      scoreId: Number(params.id),
      payload,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ score });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "성적 수정에 실패했습니다." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await deleteScoreEntry({
      adminId: auth.context.adminUser.id,
      scoreId: Number(params.id),
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "성적 삭제에 실패했습니다." },
      { status: 400 },
    );
  }
}
