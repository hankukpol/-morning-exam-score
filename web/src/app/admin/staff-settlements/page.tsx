import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SettlementTable } from "./settlement-table";

export const dynamic = "force-dynamic";

function parseYearMonth(
  yearParam: string | null | undefined,
  monthParam: string | null | undefined
): { year: number; month: number } {
  const today = new Date();
  const year = yearParam ? parseInt(yearParam, 10) : today.getFullYear();
  const month = monthParam ? parseInt(monthParam, 10) : today.getMonth() + 1;
  return {
    year: isNaN(year) ? today.getFullYear() : year,
    month: isNaN(month) ? today.getMonth() + 1 : Math.max(1, Math.min(12, month)),
  };
}

export default async function StaffSettlementsPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string };
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const { year, month } = parseYearMonth(searchParams.year, searchParams.month);

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0, 23, 59, 59, 999);

  // Get all active staff with linked AdminUser
  const staffList = await getPrisma().staff.findMany({
    where: { isActive: true, adminUserId: { not: null } },
    select: {
      id: true,
      name: true,
      role: true,
      adminUserId: true,
    },
    orderBy: { name: "asc" },
  });

  const adminUserIds = staffList
    .map((s) => s.adminUserId)
    .filter((id): id is string => id !== null);

  // Aggregate payments grouped by processedBy
  const paymentAggregates =
    adminUserIds.length > 0
      ? await getPrisma().payment.groupBy({
          by: ["processedBy"],
          where: {
            processedBy: { in: adminUserIds },
            processedAt: { gte: firstDay, lte: lastDay },
            status: { notIn: ["CANCELLED"] },
          },
          _count: { id: true },
          _sum: { netAmount: true },
        })
      : [];

  const aggregateMap = new Map(
    paymentAggregates.map((agg) => [
      agg.processedBy,
      { count: agg._count.id, total: agg._sum.netAmount ?? 0 },
    ])
  );

  const settlements = staffList.map((staff) => {
    const adminId = staff.adminUserId ?? "";
    const agg = aggregateMap.get(adminId);
    return {
      staffId: staff.id,
      staffName: staff.name,
      staffRole: staff.role as string,
      adminUserId: adminId,
      paymentCount: agg?.count ?? 0,
      totalRevenue: agg?.total ?? 0,
    };
  });

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        직원 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">직원 정산</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        직원별 월 수납 처리 건수와 총액을 기준으로 배분율을 입력하여 정산 금액을 확인합니다.
        배분율은 수동 입력이며 저장되지 않습니다. 엑셀 다운로드 시 입력된 배분율이 반영됩니다.
      </p>

      {/* Period summary badge */}
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-medium text-forest">
        <span>
          {year}년 {month}월 정산
        </span>
      </div>

      {/* Main content */}
      <div className="mt-8">
        <SettlementTable year={year} month={month} settlements={settlements} />
      </div>
    </div>
  );
}
