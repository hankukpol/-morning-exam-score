import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { DiscountCodeManager } from "./discount-code-manager";

export const dynamic = "force-dynamic";

export default async function DiscountCodesSettingsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  sevenDaysLater.setHours(23, 59, 59, 999);

  const [codes, monthlyUsages, allUsages] = await Promise.all([
    prisma.discountCode.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: { staff: { select: { name: true } } },
    }),
    prisma.discountCodeUsage.count({
      where: { usedAt: { gte: startOfMonth } },
    }),
    // Fetch all usages with payment discount amounts for per-code stats
    prisma.discountCodeUsage.findMany({
      select: {
        codeId: true,
        usedAt: true,
        payment: { select: { discountAmount: true } },
      },
    }),
  ]);

  // Build per-code stats: { codeId -> { usageCount, totalDiscountAmount } }
  const codeStatsMap = new Map<number, { usageCount: number; totalDiscountAmount: number }>();
  for (const u of allUsages) {
    const prev = codeStatsMap.get(u.codeId) ?? { usageCount: 0, totalDiscountAmount: 0 };
    codeStatsMap.set(u.codeId, {
      usageCount: prev.usageCount + 1,
      totalDiscountAmount: prev.totalDiscountAmount + (u.payment?.discountAmount ?? 0),
    });
  }

  // Build monthly stats per code
  const monthlyCodeStatsMap = new Map<number, number>();
  for (const u of allUsages.filter((u) => u.usedAt >= startOfMonth)) {
    monthlyCodeStatsMap.set(u.codeId, (monthlyCodeStatsMap.get(u.codeId) ?? 0) + 1);
  }

  const activeCount = codes.filter((c) => c.isActive).length;
  const totalDiscountAmount = allUsages.reduce(
    (sum, u) => sum + (u.payment?.discountAmount ?? 0),
    0,
  );

  const expiringSoon = codes.filter((c) => {
    if (!c.validUntil || !c.isActive) return false;
    const until = new Date(c.validUntil);
    until.setHours(23, 59, 59, 999);
    return until >= now && until <= sevenDaysLater;
  });

  // Convert codeStatsMap to plain object for client serialization
  const codeStats: Record<number, { usageCount: number; totalDiscountAmount: number }> = {};
  for (const [id, stats] of codeStatsMap.entries()) {
    codeStats[id] = stats;
  }

  const kpi = {
    activeCount,
    monthlyUsages,
    totalDiscountAmount,
    expiringSoonCodes: expiringSoon.map((c) => ({
      id: c.id,
      code: c.code,
      validUntil: c.validUntil ? c.validUntil.toISOString().slice(0, 10) : null,
    })),
  };

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        P1-12 할인코드
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-3xl font-semibold">할인 코드 관리</h1>
        <Link
          href="/admin/settings/discount-codes/analytics"
          className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/10 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/20"
        >
          사용 현황 분석 →
        </Link>
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수강료 할인 코드를 생성하고 관리합니다. 비율(%) 또는 정액(원) 할인을 설정하고 유효 기간과 사용 횟수를 제한할 수 있습니다.
      </p>

      {/* KPI 카드 */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">활성 코드</p>
          <p className="mt-2 text-3xl font-bold text-ink tabular-nums">{activeCount}</p>
          <p className="mt-1 text-xs text-slate">현재 사용 가능한 코드</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">이번 달 사용</p>
          <p className="mt-2 text-3xl font-bold text-ink tabular-nums">{monthlyUsages}건</p>
          <p className="mt-1 text-xs text-slate">이번 달 할인 코드 적용 수</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">누적 할인 총액</p>
          <p className="mt-2 text-3xl font-bold text-ember tabular-nums">
            {totalDiscountAmount.toLocaleString()}원
          </p>
          <p className="mt-1 text-xs text-slate">코드 사용으로 발생한 총 할인</p>
        </div>
      </div>

      {/* 만료 임박 경고 */}
      {kpi.expiringSoonCodes.length > 0 && (
        <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-semibold text-amber-800">
            만료 임박 코드 ({kpi.expiringSoonCodes.length}개) — 7일 이내 만료
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {kpi.expiringSoonCodes.map((c) => (
              <a
                key={c.id}
                href={`/admin/settings/discount-codes/${c.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 transition hover:border-amber-500"
              >
                <span className="font-mono">{c.code}</span>
                <span className="text-amber-600">~ {c.validUntil}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <DiscountCodeManager initialCodes={codes as any} codeStats={codeStats} />
      </div>
    </div>
  );
}
