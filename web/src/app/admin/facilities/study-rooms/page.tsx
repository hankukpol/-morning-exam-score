import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { StudyRoomManager } from "./study-room-manager";

export const dynamic = "force-dynamic";

export type StudyRoomRow = {
  id: string;
  name: string;
  capacity: number;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type BookingRow = {
  id: string;
  roomId: string;
  examNumber: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: string;
  note: string | null;
  room: { name: string };
  student: { name: string; generation: number | null };
  assigner: { name: string };
};

export default async function StudyRoomsPage() {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const [rooms, todayBookings] = await Promise.all([
    getPrisma().studyRoom.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    getPrisma().studyRoomBooking.findMany({
      where: { bookingDate: todayDate, status: "CONFIRMED" },
      include: {
        room: { select: { name: true } },
        student: { select: { name: true, generation: true } },
        assigner: { select: { name: true } },
      },
      orderBy: [{ roomId: "asc" }, { startTime: "asc" }],
    }),
  ]);

  const serializedBookings: BookingRow[] = todayBookings.map((b) => ({
    ...b,
    bookingDate: b.bookingDate.toISOString(),
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        시설 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">스터디룸 예약</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        스터디룸 예약 요청을 확인하고 배정합니다. 직원이 예약을 직접 배정하며 학생에게 안내합니다.
      </p>
      <div className="mt-8">
        <StudyRoomManager
          initialRooms={rooms as StudyRoomRow[]}
          initialBookings={serializedBookings}
          todayDate={todayDate.toISOString()}
        />
      </div>
    </div>
  );
}
