import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/attendance/sessions?date=2026-03-17
// 날짜별 강의 세션 목록 (출결 통계 포함)
export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const dateParam = sp.get("date");

  const targetDate = dateParam ? new Date(dateParam) : new Date();
  // Date 객체를 날짜만 있는 형식으로 정규화
  const dateOnly = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
  );

  try {
    // 해당 날짜의 세션 조회 (스케줄 + 기수 + 출결 통계 포함)
    const sessions = await getPrisma().lectureSession.findMany({
      where: {
        sessionDate: dateOnly,
      },
      include: {
        schedule: {
          include: {
            cohort: {
              select: { id: true, name: true, examCategory: true },
            },
          },
        },
        attendances: {
          select: { status: true },
        },
      },
      orderBy: [{ startTime: "asc" }],
    });

    const sessionsWithStats = sessions.map((session) => {
      const total = session.attendances.length;
      const present = session.attendances.filter((a) => a.status === "PRESENT").length;
      const late = session.attendances.filter((a) => a.status === "LATE").length;
      const absent = session.attendances.filter((a) => a.status === "ABSENT").length;
      const excused = session.attendances.filter((a) => a.status === "EXCUSED").length;

      return {
        id: session.id,
        scheduleId: session.scheduleId,
        sessionDate: session.sessionDate,
        startTime: session.startTime,
        endTime: session.endTime,
        isCancelled: session.isCancelled,
        note: session.note,
        schedule: session.schedule,
        stats: { total, present, late, absent, excused },
        hasAttendance: total > 0,
      };
    });

    return NextResponse.json({ sessions: sessionsWithStats });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}

// POST /api/attendance/sessions
// 수동으로 세션 생성 (스케줄에서 자동 생성하지 않을 경우)
export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { scheduleId, sessionDate, startTime, endTime, note } = body;

    if (!scheduleId) throw new Error("스케줄 ID가 필요합니다.");
    if (!sessionDate) throw new Error("강의 날짜가 필요합니다.");
    if (!startTime || !endTime) throw new Error("시작/종료 시간이 필요합니다.");

    const dateOnly = new Date(sessionDate);

    // 스케줄 존재 확인
    const schedule = await getPrisma().lectureSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) throw new Error("스케줄을 찾을 수 없습니다.");

    const session = await getPrisma().lectureSession.upsert({
      where: {
        scheduleId_sessionDate: { scheduleId, sessionDate: dateOnly },
      },
      create: {
        id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        scheduleId,
        sessionDate: dateOnly,
        startTime,
        endTime,
        note: note?.trim() || null,
      },
      update: {
        startTime,
        endTime,
        note: note?.trim() || null,
      },
      include: {
        schedule: {
          include: { cohort: { select: { id: true, name: true } } },
        },
      },
    });

    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "생성 실패" },
      { status: 400 },
    );
  }
}
