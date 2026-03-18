import { AdminRole, CodeType, DiscountType } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const CODE_TYPE_LABEL: Record<CodeType, string> = {
  REFERRAL: "추천인",
  ENROLLMENT: "입소",
  CAMPAIGN: "캠페인",
};

const DISCOUNT_TYPE_LABEL: Record<DiscountType, string> = {
  RATE: "정률(%)",
  FIXED: "정액(원)",
};

function formatKRW(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만원`;
  return `${n.toLocaleString()}원`;
}

function parseMonthParam(raw: string | string[] | undefined): { year: number; month: number } {
  const str = Array.isArray(raw) ? raw[0] : raw;
  if (str && /^\d{4}-\d{2}$/.test(str)) {
    const [y, m] = str.split("-").map(Number);
    if (y && m && m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default async function DiscountCodeAnalyticsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const sp = searchParams ? await searchParams : {};
  const { year, month } = parseMonthParam(sp.month);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // ─── All discount codes ─────────────────────────────────────────────────
  const allCodes = await getPrisma()
    .discountCode.findMany({
      select: {
        id: true,
        code: true,
        type: true,
        discountType: true,
        discountValue: true,
        maxUsage: true,
        usageCount: true,
        validFrom: true,
        validUntil: true,
        isActive: true,
        createdAt: true,
        usages: {
          select: {
            id: true,
            usedAt: true,
            payment: { select: { netAmount: true, discountAmount: true } },
          },
        },
      },
      orderBy: { usageCount: "desc" },
    })
    .catch(
      () =>
        [] as {
          id: number;
          code: string;
          type: CodeType;
          discountType: DiscountType;
          discountValue: number;
          maxUsage: number | null;
          usageCount: number;
          validFrom: Date;
          validUntil: Date | null;
          isActive: boolean;
          createdAt: Date;
          usages: {
            id: number;
            usedAt: Date;
            payment: { netAmount: number; discountAmount: number };
          }[];
        }[]
    );

  // Status buckets
  const activeCodes = allCodes.filter(
    (c) => c.isActive && (!c.validUntil || c.validUntil >= today)
  );
  const expiredCodes = allCodes.filter(
    (c) => c.validUntil && c.validUntil < today
  );
  const disabledCodes = allCodes.filter(
    (c) => !c.isActive && (!c.validUntil || c.validUntil >= today)
  );
  const unusedCodes = allCodes.filter((c) => c.usageCount === 0);

  // Total discount applied (sum of payment.discountAmount for usages that came from codes)
  // We compute per-code total discount as discountAmount of each usage's payment
  const totalDiscountApplied = allCodes.reduce((sum, c) => {
    return (
      sum + c.usages.reduce((s, u) => s + (u.payment?.discountAmount ?? 0), 0)
    );
  }, 0);

  // Top 10 most used codes
  const top10 = allCodes
    .filter((c) => c.usageCount > 0)
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 10)
    .map((c) => ({
      id: c.id,
      code: c.code,
      type: c.type,
      discountType: c.discountType,
      discountValue: c.discountValue,
      usageCount: c.usageCount,
      totalDiscount: c.usages.reduce(
        (s, u) => s + (u.payment?.discountAmount ?? 0),
        0
      ),
    }));

  // ─── Monthly usage trend (last 6 months) ───────────────────────────────
  const monthStart = new Date(year, month - 1, 1);
  const sixMonthsStart = new Date(year, month - 7, 1);
  const monthEnd = new Date(year, month, 1);

  // flatten all usages across all codes
  const allUsages = allCodes.flatMap((c) =>
    c.usages.map((u) => ({
      usedAt: u.usedAt,
      discountAmount: u.payment?.discountAmount ?? 0,
    }))
  );

  const trendMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(year, month - 6 + i, 1);
    const y2 = d.getFullYear();
    const m2 = d.getMonth() + 1;
    const start = new Date(y2, m2 - 1, 1);
    const end = new Date(y2, m2, 1);
    const usages = allUsages.filter(
      (u) => u.usedAt >= start && u.usedAt < end
    );
    return {
      label: `${y2}.${String(m2).padStart(2, "0")}`,
      count: usages.length,
      totalDiscount: usages.reduce((s, u) => s + u.discountAmount, 0),
    };
  });

  // Month navigation
  const prevDate = new Date(year, month - 2, 1);
  const nextDate = new Date(year, month, 1);
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;
  const prevParam = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const nextParam = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
  const currentParam = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // This month usage
  const thisMonthUsages = allUsages.filter(
    (u) => u.usedAt >= monthStart && u.usedAt < monthEnd
  );

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        할인코드 분석
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">할인코드 분석</h1>
          <p className="mt-2 text-sm text-slate">
            {year}년 {month}월 · 코드 현황 및 사용 추이
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`?month=${prevParam}`}
            className="rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist"
          >
            ← 이전달
          </Link>
          {!isCurrentMonth && (
            <Link
              href={`?month=${currentParam}`}
              className="rounded-lg border border-ember/20 bg-ember/5 px-3 py-1.5 text-sm text-ember hover:bg-ember/10"
            >
              이번달
            </Link>
          )}
          {!isCurrentMonth && (
            <Link
              href={`?month=${nextParam}`}
              className="rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist"
            >
              다음달 →
            </Link>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          {
            label: "전체 코드 수",
            value: `${allCodes.length}개`,
            sub: `활성 ${activeCodes.length} / 만료 ${expiredCodes.length} / 비활성 ${disabledCodes.length}`,
            highlight: false,
          },
          {
            label: "총 할인 적용액",
            value: formatKRW(totalDiscountApplied),
            sub: "전체 기간 누적",
            highlight: true,
          },
          {
            label: "이번 달 사용 수",
            value: `${thisMonthUsages.length}건`,
            sub: `할인 ${formatKRW(thisMonthUsages.reduce((s, u) => s + u.discountAmount, 0))}`,
            highlight: false,
          },
          {
            label: "미사용 코드",
            value: `${unusedCodes.length}개`,
            sub: "한 번도 사용 안 됨",
            highlight: false,
          },
        ].map(({ label, value, sub, highlight }) => (
          <div
            key={label}
            className={`rounded-[24px] border p-5 shadow-sm ${
              highlight ? "border-forest/30 bg-forest/5" : "border-ink/10 bg-white"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-widest text-slate">{label}</p>
            <p
              className={`mt-2 text-2xl font-bold ${
                highlight ? "text-forest" : "text-ink"
              }`}
            >
              {value}
            </p>
            <p className="mt-1 text-xs text-slate">{sub}</p>
          </div>
        ))}
      </div>

      {/* Top 10 most used codes */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-ink">TOP 10 사용 코드</h2>
        <p className="mt-1 text-xs text-slate">사용 횟수 기준 상위 10개 코드</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs font-medium text-slate">
                <th className="pb-2 pr-2">순위</th>
                <th className="pb-2 pr-4">코드</th>
                <th className="pb-2 pr-4">유형</th>
                <th className="pb-2 pr-4">할인 방식</th>
                <th className="pb-2 pr-4">할인 값</th>
                <th className="pb-2 pr-4 text-right">사용 횟수</th>
                <th className="pb-2 text-right">할인 총액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {top10.map((c, idx) => (
                <tr key={c.id}>
                  <td className="py-2.5 pr-2">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        idx === 0
                          ? "bg-amber-100 text-amber-700"
                          : idx === 1
                          ? "bg-slate-100 text-slate-600"
                          : idx === 2
                          ? "bg-orange-100 text-orange-700"
                          : "bg-ink/5 text-slate"
                      }`}
                    >
                      {idx + 1}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 font-mono font-medium text-ink">
                    {c.code}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="rounded-full bg-forest/10 px-2 py-0.5 text-xs text-forest">
                      {CODE_TYPE_LABEL[c.type]}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-slate">
                    {DISCOUNT_TYPE_LABEL[c.discountType]}
                  </td>
                  <td className="py-2.5 pr-4">
                    {c.discountType === "RATE"
                      ? `${c.discountValue}%`
                      : formatKRW(c.discountValue)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-semibold">
                    {c.usageCount.toLocaleString()}회
                  </td>
                  <td className="py-2.5 text-right text-ember font-semibold">
                    {c.totalDiscount > 0 ? formatKRW(c.totalDiscount) : "—"}
                  </td>
                </tr>
              ))}
              {top10.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate">
                    사용된 할인코드가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6-month usage trend */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-ink">최근 6개월 코드 사용 추이</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs font-medium text-slate">
                <th className="pb-2 pr-4">월</th>
                <th className="pb-2 pr-4 text-right">사용 건수</th>
                <th className="pb-2 pr-4 text-right">할인 총액</th>
                <th className="pb-2 text-right">추이</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {trendMonths.map((row) => {
                const maxCount = Math.max(...trendMonths.map((r) => r.count), 1);
                const isSelected =
                  row.label === `${year}.${String(month).padStart(2, "0")}`;
                return (
                  <tr key={row.label} className={isSelected ? "bg-forest/5" : ""}>
                    <td className="py-2.5 pr-4 font-medium">
                      {row.label}
                      {isSelected && (
                        <span className="ml-2 rounded-full bg-forest/10 px-1.5 py-0.5 text-xs text-forest">
                          선택
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      {row.count > 0 ? `${row.count}건` : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      {row.totalDiscount > 0 ? formatKRW(row.totalDiscount) : "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-ink/5">
                          <div
                            className="h-full rounded-full bg-forest/60"
                            style={{
                              width: `${((row.count / maxCount) * 100).toFixed(1)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unused codes */}
      {unusedCodes.length > 0 && (
        <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-ink">
            미사용 코드
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {unusedCodes.length}개
            </span>
          </h2>
          <p className="mt-1 text-xs text-slate">생성 후 한 번도 사용되지 않은 코드 목록</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-medium text-slate">
                  <th className="pb-2 pr-4">코드</th>
                  <th className="pb-2 pr-4">유형</th>
                  <th className="pb-2 pr-4">할인 방식</th>
                  <th className="pb-2 pr-4">할인 값</th>
                  <th className="pb-2 pr-4">유효 기간</th>
                  <th className="pb-2">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {unusedCodes.slice(0, 20).map((c) => {
                  const isExpired = c.validUntil && c.validUntil < today;
                  return (
                    <tr key={c.id}>
                      <td className="py-2.5 pr-4 font-mono font-medium text-ink">
                        {c.code}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="rounded-full bg-forest/10 px-2 py-0.5 text-xs text-forest">
                          {CODE_TYPE_LABEL[c.type]}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-slate">
                        {DISCOUNT_TYPE_LABEL[c.discountType]}
                      </td>
                      <td className="py-2.5 pr-4">
                        {c.discountType === "RATE"
                          ? `${c.discountValue}%`
                          : formatKRW(c.discountValue)}
                      </td>
                      <td className="py-2.5 pr-4 text-slate">
                        {c.validUntil
                          ? `~${c.validUntil.toLocaleDateString("ko-KR")}`
                          : "무기한"}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            isExpired
                              ? "bg-red-50 text-red-600"
                              : !c.isActive
                              ? "bg-slate-100 text-slate-600"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {isExpired ? "만료" : !c.isActive ? "비활성" : "활성"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {unusedCodes.length > 20 && (
                  <tr>
                    <td colSpan={6} className="py-2 text-center text-xs text-slate">
                      외 {unusedCodes.length - 20}개 더 있음
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="mt-6 flex flex-wrap gap-3 rounded-[24px] border border-ink/10 bg-white p-5 shadow-sm">
        <Link href="/admin/settings/discount-codes" className="text-sm text-forest hover:underline">
          할인코드 관리 →
        </Link>
        <Link href="/admin/analytics/payments" className="text-sm text-slate hover:underline">
          결제 수단 분석 →
        </Link>
        <Link href="/admin/analytics/revenue" className="text-sm text-slate hover:underline">
          연간 수납 분석 →
        </Link>
      </div>
    </div>
  );
}
