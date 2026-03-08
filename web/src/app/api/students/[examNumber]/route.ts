import { AdminRole } from "@/generated/prisma";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  deactivateStudent,
  parseStudentForm,
  updateStudent,
} from "@/lib/students/service";

type RouteContext = {
  params: {
    examNumber: string;
  };
};

export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const student = parseStudentForm(body);
    const updated = await updateStudent({
      adminId: auth.context.adminUser.id,
      examNumber: params.examNumber,
      student,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ student: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수강생 수정에 실패했습니다." },
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
    await deactivateStudent({
      adminId: auth.context.adminUser.id,
      examNumber: params.examNumber,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "비활성화에 실패했습니다." },
      { status: 400 },
    );
  }
}
