import { AdminRole, PaymentCategory, PaymentMethod, PaymentStatus } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const CATEGORY_LABEL: Record<PaymentCategory, string> = {
  TUITION: "수강료",
  FACILITY: "시설비",
  TEXTBOOK: "교재",
  MATERIAL: "교구·소모품",
  SINGLE_COURSE: "단과 POS",
  PENALTY: "위약금",
  ETC: "기타",
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  POINT: "포인트",
  MIXED: "혼합",
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

export default async function PaymentMethodAnalyticsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const sp = searchParams ? await searchParams : {};
  const { year, month } = parseMonthParam(sp.month);

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  // ─── Approved payments in selected month ────────────────────────────────
  const payments = await getPrisma()
    .payment.findMany({
      where: {
        status: { in: [PaymentStatus.APPROVED, PaymentStatus.PARTIAL_REFUNDED] },
        processedAt: { gte: monthStart, lt: monthEnd },
      },
      select: {
        id: true,
        category: true,
        method: true,
        grossAmount: true,
        netAmount: true,
        discountAmount: true,
        processedAt: true,
      },
    })
    .catch(() => [] as {
      id: string;
      category: PaymentCategory;
      method: PaymentMethod;
      grossAmount: number;
      netAmount: number;
      discountAmount: number;
      processedAt: Date;
    }[]);

  // Completed refunds in selected month
  const refunds = await getPrisma()
    .refund.findMany({
      where: {
        status: "COMPLETED",
        processedAt: { gte: monthStart, lt: monthEnd },
      },
      select: { amount: true, payment: { select: { method: true } } },
    })
    .catch(() => [] as { amount: number; payment: { method: PaymentMethod } }[]);

  // ─── Method breakdown ───────────────────────────────────────────────────
  const methodStats = new Map<
    PaymentMethod,
    { count: number; total: number; refunds: number }
  >();
  for (const p of payments) {
    const cur = methodStats.get(p.method) ?? { count: 0, total: 0, refunds: 0 };
    cur.count += 1;
    cur.total += p.netAmount;
    methodStats.set(p.method, cur);
  }
  for (const r of refunds) {
    const m = r.payment.method;
    const cur = methodStats.get(m) ?? { count: 0, total: 0, refunds: 0 };
    cur.refunds += r.amount;
    methodStats.set(m, cur);
  }

  // ─── Category breakdown ─────────────────────────────────────────────────
  const categoryStats = new Map<PaymentCategory, { count: number; total: number }>();
  for (const p of payments) {
    const cur = categoryStats.get(p.category) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += p.netAmount;
    categoryStats.set(p.category, cur);
  }

  // ─── Last 6 months trend ────────────────────────────────────────────────
  const sixMonthsStart = new Date(year, month - 7, 1);
  const trendPayments = await getPrisma()
    .payment.findMany({
      where: {
        status: { in: [PaymentStatus.APPROVED, PaymentStatus.PARTIAL_REFUNDED] },
        processedAt: { gte: sixMonthsStart, lt: monthEnd },
      },
      select: { netAmount: true, processedAt: true },
    })
    .catch(() => [] as { netAmount: number; processedAt: Date }[]);

  const trendRefunds = await getPrisma()
    .refund.findMany({
      where: {
        status: "COMPLETED",
        processedAt: { gte: sixMonthsStart, lt: monthEnd },
      },
      select: { amount: true, processedAt: true },
    })
    .catch(() => [] as { amount: true; processedAt: Date }[]);

  const trendMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(year, month - 6 + i, 1);
    const y2 = d.getFullYear();
    const m2 = d.getMonth() + 1;
    const start = new Date(y2, m2 - 1, 1);
    const end = new Date(y2, m2, 1);

    const gross = trendPayments
      .filter((p) => p.processedAt >= start && p.processedAt < end)
      .reduce((s, p) => s + p.netAmount, 0);

    const refunded = trendRefunds
      .filter((r) => r.processedAt >= start && r.processedAt < end)
      .reduce((s, r) => s + (r as unknown as { amount: number }).amount, 0);

    return { label: `${y2}.${String(m2).padStart(2, "0")}`, gross, refunded, net: gross - refunded };
  });

  // ─── Totals ─────────────────────────────────────────────────────────────
  const totalNet = payments.reduce((s, p) => s + p.netAmount, 0);
  const totalRefunds = refunds.reduce((s, r) => s + r.amount, 0);
  const totalDiscount = payments.reduce((s, p) => s + p.discountAmount, 0);
  const totalCount = payments.length;

  // Average by method
  const methodAvg = (method: PaymentMethod): number => {
    const stat = methodStats.get(method);
    if (!stat || stat.count === 0) return 0;
    return Math.round(stat.total / stat.count);
  };

  // Refund rate by method
  const methodRefundRate = (method: PaymentMethod): number => {
    const stat = methodStats.get(method);
    if (!stat || stat.total === 0) return 0;
    return (stat.refunds / (stat.total + stat.refunds)) * 100;
  };

  // Month navigation
  const prevDate = new Date(year, month - 2, 1);
  const nextDate = new Date(year, month, 1);
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const prevParam = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const nextParam = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
  const currentParam = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        결제 수단 분석
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">결제 수단 분석</h1>
          <p className="mt-2 text-sm text-slate">
            {year}년 {month}월 · 결제수단·항목별 수납 현황 및 환불율
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
          { label: "총 수납 건수", value: `${totalCount}건`, sub: "승인 완료 기준", highlight: false },
          { label: "총 수납액", value: formatKRW(totalNet), sub: "순 수납 합계", highlight: true },
          { label: "할인 총계", value: formatKRW(totalDiscount), sub: "적용된 할인액", highlight: false },
          { label: "환불 총계", value: formatKRW(totalRefunds), sub: `${refunds.length}건`, highlight: false },
        ].map(({ label, value, sub, highlight }) => (
          <div
            key={label}
            className={`rounded-[24px] border p-5 shadow-sm ${
              highlight ? "border-ember/30 bg-ember/5" : "border-ink/10 bg-white"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-widest text-slate">{label}</p>
            <p className={`mt-2 text-2xl font-bold ${highlight ? "text-ember" : "text-ink"}`}>
              {value}
            </p>
            <p className="mt-1 text-xs text-slate">{sub}</p>
          </div>
        ))}
      </div>

      {/* Method breakdown table */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-ink">결제 수단별 상세</h2>
        <p className="mt-1 text-xs text-slate">건수 · 합계 · 평균 · 환불율</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs font-medium text-slate">
                <th className="pb-2 pr-4">결제 수단</th>
                <th className="pb-2 pr-4 text-right">건수</th>
                <th className="pb-2 pr-4 text-right">수납 합계</th>
                <th className="pb-2 pr-4 text-right">건당 평균</th>
                <th className="pb-2 pr-4 text-right">환불액</th>
                <th className="pb-2 text-right">환불율</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {(Object.keys(METHOD_LABEL) as PaymentMethod[])
                .filter((m) => methodStats.has(m))
                .sort((a, b) => (methodStats.get(b)?.total ?? 0) - (methodStats.get(a)?.total ?? 0))
                .map((method) => {
                  const stat = methodStats.get(method)!;
                  const rate = methodRefundRate(method);
                  return (
                    <tr key={method}>
                      <td className="py-2.5 pr-4 font-medium">{METHOD_LABEL[method]}</td>
                      <td className="py-2.5 pr-4 text-right">{stat.count}건</td>
                      <td className="py-2.5 pr-4 text-right">{formatKRW(stat.total)}</td>
                      <td className="py-2.5 pr-4 text-right">{formatKRW(methodAvg(method))}</td>
                      <td className="py-2.5 pr-4 text-right text-red-600">
                        {stat.refunds > 0 ? `-${formatKRW(stat.refunds)}` : "—"}
                      </td>
                      <td className="py-2.5 text-right">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            rate > 10
                              ? "bg-red-50 text-red-600"
                              : rate > 5
                              ? "bg-amber-50 text-amber-700"
                              : "bg-green-50 text-green-700"
                          }`}
                        >
                          {rate.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              {methodStats.size === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate">
                    해당 월에 수납 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
            {methodStats.size > 0 && (
              <tfoot>
                <tr className="border-t border-ink/20 font-semibold">
                  <td className="pt-2 pr-4">합계</td>
                  <td className="pt-2 pr-4 text-right">{totalCount}건</td>
                  <td className="pt-2 pr-4 text-right text-ember">{formatKRW(totalNet)}</td>
                  <td className="pt-2 pr-4 text-right">
                    {totalCount > 0 ? formatKRW(Math.round(totalNet / totalCount)) : "—"}
                  </td>
                  <td className="pt-2 pr-4 text-right text-red-600">
                    {totalRefunds > 0 ? `-${formatKRW(totalRefunds)}` : "—"}
                  </td>
                  <td className="pt-2 text-right">
                    {totalNet + totalRefunds > 0
                      ? `${((totalRefunds / (totalNet + totalRefunds)) * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-ink">수납 항목별 분류</h2>
        <p className="mt-1 text-xs text-slate">PaymentCategory 기준</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs font-medium text-slate">
                <th className="pb-2 pr-4">항목</th>
                <th className="pb-2 pr-4 text-right">건수</th>
                <th className="pb-2 pr-4 text-right">합계</th>
                <th className="pb-2 text-right">비율</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {Array.from(categoryStats.entries())
                .sort((a, b) => b[1].total - a[1].total)
                .map(([cat, stat]) => (
                  <tr key={cat}>
                    <td className="py-2.5 pr-4 font-medium">{CATEGORY_LABEL[cat]}</td>
                    <td className="py-2.5 pr-4 text-right">{stat.count}건</td>
                    <td className="py-2.5 pr-4 text-right">{formatKRW(stat.total)}</td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink/5">
                          <div
                            className="h-full rounded-full bg-ember"
                            style={{
                              width: totalNet > 0
                                ? `${Math.min(100, (stat.total / totalNet) * 100).toFixed(1)}%`
                                : "0%",
                            }}
                          />
                        </div>
                        <span className="w-10 text-xs text-slate">
                          {totalNet > 0
                            ? `${((stat.total / totalNet) * 100).toFixed(1)}%`
                            : "—"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              {categoryStats.size === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate">
                    해당 월에 수납 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6-month trend */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-ink">최근 6개월 수납 추이</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs font-medium text-slate">
                <th className="pb-2 pr-4">월</th>
                <th className="pb-2 pr-4 text-right">수납</th>
                <th className="pb-2 pr-4 text-right">환불</th>
                <th className="pb-2 pr-4 text-right">순수납</th>
                <th className="pb-2 text-right">추이</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {trendMonths.map((row, idx) => {
                const maxGross = Math.max(...trendMonths.map((r) => r.gross), 1);
                const isSelected =
                  row.label ===
                  `${year}.${String(month).padStart(2, "0")}`;
                return (
                  <tr key={row.label} className={isSelected ? "bg-ember/5" : ""}>
                    <td className="py-2.5 pr-4 font-medium">
                      {row.label}
                      {isSelected && (
                        <span className="ml-2 rounded-full bg-ember/10 px-1.5 py-0.5 text-xs text-ember">
                          선택
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      {row.gross > 0 ? formatKRW(row.gross) : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-red-600">
                      {row.refunded > 0 ? `-${formatKRW(row.refunded)}` : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-medium">
                      {row.gross > 0 ? formatKRW(row.net) : "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-ink/5">
                          <div
                            className="h-full rounded-full bg-forest/60"
                            style={{
                              width: `${((row.gross / maxGross) * 100).toFixed(1)}%`,
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

      {/* Quick links */}
      <div className="mt-6 flex flex-wrap gap-3 rounded-[24px] border border-ink/10 bg-white p-5 shadow-sm">
        <Link href="/admin/payments" className="text-sm text-ember hover:underline">
          수납 내역 →
        </Link>
        <Link href="/admin/settlements/daily" className="text-sm text-slate hover:underline">
          일계표 →
        </Link>
        <Link href="/admin/settlements/monthly" className="text-sm text-slate hover:underline">
          월계표 →
        </Link>
        <Link href="/admin/analytics/revenue" className="text-sm text-slate hover:underline">
          연간 수납 분석 →
        </Link>
        <Link href="/admin/analytics/discounts" className="text-sm text-slate hover:underline">
          할인코드 분석 →
        </Link>
      </div>
    </div>
  );
}
