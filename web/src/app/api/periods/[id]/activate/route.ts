import { AdminRole } from "@/generated/prisma";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { activatePeriod } from "@/lib/periods/service";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const auth = await requireApiAdmin(AdminRole.TEACHER);

    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const periodId = Number(params.id);
    const result = await activatePeriod({
      adminId: auth.context.adminUser.id,
      periodId,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ period: result });
  } catch (error) {
    console.error("[PUT /api/periods/[id]/activate] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "활성화에 실패했습니다." },
      { status: 500 },
    );
  }
}
