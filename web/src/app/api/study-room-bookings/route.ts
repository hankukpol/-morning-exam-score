import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date"); // "YYYY-MM-DD"
  const roomId = searchParams.get("roomId");

  const where: Record<string, unknown> = {};
  if (dateStr) where.bookingDate = new Date(dateStr);
  if (roomId) where.roomId = roomId;

  const bookings = await getPrisma().studyRoomBooking.findMany({
    where,
    include: {
      room: { select: { name: true } },
      student: { select: { name: true, generation: true } },
      assigner: { select: { name: true } },
    },
    orderBy: [{ bookingDate: "desc" }, { startTime: "asc" }],
    take: 100,
  });

  return NextResponse.json({ bookings });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { roomId, examNumber, bookingDate, startTime, endTime, note } = body;

    if (!roomId || !examNumber || !bookingDate || !startTime || !endTime) {
      return NextResponse.json({ error: "필수 항목을 모두 입력하세요." }, { status: 400 });
    }

    const booking = await getPrisma().studyRoomBooking.create({
      data: {
        roomId,
        examNumber,
        bookingDate: new Date(bookingDate),
        startTime,
        endTime,
        note: note?.trim() || null,
        assignedBy: auth.context.adminUser.id,
      },
      include: {
        room: { select: { name: true } },
        student: { select: { name: true, generation: true } },
        assigner: { select: { name: true } },
      },
    });

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "예약 실패" },
      { status: 400 },
    );
  }
}
