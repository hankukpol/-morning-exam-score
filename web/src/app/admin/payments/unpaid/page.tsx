import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { UnpaidListClient, type UnpaidInstallmentRow } from "./unpaid-list-client";

export const dynamic = "force-dynamic";

// ─── helpers ─────────────────────────────────────────────────────────────────

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

// ─── page ────────────────────────────────────────────────────────────────────

export default async function UnpaidPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const weekLater = new Date(todayStart);
  weekLater.setDate(weekLater.getDate() + 7);

  // Fetch all unpaid installments (paidAt = null), ordered by dueDate asc
  const rawItems = await prisma.installment.findMany({
    where: { paidAt: null },
    include: {
      payment: {
        select: {
          id: true,
          enrollmentId: true,
          examNumber: true,
          category: true,
          netAmount: true,
          note: true,
          student: { select: { name: true, phone: true, examNumber: true } },
          items: { select: { itemName: true }, take: 1 },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { seq: "asc" }],
    take: 500,
  });

  // Aggregate: get total installments per paymentId to compute "N회차/총 M회차"
  const paymentIds = [...new Set(rawItems.map((i) => i.paymentId))];
  const allInstallments = await prisma.installment.findMany({
    where: { paymentId: { in: paymentIds } },
    select: { paymentId: true, seq: true },
  });
  // Map paymentId → max seq (= total rounds)
  const totalRoundsMap = new Map<string, number>();
  for (const inst of allInstallments) {
    const cur = totalRoundsMap.get(inst.paymentId) ?? 0;
    if (inst.seq > cur) totalRoundsMap.set(inst.paymentId, inst.seq);
  }

  // Build rows
  const rows: UnpaidInstallmentRow[] = rawItems.map((item) => {
    const dueDate = item.dueDate;
    const isOverdue = dueDate < todayStart;
    const isThisWeek = dueDate >= todayStart && dueDate < weekLater;
    const status: UnpaidInstallmentRow["installmentStatus"] = isOverdue
      ? "OVERDUE"
      : "PENDING";

    return {
      id: item.id,
      paymentId: item.paymentId,
      enrollmentId: item.payment.enrollmentId ?? null,
      examNumber: item.payment.examNumber ?? null,
      studentName: item.payment.student?.name ?? null,
      mobile: item.payment.student?.phone ?? null,
      courseName:
        item.payment.items[0]?.itemName ?? item.payment.note ?? "—",
      seq: item.seq,
      totalRounds: totalRoundsMap.get(item.paymentId) ?? item.seq,
      dueDate: toDateStr(dueDate),
      amount: item.amount,
      installmentStatus: status,
      isThisWeek,
    };
  });

  // KPI
  const totalCount = rows.length;
  const pendingCount = rows.filter((r) => r.installmentStatus === "PENDING").length;
  const overdueCount = rows.filter((r) => r.installmentStatus === "OVERDUE").length;
  const thisWeekCount = rows.filter((r) => r.isThisWeek).length;
  const totalUnpaidAmount = rows.reduce((s, r) => s + r.amount, 0);

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">미납 현황</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            분납 약정 중 미납·연체 건을 조회합니다. 납부예정일이 오늘 이전이면{" "}
            <span className="font-semibold text-red-600">연체</span>로 표시됩니다.
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/payments/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-ember/90"
          >
            + 수납 등록
          </Link>
          <Link
            href="/admin/payments/installments"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
          >
            할부 관리 →
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">전체 미납</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{totalCount.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>

        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-amber-700">미납 (예정)</p>
          <p className="mt-2 text-3xl font-semibold text-amber-700">
            {pendingCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-amber-600">건</p>
        </div>

        <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-red-600">연체</p>
          <p className="mt-2 text-3xl font-semibold text-red-700">
            {overdueCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-red-500">건</p>
        </div>

        <div className="rounded-[28px] border border-ember/20 bg-ember/5 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-ember">총 미납액</p>
          <p className="mt-2 text-2xl font-semibold text-ember">
            {totalUnpaidAmount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-ember/70">원</p>
        </div>
      </div>

      {/* Client component (filter tabs + table) */}
      <div className="mt-8">
        <UnpaidListClient
          rows={rows}
          summary={{
            totalCount,
            pendingCount,
            overdueCount,
            thisWeekCount,
            totalUnpaidAmount,
          }}
        />
      </div>

      <p className="mt-4 text-xs text-slate/70">
        * 최대 500건의 미납 분납 회차를 조회합니다. 납부예정일 오름차순으로 정렬됩니다.
      </p>
    </div>
  );
}
