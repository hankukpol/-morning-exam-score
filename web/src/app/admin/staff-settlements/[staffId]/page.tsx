import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { StaffDetailClient } from "./staff-detail-client";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

const STAFF_ROLE_LABEL: Record<string, string> = {
  OWNER: "대표",
  DIRECTOR: "원장",
  DEPUTY_DIRECTOR: "부원장",
  MANAGER: "실장",
  ACADEMIC_ADMIN: "교무행정",
  COUNSELOR: "상담",
  TEACHER: "강사",
};

const PAYMENT_CATEGORY_LABEL: Record<string, string> = {
  ENROLLMENT: "수강료",
  TEXTBOOK: "교재",
  LOCKER: "사물함",
  STUDY_ROOM: "스터디룸",
  POINT: "포인트",
  OTHER: "기타",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  ONLINE: "온라인",
  MIXED: "혼합",
};

type PageProps = {
  params: Promise<{ staffId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function parseMonthParam(
  monthParam: string | string[] | undefined
): { year: number; month: number } {
  const raw = Array.isArray(monthParam) ? monthParam[0] : monthParam;
  const today = new Date();
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (y >= 2020 && m >= 1 && m <= 12) {
      return { year: y, month: m };
    }
  }
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

function formatYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function prevMonth(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function nextMonth(year: number, month: number) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

function formatKRW(amount: number) {
  return amount.toLocaleString("ko-KR") + "원";
}

export default async function StaffSettlementDetailPage({
  params,
  searchParams,
}: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const { staffId } = await params;
  const sp = searchParams ? await searchParams : {};
  const { year, month } = parseMonthParam(sp.month);

  const db = getPrisma();

  // Load staff info
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: { id: true, name: true, role: true, adminUserId: true, mobile: true },
  });

  if (!staff) notFound();

  const adminUserId = staff.adminUserId;
  if (!adminUserId) {
    return (
      <div className="p-8 sm:p-10">
        <Breadcrumbs
          items={[
            { label: "보고서", href: "/admin/staff-settlements" },
            { label: "강사 정산", href: "/admin/staff-settlements" },
            { label: staff.name },
          ]}
        />
        <div className="rounded-[28px] border border-ink/10 bg-white p-8 text-center shadow-sm">
          <p className="text-slate">
            이 직원은 관리자 계정과 연동되어 있지 않아 정산 데이터가 없습니다.
          </p>
          <Link
            href="/admin/staff-settlements"
            className="mt-4 inline-block text-sm text-forest underline"
          >
            목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0, 23, 59, 59, 999);

  // Fetch payments for selected month
  const payments = await db.payment.findMany({
    where: {
      processedBy: adminUserId,
      processedAt: { gte: firstDay, lte: lastDay },
      status: { notIn: ["CANCELLED"] },
    },
    select: {
      id: true,
      processedAt: true,
      category: true,
      method: true,
      netAmount: true,
      student: { select: { examNumber: true, name: true } },
      items: {
        select: { itemName: true, amount: true },
        orderBy: { amount: "desc" },
      },
    },
    orderBy: { processedAt: "desc" },
  });

  const totalRevenue = payments.reduce((s, p) => s + p.netAmount, 0);

  // Past 6 months history (oldest first, including current month)
  const historyMonths: Array<{
    yearMonth: string;
    paymentCount: number;
    totalRevenue: number;
  }> = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const hFirst = new Date(y, m - 1, 1);
    const hLast = new Date(y, m, 0, 23, 59, 59, 999);

    const agg = await db.payment.aggregate({
      where: {
        processedBy: adminUserId,
        processedAt: { gte: hFirst, lte: hLast },
        status: { notIn: ["CANCELLED"] },
      },
      _count: { id: true },
      _sum: { netAmount: true },
    });

    historyMonths.push({
      yearMonth: formatYearMonth(y, m),
      paymentCount: agg._count.id,
      totalRevenue: agg._sum.netAmount ?? 0,
    });
  }

  // Categorized breakdown for current month
  type CategoryBreakdown = {
    category: string;
    label: string;
    count: number;
    total: number;
  };
  const categoryMap = new Map<string, CategoryBreakdown>();
  for (const p of payments) {
    const cat = p.category as string;
    const existing = categoryMap.get(cat);
    if (existing) {
      existing.count++;
      existing.total += p.netAmount;
    } else {
      categoryMap.set(cat, {
        category: cat,
        label: PAYMENT_CATEGORY_LABEL[cat] ?? cat,
        count: 1,
        total: p.netAmount,
      });
    }
  }
  const categoryBreakdown = Array.from(categoryMap.values()).sort(
    (a, b) => b.total - a.total
  );

  // Build serializable payment rows
  const paymentRows = payments.map((p) => ({
    id: p.id,
    processedAt: p.processedAt.toISOString(),
    categoryLabel: PAYMENT_CATEGORY_LABEL[p.category as string] ?? (p.category as string),
    methodLabel: PAYMENT_METHOD_LABEL[p.method as string] ?? (p.method as string),
    netAmount: p.netAmount,
    studentName: p.student?.name ?? null,
    examNumber: p.student?.examNumber ?? null,
    itemSummary:
      p.items.length > 0 ? p.items.map((i) => i.itemName).join(", ") : "-",
  }));

  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);
  const today = new Date();
  const isNextFuture =
    next.year > today.getFullYear() ||
    (next.year === today.getFullYear() && next.month > today.getMonth() + 1);

  const currentMonthStr = formatYearMonth(year, month);
  const prevMonthStr = formatYearMonth(prev.year, prev.month);
  const nextMonthStr = formatYearMonth(next.year, next.month);

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "보고서", href: "/admin/staff-settlements" },
          { label: "강사 정산", href: "/admin/staff-settlements" },
          { label: staff.name },
        ]}
      />

      {/* Header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        직원 관리
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">
            {staff.name}{" "}
            <span className="text-xl font-normal text-slate">
              ({STAFF_ROLE_LABEL[staff.role as string] ?? staff.role})
            </span>
          </h1>
          {staff.mobile && (
            <p className="mt-1 text-sm text-slate">{staff.mobile}</p>
          )}
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/staff-settlements/${staffId}?month=${prevMonthStr}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
            aria-label="이전 달"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className="min-w-[80px] text-center text-sm font-medium text-ink">
            {year}년 {month}월
          </span>
          {isNextFuture ? (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white/50 text-slate/40 cursor-not-allowed">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          ) : (
            <Link
              href={`/admin/staff-settlements/${staffId}?month=${nextMonthStr}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
              aria-label="다음 달"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            총 수납 건수
          </p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {payments.length.toLocaleString("ko-KR")}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            총 수납액
          </p>
          <p className="mt-3 text-3xl font-bold text-ember">
            {formatKRW(totalRevenue)}
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            수납 유형 수
          </p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {categoryBreakdown.length.toLocaleString("ko-KR")}
            <span className="ml-1 text-base font-normal text-slate">종</span>
          </p>
        </div>
      </div>

      {/* Category breakdown */}
      {categoryBreakdown.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-4 text-base font-semibold text-ink">수납 유형별 분류</h2>
          <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-forest/5">
                  <th className="px-5 py-3 text-left font-semibold text-forest">유형</th>
                  <th className="px-5 py-3 text-right font-semibold text-forest">건수</th>
                  <th className="px-5 py-3 text-right font-semibold text-forest">합계</th>
                  <th className="px-5 py-3 text-right font-semibold text-forest">비율</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {categoryBreakdown.map((row) => (
                  <tr key={row.category} className="hover:bg-mist/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-ink">{row.label}</td>
                    <td className="px-5 py-3 text-right text-ink">
                      {row.count.toLocaleString("ko-KR")}건
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-ink">
                      {formatKRW(row.total)}
                    </td>
                    <td className="px-5 py-3 text-right text-slate">
                      {totalRevenue > 0
                        ? ((row.total / totalRevenue) * 100).toFixed(1) + "%"
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink/20 bg-forest/5">
                  <td colSpan={2} className="px-5 py-3 font-bold text-forest">
                    합계
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-forest">
                    {formatKRW(totalRevenue)}
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-forest">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 6-month history */}
      <div className="mt-6">
        <h2 className="mb-4 text-base font-semibold text-ink">최근 6개월 수납 현황</h2>
        <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-forest/5">
                <th className="px-5 py-3 text-left font-semibold text-forest">월</th>
                <th className="px-5 py-3 text-right font-semibold text-forest">수납 건수</th>
                <th className="px-5 py-3 text-right font-semibold text-forest">수납 총액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {historyMonths.map((row) => {
                const isCurrentMonth = row.yearMonth === currentMonthStr;
                return (
                  <tr
                    key={row.yearMonth}
                    className={
                      isCurrentMonth
                        ? "bg-forest/5 font-semibold"
                        : "hover:bg-mist/50 transition-colors"
                    }
                  >
                    <td className="px-5 py-3 text-ink">
                      <Link
                        href={`/admin/staff-settlements/${staffId}?month=${row.yearMonth}`}
                        className={
                          isCurrentMonth
                            ? "text-forest"
                            : "text-ink hover:text-forest transition-colors"
                        }
                      >
                        {row.yearMonth.replace("-", "년 ")}월
                        {isCurrentMonth && (
                          <span className="ml-2 rounded-full bg-forest/10 px-2 py-0.5 text-xs text-forest">
                            현재
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right text-ink">
                      {row.paymentCount.toLocaleString("ko-KR")}건
                    </td>
                    <td
                      className={`px-5 py-3 text-right ${
                        isCurrentMonth ? "text-ember" : "text-ink"
                      }`}
                    >
                      {formatKRW(row.totalRevenue)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment list with commission input */}
      <div className="mt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">
            {year}년 {month}월 수납 내역
            <span className="ml-2 text-sm font-normal text-slate">
              ({payments.length}건)
            </span>
          </h2>
          <StaffDetailClient
            staffId={staffId}
            adminUserId={adminUserId}
            year={year}
            month={month}
            totalRevenue={totalRevenue}
          />
        </div>

        {payments.length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-10 text-center text-slate shadow-sm">
            이 기간에 처리한 수납 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-forest/5">
                  <th className="px-4 py-3 text-left font-semibold text-forest">처리일시</th>
                  <th className="px-4 py-3 text-left font-semibold text-forest">학생</th>
                  <th className="px-4 py-3 text-left font-semibold text-forest">유형</th>
                  <th className="px-4 py-3 text-left font-semibold text-forest">결제방법</th>
                  <th className="px-4 py-3 text-left font-semibold text-forest">항목</th>
                  <th className="px-4 py-3 text-right font-semibold text-forest">금액</th>
                  <th className="px-4 py-3 text-center font-semibold text-forest">상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {paymentRows.map((row) => (
                  <tr key={row.id} className="hover:bg-mist/50 transition-colors">
                    <td className="px-4 py-3 text-slate">
                      {new Date(row.processedAt).toLocaleDateString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                      })}{" "}
                      {new Date(row.processedAt).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {row.examNumber ? (
                        <Link
                          href={`/admin/students/${row.examNumber}`}
                          className="font-medium text-ink hover:text-forest transition-colors"
                        >
                          {row.studentName}
                        </Link>
                      ) : (
                        <span className="text-slate">{row.studentName ?? "-"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate">{row.categoryLabel}</td>
                    <td className="px-4 py-3 text-slate">{row.methodLabel}</td>
                    <td
                      className="max-w-[200px] truncate px-4 py-3 text-slate"
                      title={row.itemSummary}
                    >
                      {row.itemSummary}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-ink">
                      {formatKRW(row.netAmount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        href={`/admin/payments/${row.id}`}
                        className="rounded-lg border border-ink/15 bg-white px-2 py-1 text-xs text-slate transition hover:border-forest/30 hover:text-forest"
                      >
                        보기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink/20 bg-forest/5">
                  <td colSpan={5} className="px-4 py-3 font-bold text-forest">
                    합계
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-ember">
                    {formatKRW(totalRevenue)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Back link */}
      <div className="mt-8">
        <Link
          href={`/admin/staff-settlements?month=${currentMonthStr}`}
          className="text-sm text-forest hover:underline"
        >
          ← 직원 정산 목록으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
