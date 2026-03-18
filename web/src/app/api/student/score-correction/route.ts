import { AdminMemoColor, AdminMemoScope, AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RequestBody = {
  scoreId?: unknown;
  examDate?: unknown;
  subject?: unknown;
  currentScore?: unknown;
  reportedScore?: unknown;
  reason?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const examDate = typeof body.examDate === "string" ? body.examDate.trim() : null;
  const subject = typeof body.subject === "string" ? body.subject.trim() : null;
  const reason = typeof body.reason === "string" ? body.reason.trim() : null;
  const reportedScore =
    typeof body.reportedScore === "number"
      ? body.reportedScore
      : typeof body.reportedScore === "string"
        ? parseFloat(body.reportedScore)
        : NaN;

  if (!examDate || !subject) {
    return NextResponse.json({ error: "시험일과 과목은 필수입니다." }, { status: 400 });
  }

  if (!reason) {
    return NextResponse.json({ error: "신고 사유를 입력해 주세요." }, { status: 400 });
  }

  if (isNaN(reportedScore) || reportedScore < 0 || reportedScore > 100) {
    return NextResponse.json({ error: "실제 점수는 0~100 사이의 숫자를 입력해 주세요." }, { status: 400 });
  }

  // Build memo content
  const currentScoreText =
    body.currentScore !== null && body.currentScore !== undefined
      ? String(body.currentScore)
      : "미입력";

  const memoTitle = `[성적 오류 신고] ${auth.student.name} (${auth.student.examNumber}) — ${subject} ${examDate}`;
  const memoContent =
    `[성적 오류 신고] 시험일: ${examDate}, 과목: ${subject}, 현재 점수: ${currentScoreText}, 신고 점수: ${reportedScore}\n` +
    `사유: ${reason}`;

  // Find a SUPER_ADMIN or the highest-role admin to use as memo owner
  const ownerAdmin = await getPrisma().adminUser.findFirst({
    where: {
      isActive: true,
      role: { in: [AdminRole.SUPER_ADMIN, AdminRole.DIRECTOR, AdminRole.DEPUTY_DIRECTOR, AdminRole.MANAGER] },
    },
    orderBy: [
      // Rough priority: SUPER_ADMIN > DIRECTOR > etc.
      { createdAt: "asc" },
    ],
    select: { id: true },
  });

  if (!ownerAdmin) {
    return NextResponse.json({ error: "담당자 계정을 찾을 수 없습니다. 관리자에게 문의해 주세요." }, { status: 500 });
  }

  await getPrisma().adminMemo.create({
    data: {
      title: memoTitle,
      content: memoContent,
      color: AdminMemoColor.ROSE,
      scope: AdminMemoScope.TEAM,
      relatedStudentExamNumber: auth.student.examNumber,
      ownerId: ownerAdmin.id,
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
