import { AdminRole } from "@/generated/prisma";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { parseSessionUpdate, updateSession } from "@/lib/periods/service";

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
    const sessionId = Number(params.id);
    const payload = parseSessionUpdate(body);
    const session = await updateSession({
      adminId: auth.context.adminUser.id,
      sessionId,
      payload,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "회차 수정에 실패했습니다." },
      { status: 400 },
    );
  }
}
