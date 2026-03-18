import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ExpiringActions } from "./expiring-actions";

export const dynamic = "force-dynamic";

const ZONE_LABEL: Record<string, string> = {
  CLASS_ROOM: "1강의실",
  JIDEOK_LEFT: "지덕 좌",
  JIDEOK_RIGHT: "지덕 우",
};

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function urgencyClass(days: number): string {
  if (days < 0) return "text-red-700 font-semibold";
  if (days < 3) return "text-red-600 font-semibold";
  if (days < 7) return "text-amber-600 font-semibold";
  return "text-ink";
}

function urgencyBadge(days: number): string {
  if (days < 0)
    return "inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700";
  if (days < 3)
    return "inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600";
  if (days < 7)
    return "inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700";
  return "inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700";
}

export default async function ExpiringLockersPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 30);

  // Fetch rentals expiring within 30 days (includes already-expired ACTIVE/EXPIRED)
  const rentals = await prisma.lockerRental.findMany({
    where: {
      status: { in: ["ACTIVE", "EXPIRED"] },
      endDate: { lte: cutoff },
    },
    include: {
      locker: {
        select: {
          id: true,
          zone: true,
          lockerNumber: true,
          row: true,
          col: true,
        },
      },
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
        },
      },
    },
    orderBy: { endDate: "asc" },
  });

  // Split: already expired vs expiring soon
  const alreadyExpired = rentals.filter(
    (r) => r.endDate && daysUntil(r.endDate) < 0,
  );
  const expiringSoon = rentals.filter(
    (r) => r.endDate && daysUntil(r.endDate) >= 0,
  );

  const totalCount = rentals.length;
  const expiredCount = alreadyExpired.length;
  const within3Days = expiringSoon.filter(
    (r) => r.endDate && daysUntil(r.endDate) < 3,
  ).length;
  const within7Days = expiringSoon.filter(
    (r) => r.endDate && daysUntil(r.endDate) < 7,
  ).length;

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
        시설 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">사물함 만료 임박</h1>
          <p className="mt-2 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            대여 종료일이 30일 이내인 사물함 목록입니다. 연장·반납 처리 또는 알림을 발송하세요.
          </p>
        </div>
        <Link
          href="/admin/lockers"
          className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          ← 전체 사물함
        </Link>
      </div>

      {/* Summary stats */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 text-center shadow-sm">
          <p className="text-2xl font-bold text-ink">{totalCount}</p>
          <p className="mt-1 text-xs text-slate">30일 이내 만료</p>
        </div>
        <div className="rounded-[20px] border border-red-200 bg-red-50 p-5 text-center">
          <p className="text-2xl font-bold text-red-700">{expiredCount}</p>
          <p className="mt-1 text-xs text-slate">이미 만료됨</p>
        </div>
        <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-5 text-center">
          <p className="text-2xl font-bold text-amber-700">{within3Days}</p>
          <p className="mt-1 text-xs text-slate">3일 이내 만료</p>
        </div>
        <div className="rounded-[20px] border border-sky-200 bg-sky-50 p-5 text-center">
          <p className="text-2xl font-bold text-sky-700">{within7Days}</p>
          <p className="mt-1 text-xs text-slate">7일 이내 만료</p>
        </div>
      </div>

      {/* Already expired section */}
      {alreadyExpired.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-red-700">이미 만료됨</h2>
            <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
              {expiredCount}건
            </span>
          </div>
          <p className="mt-1 text-xs text-slate">종료일이 오늘 이전이지만 아직 반납 처리가 안 된 사물함입니다.</p>
          <div className="mt-4 overflow-x-auto rounded-[20px] border border-red-200">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-red-100 bg-red-50 text-left">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-red-800">
                    사물함
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-red-800">
                    구역
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-red-800">
                    학생
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-red-800">
                    학번
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-red-800">
                    연락처
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-red-800">
                    종료일
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-red-800">
                    경과
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-red-800">
                    처리
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100 bg-white">
                {alreadyExpired.map((rental) => {
                  const days = rental.endDate ? daysUntil(rental.endDate) : 0;
                  return (
                    <tr key={rental.id} className="transition-colors hover:bg-red-50/40">
                      <td className="px-5 py-3 font-mono font-semibold text-ink">
                        <Link
                          href={`/admin/lockers/${rental.locker.id}`}
                          className="hover:text-ember hover:underline"
                        >
                          {rental.locker.lockerNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate">
                        {ZONE_LABEL[rental.locker.zone] ?? rental.locker.zone}
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/students/${rental.student.examNumber}`}
                          className="font-medium text-ink hover:text-ember hover:underline"
                        >
                          {rental.student.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate">
                        {rental.student.examNumber}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate">
                        {rental.student.phone ?? "—"}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate">
                        {rental.endDate ? formatDate(rental.endDate) : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className={urgencyBadge(days)}>
                          {Math.abs(days)}일 경과
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <ExpiringActions
                          rentalId={rental.id}
                          lockerNumber={rental.locker.lockerNumber}
                          studentName={rental.student.name}
                          examNumber={rental.student.examNumber}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Expiring soon section */}
      <section className="mt-8">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">30일 이내 만료 예정</h2>
          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            {expiringSoon.length}건
          </span>
        </div>

        {expiringSoon.length === 0 ? (
          <div className="mt-4 rounded-[20px] border border-dashed border-ink/10 py-10 text-center text-sm text-slate">
            30일 이내 만료 예정인 사물함이 없습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[20px] border border-ink/10">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist text-left">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    사물함
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    구역
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    학생
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    학번
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    연락처
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    종료일
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    잔여
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    처리
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5 bg-white">
                {expiringSoon.map((rental) => {
                  const days = rental.endDate ? daysUntil(rental.endDate) : 999;
                  return (
                    <tr key={rental.id} className="transition-colors hover:bg-mist/60">
                      <td className="px-5 py-3 font-mono font-semibold text-ink">
                        <Link
                          href={`/admin/lockers/${rental.locker.id}`}
                          className="hover:text-ember hover:underline"
                        >
                          {rental.locker.lockerNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate">
                        {ZONE_LABEL[rental.locker.zone] ?? rental.locker.zone}
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/students/${rental.student.examNumber}`}
                          className="font-medium text-ink hover:text-ember hover:underline"
                        >
                          {rental.student.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate">
                        {rental.student.examNumber}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate">
                        {rental.student.phone ?? "—"}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs">
                        <span className={urgencyClass(days)}>
                          {rental.endDate ? formatDate(rental.endDate) : "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={urgencyBadge(days)}>
                          {days}일 남음
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <ExpiringActions
                          rentalId={rental.id}
                          lockerNumber={rental.locker.lockerNumber}
                          studentName={rental.student.name}
                          examNumber={rental.student.examNumber}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Empty state */}
      {totalCount === 0 && (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 py-16 text-center text-sm text-slate">
          현재 30일 이내 만료되는 사물함이 없습니다.
        </div>
      )}
    </div>
  );
}
