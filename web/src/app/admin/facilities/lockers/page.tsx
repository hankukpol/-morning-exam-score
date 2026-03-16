import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { LockerBoard } from "./locker-board";

export const dynamic = "force-dynamic";

export type LockerWithRental = {
  id: string;
  zone: string;
  lockerNumber: string;
  row: number | null;
  col: number | null;
  status: string;
  note: string | null;
  rentals: Array<{
    id: string;
    examNumber: string;
    startDate: string;
    endDate: string | null;
    feeAmount: number;
    feeUnit: string;
    student: { name: string; generation: number | null };
  }>;
};

export default async function LockersPage() {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const rawLockers = await getPrisma().locker.findMany({
    include: {
      rentals: {
        where: { status: "ACTIVE" },
        include: {
          student: { select: { name: true, generation: true } },
        },
        take: 1,
        orderBy: { startDate: "desc" },
      },
    },
    orderBy: [{ zone: "asc" }, { lockerNumber: "asc" }],
  });

  // Serialize Dates
  const lockers: LockerWithRental[] = rawLockers.map((l) => ({
    ...l,
    rentals: l.rentals.map((r) => ({
      id: r.id,
      examNumber: r.examNumber,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate?.toISOString() ?? null,
      feeAmount: r.feeAmount,
      feeUnit: r.feeUnit,
      student: r.student,
    })),
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        시설 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">사물함 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        사물함 현황을 조회하고 대여를 관리합니다. 사물함을 클릭하면 상세 정보와 대여
        처리를 할 수 있습니다.
      </p>
      <div className="mt-8">
        <LockerBoard initialLockers={lockers} />
      </div>
    </div>
  );
}
