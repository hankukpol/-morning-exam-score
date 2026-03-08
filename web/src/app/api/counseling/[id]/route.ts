import { AdminRole } from "@/generated/prisma";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { deleteCounselingRecord, updateCounselingRecord } from "@/lib/counseling/service";

type RequestBody = {
  counselorName?: string;
  content?: string;
  recommendation?: string | null;
  counseledAt?: string;
  nextSchedule?: string | null;
};

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
    const recordId = Number(params.id);

    if (!Number.isInteger(recordId)) {
      return NextResponse.json({ error: "면담 기록 ID가 올바르지 않습니다." }, { status: 400 });
    }

    const body = (await request.json()) as RequestBody;
    const record = await updateCounselingRecord({
      adminId: auth.context.adminUser.id,
      recordId,
      payload: {
        counselorName: String(body.counselorName ?? ""),
        content: String(body.content ?? ""),
        recommendation: body.recommendation ?? null,
        counseledAt: new Date(String(body.counseledAt ?? "")),
        nextSchedule: body.nextSchedule ? new Date(body.nextSchedule) : null,
      },
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "면담 기록 수정에 실패했습니다.",
      },
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
    const recordId = Number(params.id);

    if (!Number.isInteger(recordId)) {
      return NextResponse.json({ error: "면담 기록 ID가 올바르지 않습니다." }, { status: 400 });
    }

    await deleteCounselingRecord({
      adminId: auth.context.adminUser.id,
      recordId,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "면담 기록 삭제에 실패했습니다." },
      { status: 400 },
    );
  }
}
