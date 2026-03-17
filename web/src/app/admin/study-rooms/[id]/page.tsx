import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { RoomDetailClient, type BookingRowDetail } from "./room-detail-client";

export const dynamic = "force-dynamic";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudyRoomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const { id } = await params;

  // Fetch room with recent bookings (last 50, descending)
  const room = await getPrisma().studyRoom.findUnique({
    where: { id },
    include: {
      bookings: {
        include: {
          student: {
            select: {
              examNumber: true,
              name: true,
              generation: true,
              phone: true,
            },
          },
          assigner: { select: { name: true } },
        },
        orderBy: [{ bookingDate: "desc" }, { startTime: "desc" }],
        take: 50,
      },
    },
  });

  if (!room) notFound();

  // ── Aggregate stats (all-time) ─────────────────────────────────────────────
  const allBookings = await getPrisma().studyRoomBooking.findMany({
    where: { roomId: id },
    select: { status: true, examNumber: true },
  });

  const totalBookings = allBookings.length;
  const confirmedBookings = allBookings.filter((b) => b.status === "CONFIRMED").length;
  const cancelledBookings = allBookings.filter((b) => b.status === "CANCELLED").length;
  const noshowBookings = allBookings.filter((b) => b.status === "NOSHOW").length;
  const uniqueStudents = new Set(allBookings.map((b) => b.examNumber)).size;

  // ── Serialize dates ────────────────────────────────────────────────────────
  const serializedRoom = {
    id: room.id,
    name: room.name,
    capacity: room.capacity,
    description: room.description,
    isActive: room.isActive,
    sortOrder: room.sortOrder,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
  };

  const serializedBookings: BookingRowDetail[] = room.bookings.map((b) => ({
    id: b.id,
    roomId: b.roomId,
    examNumber: b.examNumber,
    bookingDate: b.bookingDate.toISOString(),
    startTime: b.startTime,
    endTime: b.endTime,
    status: b.status,
    note: b.note,
    createdAt: b.createdAt.toISOString(),
    student: b.student,
    assigner: b.assigner,
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/study-rooms" className="hover:text-ink transition-colors">
          시설 관리
        </Link>
        <span className="text-slate/50">/</span>
        <span className="text-ink">스터디룸 상세</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            스터디룸 상세
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-ink">{room.name}</h1>
          <p className="mt-2 text-sm text-slate">
            수용 {room.capacity}명
            {room.description ? ` · ${room.description}` : ""}
            {" · "}
            <span className={room.isActive ? "text-forest" : "text-slate"}>
              {room.isActive ? "운영 중" : "비활성"}
            </span>
          </p>
        </div>

        <Link
          href="/admin/study-rooms"
          className="rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-slate hover:border-ink/40 hover:text-ink transition-colors"
        >
          ← 목록으로
        </Link>
      </div>

      {/* Detail content */}
      <div className="mt-10">
        <RoomDetailClient
          room={serializedRoom}
          recentBookings={serializedBookings}
          stats={{
            totalBookings,
            confirmedBookings,
            cancelledBookings,
            noshowBookings,
            uniqueStudents,
          }}
        />
      </div>
    </div>
  );
}
