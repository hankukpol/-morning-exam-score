import { AdminRole, AttendType, ExamType, ScoreSource } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Multi-subject CSV score import.
 *
 * POST body:
 * {
 *   periodId: number,
 *   examDate: string (YYYY-MM-DD),
 *   examType: string,
 *   entries: Array<{
 *     examNumber: string,
 *     scores: Record<string, number>  // subject enum key → rawScore
 *   }>
 * }
 *
 * Returns:
 * {
 *   data: {
 *     success: number,
 *     failed: Array<{ examNumber: string; subject: string; reason: string }>
 *   }
 * }
 */
export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json() as {
      periodId: number;
      examDate: string;
      examType: string;
      entries: Array<{
        examNumber: string;
        scores: Record<string, number>;
      }>;
    };

    const { periodId, examDate, examType, entries } = body;

    if (!periodId || !examDate || !examType) {
      return NextResponse.json(
        { error: "periodId, examDate, examType은 필수입니다." },
        { status: 400 },
      );
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: "성적 데이터가 없습니다." }, { status: 400 });
    }

    const prisma = getPrisma();

    // Parse the exam date (start of that day UTC)
    const examDateParsed = new Date(examDate);
    if (isNaN(examDateParsed.getTime())) {
      return NextResponse.json({ error: "examDate 형식이 올바르지 않습니다. (YYYY-MM-DD)" }, { status: 400 });
    }

    // Collect all subject keys from entries
    const subjectKeys = new Set<string>();
    for (const entry of entries) {
      Object.keys(entry.scores).forEach((k) => subjectKeys.add(k));
    }

    if (subjectKeys.size === 0) {
      return NextResponse.json({ error: "유효한 과목 점수가 없습니다." }, { status: 400 });
    }

    // Validate examType
    const validExamTypes: string[] = Object.values(ExamType);
    if (!validExamTypes.includes(examType)) {
      return NextResponse.json(
        { error: `examType '${examType}'이 유효하지 않습니다. 유효값: ${validExamTypes.join(", ")}` },
        { status: 400 },
      );
    }

    const allSessions = await prisma.examSession.findMany({
      where: {
        periodId,
        examType: examType as ExamType,
        isCancelled: false,
      },
      select: {
        id: true,
        subject: true,
        examDate: true,
        week: true,
        isLocked: true,
      },
    });

    // Match sessions to the given date (within the same calendar day KST = UTC+9)
    const dayStart = new Date(examDate + "T00:00:00.000Z");
    const dayEnd = new Date(examDate + "T23:59:59.999Z");

    const sessionBySubject = new Map<string, number>(); // subject → sessionId
    for (const s of allSessions) {
      if (s.examDate >= dayStart && s.examDate <= dayEnd) {
        sessionBySubject.set(s.subject, s.id);
      }
    }

    // If no sessions found on that exact day, try matching by week
    // (some sessions are stored with different time offsets)
    if (sessionBySubject.size === 0) {
      // Try within ±1 day
      const dayStartWide = new Date(dayStart.getTime() - 24 * 3600 * 1000);
      const dayEndWide = new Date(dayEnd.getTime() + 24 * 3600 * 1000);
      for (const s of allSessions) {
        if (s.examDate >= dayStartWide && s.examDate <= dayEndWide) {
          sessionBySubject.set(s.subject, s.id);
        }
      }
    }

    // Collect all examNumbers to validate
    const examNumbers = [...new Set(entries.map((e) => e.examNumber).filter(Boolean))];
    const existingStudents = await prisma.student.findMany({
      where: { examNumber: { in: examNumbers } },
      select: { examNumber: true },
    });
    const validExamNumbers = new Set(existingStudents.map((s) => s.examNumber));

    let successCount = 0;
    const failed: Array<{ examNumber: string; subject: string; reason: string }> = [];

    for (const entry of entries) {
      if (!entry.examNumber || !validExamNumbers.has(entry.examNumber)) {
        // Report once for the whole entry
        const subjects = Object.keys(entry.scores);
        const firstSubject = subjects[0] ?? "";
        failed.push({
          examNumber: entry.examNumber ?? "(빈 학번)",
          subject: firstSubject,
          reason: `학번 '${entry.examNumber}'이 존재하지 않습니다.`,
        });
        continue;
      }

      for (const [subjectKey, rawScore] of Object.entries(entry.scores)) {
        const sessionId = sessionBySubject.get(subjectKey);
        if (!sessionId) {
          failed.push({
            examNumber: entry.examNumber,
            subject: subjectKey,
            reason: `해당 날짜에 '${subjectKey}' 과목 세션이 없습니다.`,
          });
          continue;
        }

        if (typeof rawScore !== "number" || !Number.isFinite(rawScore) || rawScore < 0 || rawScore > 100) {
          failed.push({
            examNumber: entry.examNumber,
            subject: subjectKey,
            reason: `점수 값이 올바르지 않습니다: ${rawScore}`,
          });
          continue;
        }

        try {
          await prisma.score.upsert({
            where: { examNumber_sessionId: { examNumber: entry.examNumber, sessionId } },
            create: {
              examNumber: entry.examNumber,
              sessionId,
              rawScore,
              finalScore: rawScore,
              attendType: AttendType.NORMAL,
              sourceType: ScoreSource.MANUAL_INPUT,
            },
            update: {
              rawScore,
              finalScore: rawScore,
              sourceType: ScoreSource.MANUAL_INPUT,
            },
          });
          successCount++;
        } catch (err) {
          failed.push({
            examNumber: entry.examNumber,
            subject: subjectKey,
            reason: err instanceof Error ? err.message : "DB 저장 오류",
          });
        }
      }
    }

    return NextResponse.json({
      data: {
        success: successCount,
        failed,
        sessionsFound: sessionBySubject.size,
        totalEntries: entries.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "가져오기에 실패했습니다." },
      { status: 400 },
    );
  }
}
