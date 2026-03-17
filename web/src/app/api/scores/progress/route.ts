import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type ScoreProgressData = {
  sessionId: number;
  totalEnrolled: number;
  scoredCount: number;
  missingCount: number;
  progressPercent: number;
  missingStudents: Array<{
    examNumber: string;
    name: string;
  }>;
};

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sessionIdRaw = request.nextUrl.searchParams.get("sessionId");
  const sessionId = sessionIdRaw ? Number(sessionIdRaw) : NaN;

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return NextResponse.json({ error: "시험 회차를 선택해 주세요." }, { status: 400 });
  }

  try {
    const prisma = getPrisma();

    const session = await prisma.examSession.findUnique({
      where: { id: sessionId },
      select: { id: true, periodId: true, examType: true },
    });

    if (!session) {
      return NextResponse.json({ error: "시험 회차를 찾을 수 없습니다." }, { status: 404 });
    }

    // 해당 기간에 등록된 수강생 조회 (PeriodEnrollment 기준)
    const enrolledStudents = await prisma.periodEnrollment.findMany({
      where: { periodId: session.periodId },
      select: {
        examNumber: true,
        student: {
          select: {
            name: true,
            examType: true,
            isActive: true,
          },
        },
      },
    });

    // examType 필터링 (공채/경채 구분)
    const filteredStudents = enrolledStudents.filter(
      (pe) => pe.student.examType === session.examType && pe.student.isActive,
    );

    // 이미 성적이 입력된 수강생 조회
    const existingScores = await prisma.score.findMany({
      where: { sessionId },
      select: { examNumber: true },
    });

    const scoredSet = new Set(existingScores.map((s) => s.examNumber));

    const missingStudents = filteredStudents
      .filter((pe) => !scoredSet.has(pe.examNumber))
      .map((pe) => ({
        examNumber: pe.examNumber,
        name: pe.student.name,
      }))
      .sort((a, b) => a.examNumber.localeCompare(b.examNumber));

    const totalEnrolled = filteredStudents.length;
    const scoredCount = filteredStudents.filter((pe) => scoredSet.has(pe.examNumber)).length;
    const missingCount = missingStudents.length;
    const progressPercent =
      totalEnrolled > 0 ? Math.round((scoredCount / totalEnrolled) * 100) : 0;

    const data: ScoreProgressData = {
      sessionId,
      totalEnrolled,
      scoredCount,
      missingCount,
      progressPercent,
      missingStudents,
    };

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "진행률 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
