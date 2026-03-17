import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { LockerMapClient } from "./locker-map-client";

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
    status: string;
    student: {
      name: string;
      examNumber: string;
      generation: number | null;
    };
  }>;
};

export default async function LockersPage() {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const rawLockers = await getPrisma().locker.findMany({
    include: {
      rentals: {
        where: { status: { in: ["ACTIVE", "EXPIRED"] } },
        include: {
          student: {
            select: { name: true, examNumber: true, generation: true },
          },
        },
        orderBy: { startDate: "desc" },
        take: 1,
      },
    },
    orderBy: [{ zone: "asc" }, { lockerNumber: "asc" }],
  });

  const lockers: LockerWithRental[] = rawLockers.map((l) => ({
    ...l,
    rentals: l.rentals.map((r) => ({
      id: r.id,
      examNumber: r.examNumber,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate?.toISOString() ?? null,
      feeAmount: r.feeAmount,
      feeUnit: r.feeUnit,
      status: r.status,
      student: r.student,
    })),
  }));

  const total = lockers.length;
  const inUse = lockers.filter((l) => l.status === "IN_USE").length;
  const available = lockers.filter((l) => l.status === "AVAILABLE").length;

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        시설 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">사물함 배치도</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        구역별 사물함 현황을 배치도로 확인합니다. 사물함을 클릭하면 대여 정보와 배정·반납 처리를 할 수 있습니다.
        총{" "}
        <span className="font-semibold text-ink">{total}개</span> 중{" "}
        <span className="font-semibold text-ember">{inUse}개</span> 사용 중,{" "}
        <span className="font-semibold text-forest">{available}개</span> 공석.
      </p>

      {total === 0 && (
        <div className="mt-6 rounded-[20px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          사물함이 없습니다.{" "}
          <a
            href="/admin/settings/lockers"
            className="font-semibold underline underline-offset-2"
          >
            사물함 초기 설정
          </a>
          에서 사물함을 먼저 생성해주세요.
        </div>
      )}

      <div className="mt-8">
        <LockerMapClient initialLockers={lockers} />
      </div>
    </div>
  );
}
