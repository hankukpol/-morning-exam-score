import Link from "next/link";
import { AdminRole, CodeType, DiscountType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CODE_TYPE_LABELS: Record<CodeType, string> = {
  REFERRAL: "추천인",
  ENROLLMENT: "등록",
  CAMPAIGN: "캠페인",
};

const CODE_TYPE_COLORS: Record<CodeType, string> = {
  REFERRAL: "text-purple-700 bg-purple-50 border-purple-200",
  ENROLLMENT: "text-blue-700 bg-blue-50 border-blue-200",
  CAMPAIGN: "text-amber-700 bg-amber-50 border-amber-200",
};

function buildMonthOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let delta = -11; delta <= 0; delta++) {
    const d = new Date(now.getFullYear(), now.getMonth() + delta, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    opts.push({ value, label });
  }
  return opts.reverse();
}

function formatKoreanDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

type UsageRow = {
  id: number;
  examNumber: string;
  usedAt: Date;
  discountAmount: number;
  studentName: string;
};

type CodeWithStats = {
  id: number;
  code: string;
  type: CodeType;
  discountType: DiscountType;
  discountValue: number;
  maxUsage: number | null;
  usageCount: number;
  isActive: boolean;
  validFrom: Date;
  validUntil: Date | null;
  periodUsages: UsageRow[];
  periodTotalDiscount: number;
};

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

export default async function DiscountCodeAnalyticsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const sp = await searchParams;
  const period = sp.period ?? "current";

  const prisma = getPrisma();
  const now = new Date();

  // Date range
  let dateFilter: { gte: Date; lt: Date } | undefined;
  let periodLabel = "이번 달";

  if (period === "all") {
    dateFilter = undefined;
    periodLabel = "전체 기간";
  } else if (period === "current") {
    dateFilter = {
      gte: new Date(now.getFullYear(), now.getMonth(), 1),
      lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
    periodLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  } else {
    const [yearStr, monthStr] = period.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    dateFilter = {
      gte: new Date(year, month, 1),
      lt: new Date(year, month + 1, 1),
    };
    periodLabel = `${year}년 ${month + 1}월`;
  }

  // Fetch codes (without usages - we'll fetch usages separately for the period)
  const allCodes = await prisma.discountCode.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  // Fetch usages for the period
  const periodUsages = await prisma.discountCodeUsage.findMany({
    where: dateFilter ? { usedAt: dateFilter } : undefined,
    select: {
      id: true,
      codeId: true,
      examNumber: true,
      usedAt: true,
      payment: { select: { discountAmount: true } },
      student: { select: { name: true } },
    },
    orderBy: { usedAt: "desc" },
  });

  // Build per-code stats
  const usagesByCode = new Map<number, UsageRow[]>();
  for (const u of periodUsages) {
    const list = usagesByCode.get(u.codeId) ?? [];
    list.push({
      id: u.id,
      examNumber: u.examNumber,
      usedAt: u.usedAt,
      discountAmount: u.payment?.discountAmount ?? 0,
      studentName: u.student.name,
    });
    usagesByCode.set(u.codeId, list);
  }

  const codeStats: CodeWithStats[] = allCodes.map((c) => {
    const usages = usagesByCode.get(c.id) ?? [];
    const totalDiscount = usages.reduce((s, u) => s + u.discountAmount, 0);
    return {
      id: c.id,
      code: c.code,
      type: c.type,
      discountType: c.discountType,
      discountValue: c.discountValue,
      maxUsage: c.maxUsage,
      usageCount: c.usageCount,
      isActive: c.isActive,
      validFrom: c.validFrom,
      validUntil: c.validUntil,
      periodUsages: usages,
      periodTotalDiscount: totalDiscount,
    };
  });

  // Summary stats
  const totalCodes = allCodes.length;
  const usedCodes = codeStats.filter((c) => c.periodUsages.length > 0).length;
  const usageRate = totalCodes > 0 ? Math.round((usedCodes / totalCodes) * 100) : 0;
  const totalSaved = codeStats.reduce((s, c) => s + c.periodTotalDiscount, 0);
  const totalUsages = periodUsages.length;

  // Recent usages across all codes (latest 20), already sorted desc
  type RecentRow = {
    codeStr: string;
    studentName: string;
    examNumber: string;
    usedAt: Date;
    discountAmount: number;
  };
  const recentUsages: RecentRow[] = periodUsages.slice(0, 20).map((u) => {
    const codeRecord = allCodes.find((c) => c.id === u.codeId);
    return {
      codeStr: codeRecord?.code ?? `#${u.codeId}`,
      studentName: u.student.name,
      examNumber: u.examNumber,
      usedAt: u.usedAt,
      discountAmount: u.payment?.discountAmount ?? 0,
    };
  });

  // Max usage count for bar scaling
  const maxUsageCount = Math.max(...codeStats.map((c) => c.periodUsages.length), 1);

  const monthOptions = buildMonthOptions();

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-slate">
        <Link href="/admin/settings/discount-codes" className="transition hover:text-ember">
          할인 코드 관리
        </Link>
        <span>/</span>
        <span className="text-ink">사용 현황</span>
      </nav>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            할인코드 분석
          </div>
          <h1 className="mt-4 text-3xl font-semibold">할인 코드 사용 현황</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            코드별 사용 횟수, 절약 금액, 최근 사용 내역을 확인합니다.
          </p>
        </div>
        <Link
          href="/admin/settings/discount-codes"
          className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          ← 코드 관리
        </Link>
      </div>

      {/* Period filter */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-ink">기간</span>
        <a
          href="?period=current"
          className={`inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium transition ${
            period === "current"
              ? "border-ink/40 bg-ink text-white"
              : "border-ink/10 bg-white text-slate hover:border-ink/20"
          }`}
        >
          이번 달
        </a>
        <a
          href="?period=all"
          className={`inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium transition ${
            period === "all"
              ? "border-ink/40 bg-ink text-white"
              : "border-ink/10 bg-white text-slate hover:border-ink/20"
          }`}
        >
          전체 기간
        </a>
        <select
          defaultValue={period !== "current" && period !== "all" ? period : ""}
          onChange={(e) => {
            if (e.target.value) window.location.href = `?period=${e.target.value}`;
          }}
          className="rounded-2xl border border-ink/20 px-3 py-2 text-sm outline-none focus:border-forest"
        >
          <option value="">월별 선택...</option>
          {monthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Period label */}
      <p className="mt-3 text-xs text-slate">
        현재 조회 기간: <span className="font-semibold text-ink">{periodLabel}</span>
      </p>

      {/* KPI summary */}
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold text-slate">총 발급 코드</p>
          <p className="mt-3 text-3xl font-bold">
            {totalCodes}
            <span className="ml-1 text-sm font-normal text-slate">개</span>
          </p>
          <p className="mt-1.5 text-xs text-slate">전체 할인 코드 수</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold text-slate">사용된 코드</p>
          <p className="mt-3 text-3xl font-bold">
            {usedCodes}
            <span className="ml-1 text-sm font-normal text-slate">개</span>
          </p>
          <p className="mt-1.5 text-xs text-slate">
            사용률 <span className="font-semibold text-ink">{usageRate}%</span>
          </p>
        </div>

        <div className="rounded-[28px] border border-ember/20 bg-ember/10 p-5 shadow-panel">
          <p className="text-xs font-semibold text-ember">총 사용 횟수</p>
          <p className="mt-3 text-3xl font-bold text-ember">
            {totalUsages}
            <span className="ml-1 text-sm font-normal text-slate">회</span>
          </p>
          <p className="mt-1.5 text-xs text-slate">{periodLabel} 기준</p>
        </div>

        <div className="rounded-[28px] border border-forest/20 bg-forest/10 p-5 shadow-panel">
          <p className="text-xs font-semibold text-forest">총 절약 금액</p>
          <p className="mt-3 text-2xl font-bold text-forest tabular-nums">
            {totalSaved.toLocaleString()}
            <span className="ml-1 text-sm font-normal text-slate">원</span>
          </p>
          <p className="mt-1.5 text-xs text-slate">코드 적용 할인 합계</p>
        </div>
      </div>

      {/* Code usage table */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/10 px-6 py-5">
          <h2 className="text-base font-semibold">코드별 사용 현황</h2>
          <p className="mt-0.5 text-xs text-slate">{periodLabel} 기준 각 코드의 사용 통계</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead>
              <tr>
                {["코드", "유형", "할인 방식", "사용 횟수", "총 절약액", "유효 기간", "상태"].map(
                  (header) => (
                    <th
                      key={header}
                      className="bg-mist/50 px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate"
                    >
                      {header}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {codeStats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate">
                    할인 코드가 없습니다.
                  </td>
                </tr>
              ) : (
                codeStats.map((c) => {
                  const usageCount = c.periodUsages.length;
                  const barPct =
                    maxUsageCount > 0 ? Math.round((usageCount / maxUsageCount) * 100) : 0;

                  return (
                    <tr key={c.id} className="transition hover:bg-mist/20">
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/settings/discount-codes/${c.id}`}
                          className="font-mono text-sm font-semibold text-ember hover:underline"
                        >
                          {c.code}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${CODE_TYPE_COLORS[c.type]}`}
                        >
                          {CODE_TYPE_LABELS[c.type]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate">
                        {c.discountType === DiscountType.RATE
                          ? `${c.discountValue}%`
                          : `${c.discountValue.toLocaleString()}원`}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          {/* Mini usage bar */}
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-ink/10">
                            <div
                              className="h-full rounded-full bg-ember/70 transition-all duration-500"
                              style={{ width: `${Math.max(barPct, usageCount > 0 ? 5 : 0)}%` }}
                            />
                          </div>
                          <span className="tabular-nums font-semibold text-ink">
                            {usageCount}회
                          </span>
                          {c.maxUsage ? (
                            <span className="text-xs text-slate">/ {c.maxUsage}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-4 tabular-nums font-semibold text-forest">
                        {c.periodTotalDiscount > 0
                          ? `${c.periodTotalDiscount.toLocaleString()}원`
                          : "-"}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate">
                        {c.validUntil ? (
                          c.validUntil.toISOString().slice(0, 10)
                        ) : (
                          <span className="text-slate/60">없음</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {c.isActive ? (
                          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">
                            활성
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold text-slate">
                            비활성
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {codeStats.length > 0 && (
          <div className="border-t border-ink/10 px-5 py-3 text-xs text-slate">
            총 {codeStats.length}개 코드
          </div>
        )}
      </div>

      {/* Recent usage log */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/10 px-6 py-5">
          <h2 className="text-base font-semibold">최근 사용 내역</h2>
          <p className="mt-0.5 text-xs text-slate">
            {periodLabel} 기준 최근 20건의 코드 사용 내역
          </p>
        </div>
        {recentUsages.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate">
            해당 기간에 코드 사용 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead>
                <tr>
                  {["날짜", "학생명", "코드", "할인 금액"].map((header) => (
                    <th
                      key={header}
                      className="bg-mist/50 px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {recentUsages.map((u, idx) => (
                  <tr key={idx} className="transition hover:bg-mist/20">
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-slate">
                      {formatKoreanDate(u.usedAt.toISOString())}
                    </td>
                    <td className="px-5 py-3 font-semibold text-ink">
                      <Link
                        href={`/admin/students/${u.examNumber}`}
                        className="transition hover:text-ember hover:underline"
                      >
                        {u.studentName}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs font-semibold text-ember">
                        {u.codeStr}
                      </span>
                    </td>
                    <td className="px-5 py-3 tabular-nums font-semibold text-forest">
                      {u.discountAmount > 0
                        ? `${u.discountAmount.toLocaleString()}원`
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {recentUsages.length > 0 && (
          <div className="border-t border-ink/10 px-5 py-3 text-xs text-slate">
            최근 {recentUsages.length}건 표시
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="mt-8 flex gap-3">
        <Link
          href="/admin/settings/discount-codes"
          className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          ← 코드 관리로 돌아가기
        </Link>
      </div>
    </div>
  );
}
