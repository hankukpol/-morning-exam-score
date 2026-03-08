import { AdminRole } from "@/generated/prisma";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  executeEnrollmentPaste,
  listPeriodEnrollments,
  previewEnrollmentPaste,
  removeEnrollment,
} from "@/lib/periods/enrollments";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const periodId = Number(params.id);
  if (isNaN(periodId)) {
    return NextResponse.json({ error: "잘못된 기간 ID입니다." }, { status: 400 });
  }

  const enrollments = await listPeriodEnrollments(periodId);
  return NextResponse.json({ enrollments });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const periodId = Number(params.id);
  if (isNaN(periodId)) {
    return NextResponse.json({ error: "잘못된 기간 ID입니다." }, { status: 400 });
  }

  const body = await request.json();
  const { action, text, examNumbers } = body as {
    action: "preview" | "execute";
    text?: string;
    examNumbers?: string[];
  };

  if (action === "preview") {
    if (!text) {
      return NextResponse.json({ error: "붙여넣기 텍스트를 입력하세요." }, { status: 400 });
    }
    const result = await previewEnrollmentPaste(periodId, text);
    return NextResponse.json(result);
  }

  if (action === "execute") {
    if (!examNumbers?.length) {
      return NextResponse.json({ error: "등록할 수험번호를 선택하세요." }, { status: 400 });
    }
    const result = await executeEnrollmentPaste({
      adminId: auth.context.adminUser.id,
      periodId,
      examNumbers,
      ipAddress: request.headers.get("x-forwarded-for"),
    });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "알 수 없는 action입니다." }, { status: 400 });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const periodId = Number(params.id);
  if (isNaN(periodId)) {
    return NextResponse.json({ error: "잘못된 기간 ID입니다." }, { status: 400 });
  }

  const body = await request.json();
  const { examNumber } = body as { examNumber: string };

  if (!examNumber) {
    return NextResponse.json({ error: "수험번호를 입력하세요." }, { status: 400 });
  }

  await removeEnrollment({
    adminId: auth.context.adminUser.id,
    periodId,
    examNumber,
    ipAddress: request.headers.get("x-forwarded-for"),
  });

  return NextResponse.json({ ok: true });
}
