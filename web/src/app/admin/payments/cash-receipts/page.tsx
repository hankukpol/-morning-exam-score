import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMonthRange(ym: string): { from: Date; to: Date } {
  // ym format: "YYYY-MM"
  const [year, month] = ym.split("-").map(Number);
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  return { from, to };
}

function currentYM(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function typeLabel(type: string | null): string {
  if (type === "INCOME_DEDUCTION") return "소득공제";
  if (type === "EXPENSE_PROOF") return "지출증빙";
  return "미발급";
}

function typeBadgeClass(type: string | null): string {
  if (type === "INCOME_DEDUCTION")
    return "border-amber-300 bg-amber-100 text-amber-800";
  if (type === "EXPENSE_PROOF")
    return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-ink/20 bg-ink/5 text-slate";
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function CashReceiptsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const rawMonth =
    (Array.isArray(searchParams?.month) ? searchParams.month[0] : searchParams?.month) ??
    currentYM();
  const rawType =
    (Array.isArray(searchParams?.type) ? searchParams.type[0] : searchParams?.type) ?? "all";

  const { from, to } = getMonthRange(rawMonth);

  const where = {
    cashReceiptNo: { not: null as null },
    cashReceiptIssuedAt: { gte: from, lte: to },
    ...(rawType !== "all" ? { cashReceiptType: rawType } : {}),
  };

  const receipts = await getPrisma().payment.findMany({
    where,
    orderBy: { cashReceiptIssuedAt: "desc" },
    select: {
      id: true,
      examNumber: true,
      netAmount: true,
      cashReceiptNo: true,
      cashReceiptType: true,
      cashReceiptIssuedAt: true,
      student: { select: { name: true } },
    },
  });

  // Summary for the selected month (all types)
  const allThisMonth = await getPrisma().payment.findMany({
    where: {
      cashReceiptNo: { not: null },
      cashReceiptIssuedAt: { gte: from, lte: to },
    },
    select: { netAmount: true, cashReceiptType: true },
  });

  const totalCount = allThisMonth.length;
  const totalAmount = allThisMonth.reduce((s, r) => s + r.netAmount, 0);
  const incomeDeductionCount = allThisMonth.filter(
    (r) => r.cashReceiptType === "INCOME_DEDUCTION",
  ).length;
  const expenseProofCount = allThisMonth.filter(
    (r) => r.cashReceiptType === "EXPENSE_PROOF",
  ).length;

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">현금영수증 발급 이력</h1>
          <p className="mt-2 text-sm text-slate">
            KSNET POS에서 발급된 현금영수증 승인 내역을 조회합니다.
          </p>
        </div>
        <Link
          href="/admin/payments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 수납 목록
        </Link>
      </div>

      {/* Summary cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">이번 달 발급</p>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">
            {totalCount.toLocaleString()}건
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">이번 달 합계</p>
          <p className="mt-2 text-2xl font-bold text-ember tabular-nums">
            {totalAmount.toLocaleString()}원
          </p>
        </div>
        <div className="rounded-[28px] border border-amber-200 bg-amber-50/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">소득공제</p>
          <p className="mt-2 text-2xl font-bold text-amber-800 tabular-nums">
            {incomeDeductionCount.toLocaleString()}건
          </p>
        </div>
        <div className="rounded-[28px] border border-sky-200 bg-sky-50/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">지출증빙</p>
          <p className="mt-2 text-2xl font-bold text-sky-800 tabular-nums">
            {expenseProofCount.toLocaleString()}건
          </p>
        </div>
      </div>

      {/* Filters */}
      <form method="get" className="mt-8 flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate" htmlFor="month-input">
            발급 월
          </label>
          <input
            id="month-input"
            type="month"
            name="month"
            defaultValue={rawMonth}
            className="rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate" htmlFor="type-select">
            발급 유형
          </label>
          <select
            id="type-select"
            name="type"
            defaultValue={rawType}
            className="rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40"
          >
            <option value="all">전체</option>
            <option value="INCOME_DEDUCTION">소득공제</option>
            <option value="EXPENSE_PROOF">지출증빙</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
        >
          조회
        </button>
      </form>

      {/* Table */}
      <div className="mt-6 overflow-hidden rounded-[20px] border border-ink/10 bg-white shadow-sm">
        {receipts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-lg font-medium text-ink">발급 내역이 없습니다</p>
            <p className="mt-2 text-sm text-slate">
              선택한 조건에 해당하는 현금영수증이 없습니다.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  {["발급일시", "학생명 (학번)", "납부 금액", "승인번호", "발급 유형", "상세"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {receipts.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-mist/60">
                    {/* 발급일시 */}
                    <td className="px-5 py-4 font-mono text-xs text-slate whitespace-nowrap">
                      {r.cashReceiptIssuedAt ? formatDateTime(r.cashReceiptIssuedAt.toISOString()) : "-"}
                    </td>

                    {/* 학생명 */}
                    <td className="px-5 py-4">
                      {r.examNumber ? (
                        <Link
                          href={`/admin/students/${r.examNumber}`}
                          className="font-medium text-ink hover:text-forest hover:underline"
                        >
                          {r.student?.name ?? "—"}
                          <span className="ml-1.5 font-mono text-xs text-slate">
                            ({r.examNumber})
                          </span>
                        </Link>
                      ) : (
                        <span className="text-slate">{r.student?.name ?? "비회원"}</span>
                      )}
                    </td>

                    {/* 납부 금액 */}
                    <td className="px-5 py-4 font-mono text-sm font-semibold text-ink tabular-nums">
                      {r.netAmount.toLocaleString()}원
                    </td>

                    {/* 승인번호 */}
                    <td className="px-5 py-4 font-mono text-sm text-slate">
                      {r.cashReceiptNo ?? "-"}
                    </td>

                    {/* 발급 유형 */}
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${typeBadgeClass(r.cashReceiptType)}`}
                      >
                        {typeLabel(r.cashReceiptType)}
                      </span>
                    </td>

                    {/* 상세 링크 */}
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/payments/${r.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-ink/20 px-3 py-1.5 text-xs font-medium text-slate transition hover:border-forest/40 hover:text-forest"
                      >
                        상세 보기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Footer */}
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist/80">
                  <td colSpan={2} className="px-5 py-3 text-xs font-semibold text-slate">
                    합계 ({receipts.length.toLocaleString()}건)
                  </td>
                  <td className="px-5 py-3 font-mono text-sm font-semibold text-ember tabular-nums">
                    {receipts.reduce((s, r) => s + r.netAmount, 0).toLocaleString()}원
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
