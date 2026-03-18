import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(
  searchParams: PageProps["searchParams"],
  key: string,
): string | undefined {
  const val = searchParams?.[key];
  return Array.isArray(val) ? val[0] : val;
}

function parseMonthParam(
  param: string | undefined,
): { year: number; month: number } {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function fmtKRW(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function prevMonth(year: number, month: number): string {
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(year: number, month: number): string {
  const d = new Date(year, month, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const CODE_TYPE_LABEL: Record<string, string> = {
  REFERRAL: "추천인",
  ENROLLMENT: "입소",
  CAMPAIGN: "캠페인",
};

const DISCOUNT_TYPE_LABEL: Record<string, string> = {
  RATE: "%",
  FIXED: "원",
};

const CODE_TYPE_COLOR: Record<string, string> = {
  REFERRAL: "bg-sky-50 text-sky-700 border-sky-200",
  ENROLLMENT: "bg-forest/10 text-forest border-forest/20",
  CAMPAIGN: "bg-amber-50 text-amber-700 border-amber-200",
};

export default async function DiscountCodeReportPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const monthParam = readParam(searchParams, "month");
  const { year, month } = parseMonthParam(monthParam);
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const monthLabel = `${year}년 ${month}월`;

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const prisma = getPrisma();

  // 모든 할인 코드 조회
  const allCodes = await prisma.discountCode.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      code: true,
      type: true,
      discountType: true,
      discountValue: true,
      maxUsage: true,
      usageCount: true,
      isActive: true,
      validFrom: true,
      validUntil: true,
      createdAt: true,
      staff: { select: { name: true } },
    },
  });

  // 이번 달 사용 이력
  const usages = await prisma.discountCodeUsage.findMany({
    where: {
      usedAt: { gte: monthStart, lte: monthEnd },
    },
    select: {
      codeId: true,
      usedAt: true,
      payment: { select: { discountAmount: true } },
    },
  });

  // 코드별 집계
  type CodeStats = {
    usageCount: number;
    totalDiscountAmount: number;
    lastUsedAt: Date | null;
  };
  const codeStatsMap = new Map<number, CodeStats>();
  for (const u of usages) {
    const prev = codeStatsMap.get(u.codeId) ?? {
      usageCount: 0,
      totalDiscountAmount: 0,
      lastUsedAt: null,
    };
    codeStatsMap.set(u.codeId, {
      usageCount: prev.usageCount + 1,
      totalDiscountAmount:
        prev.totalDiscountAmount + (u.payment?.discountAmount ?? 0),
      lastUsedAt:
        prev.lastUsedAt === null || u.usedAt > prev.lastUsedAt
          ? u.usedAt
          : prev.lastUsedAt,
    });
  }

  // 코드 목록 정리 및 정렬 (사용 수 내림차순)
  const codeRows = allCodes
    .map((c) => {
      const stats = codeStatsMap.get(c.id) ?? {
        usageCount: 0,
        totalDiscountAmount: 0,
        lastUsedAt: null,
      };
      const usageRate =
        c.maxUsage && c.maxUsage > 0
          ? Math.round((stats.usageCount / c.maxUsage) * 1000) / 10
          : null;
      return {
        ...c,
        validFrom: c.validFrom.toISOString(),
        validUntil: c.validUntil ? c.validUntil.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
        filteredUsageCount: stats.usageCount,
        filteredTotalDiscountAmount: stats.totalDiscountAmount,
        filteredLastUsedAt: stats.lastUsedAt
          ? stats.lastUsedAt.toISOString()
          : null,
        usageRate,
      };
    })
    .sort((a, b) => b.filteredUsageCount - a.filteredUsageCount);

  // 요약 통계
  const totalIssued = allCodes.length;
  const totalUsed = codeRows.filter((c) => c.filteredUsageCount > 0).length;
  const totalDiscountAmount = codeRows.reduce(
    (sum, c) => sum + c.filteredTotalDiscountAmount,
    0,
  );
  const totalUsageCount = codeRows.reduce(
    (sum, c) => sum + c.filteredUsageCount,
    0,
  );

  const prevMonthStr = prevMonth(year, month);
  const nextMonthStr = nextMonth(year, month);
  const now = new Date();
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "보고서", href: "/admin/reports" },
          { label: "할인코드 사용 현황" },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">할인코드 사용 현황</h1>
          <p className="mt-1 text-sm text-slate">
            코드별 발급 및 사용 통계 · {monthLabel} 기준
          </p>
        </div>

        {/* 월 선택 네비게이션 */}
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/reports/discount-codes?month=${prevMonthStr}`}
            className="rounded-full border border-ink/10 px-3 py-2 text-sm text-slate transition hover:border-ink/30 hover:text-ink"
          >
            ← 이전달
          </Link>
          <form method="GET" className="flex items-center gap-2">
            <input
              type="month"
              name="month"
              defaultValue={monthStr}
              className="rounded-2xl border border-ink/10 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/30"
            />
            <button
              type="submit"
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest"
            >
              조회
            </button>
          </form>
          {!isCurrentMonth && (
            <Link
              href={`/admin/reports/discount-codes?month=${nextMonthStr}`}
              className="rounded-full border border-ink/10 px-3 py-2 text-sm text-slate transition hover:border-ink/30 hover:text-ink"
            >
              다음달 →
            </Link>
          )}
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">총 발급 코드</p>
          <p className="mt-1 text-2xl font-bold text-ink">{totalIssued}개</p>
          <p className="mt-0.5 text-xs text-slate">전체 누적</p>
        </div>
        <div className="rounded-[24px] border border-forest/20 bg-forest/5 p-5">
          <p className="text-xs font-medium text-forest">사용된 코드</p>
          <p className="mt-1 text-2xl font-bold text-forest">{totalUsed}개</p>
          <p className="mt-0.5 text-xs text-slate">{monthLabel}</p>
        </div>
        <div className="rounded-[24px] border border-ember/20 bg-ember/5 p-5">
          <p className="text-xs font-medium text-ember">총 할인액</p>
          <p className="mt-1 text-2xl font-bold text-ember">
            {fmtKRW(totalDiscountAmount)}
          </p>
          <p className="mt-0.5 text-xs text-slate">{monthLabel}</p>
        </div>
        <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-5">
          <p className="text-xs font-medium text-sky-600">총 사용 건수</p>
          <p className="mt-1 text-2xl font-bold text-sky-700">
            {totalUsageCount}건
          </p>
          <p className="mt-0.5 text-xs text-slate">{monthLabel}</p>
        </div>
      </div>

      {/* 할인 코드 테이블 */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">코드별 상세 현황</h2>
          <Link
            href="/admin/settings/discount-codes"
            className="text-xs font-medium text-slate transition hover:text-ember"
          >
            코드 관리 →
          </Link>
        </div>

        {codeRows.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-12 text-center">
            <p className="text-sm font-medium text-ink">등록된 할인 코드 없음</p>
            <p className="mt-1 text-xs text-slate">
              할인 코드를 먼저 등록해 주세요.
            </p>
            <Link
              href="/admin/settings/discount-codes"
              className="mt-4 inline-flex items-center rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
            >
              코드 등록
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[24px] border border-ink/10 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist/60 text-left">
                  <tr>
                    <th className="px-5 py-3 font-semibold">코드</th>
                    <th className="px-5 py-3 font-semibold">유형</th>
                    <th className="px-5 py-3 font-semibold">할인</th>
                    <th className="px-5 py-3 font-semibold">발급 한도</th>
                    <th className="px-5 py-3 font-semibold">사용 수</th>
                    <th className="px-5 py-3 font-semibold">사용율</th>
                    <th className="px-5 py-3 font-semibold">총 할인액</th>
                    <th className="px-5 py-3 font-semibold">최근 사용일</th>
                    <th className="px-5 py-3 font-semibold">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {codeRows.map((c) => (
                    <tr
                      key={c.id}
                      className={`transition hover:bg-mist/40 ${!c.isActive ? "opacity-50" : ""}`}
                    >
                      <td className="px-5 py-4">
                        <span className="font-mono text-sm font-semibold text-ink">
                          {c.code}
                        </span>
                        {c.staff && (
                          <p className="text-xs text-slate">
                            등록: {c.staff.name}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${CODE_TYPE_COLOR[c.type] ?? "bg-ink/5 text-slate border-ink/10"}`}
                        >
                          {CODE_TYPE_LABEL[c.type] ?? c.type}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-medium">
                        {c.discountType === "RATE"
                          ? `${c.discountValue}%`
                          : fmtKRW(c.discountValue)}
                        <span className="ml-1 text-xs text-slate">
                          ({DISCOUNT_TYPE_LABEL[c.discountType] ?? c.discountType})
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate">
                        {c.maxUsage ? `${c.maxUsage}회` : "무제한"}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={
                            c.filteredUsageCount > 0
                              ? "font-semibold text-forest"
                              : "text-slate"
                          }
                        >
                          {c.filteredUsageCount}건
                        </span>
                        <p className="text-xs text-slate">
                          누적 {c.usageCount}건
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        {c.usageRate !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink/10">
                              <div
                                className="h-full rounded-full bg-ember"
                                style={{
                                  width: `${Math.min(c.usageRate, 100)}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs">
                              {c.usageRate.toFixed(1)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate">-</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {c.filteredTotalDiscountAmount > 0 ? (
                          <span className="font-semibold text-ember">
                            {fmtKRW(c.filteredTotalDiscountAmount)}
                          </span>
                        ) : (
                          <span className="text-slate">0원</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate">
                        {fmtDate(c.filteredLastUsedAt)}
                      </td>
                      <td className="px-5 py-4">
                        {c.isActive ? (
                          <span className="inline-flex items-center rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">
                            활성
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs font-semibold text-slate">
                            비활성
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 기간 유효성 안내 */}
      <p className="mt-4 text-xs text-slate">
        * 사용 수 / 총 할인액은 선택한 월({monthLabel}) 기준 필터된 수치입니다. 누적 건수는
        전체 기간 집계입니다.
      </p>
    </div>
  );
}
