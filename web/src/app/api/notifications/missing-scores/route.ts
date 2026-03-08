import { AdminRole } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sessionIdValue = request.nextUrl.searchParams.get("sessionId");

  if (!sessionIdValue) {
    return NextResponse.json({ error: "sessionId가 필요합니다." }, { status: 400 });
  }

  const sessionId = Number(sessionIdValue);
  const prisma = getPrisma();

  const session = await prisma.examSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    return NextResponse.json({ error: "회차를 찾을 수 없습니다." }, { status: 404 });
  }

  const [enrollments, scores] = await Promise.all([
    prisma.periodEnrollment.findMany({
      where: { periodId: session.periodId },
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            phone: true,
            examType: true,
            notificationConsent: true,
            isActive: true,
          },
        },
      },
    }),
    prisma.score.findMany({
      where: { sessionId },
      select: { examNumber: true },
    }),
  ]);

  const scoredExamNumbers = new Set(scores.map((score) => score.examNumber));

  const missing = enrollments
    .filter(
      (enrollment) =>
        !scoredExamNumbers.has(enrollment.student.examNumber) && enrollment.student.isActive,
    )
    .map((enrollment) => ({
      examNumber: enrollment.student.examNumber,
      name: enrollment.student.name,
      phone: enrollment.student.phone,
      examType: enrollment.student.examType,
      notificationConsent: enrollment.student.notificationConsent,
    }));

  return NextResponse.json({ students: missing, sessionId, periodId: session.periodId });
}
