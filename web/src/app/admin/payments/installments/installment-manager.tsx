"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { PaymentCategory } from "@prisma/client";
import { PAYMENT_CATEGORY_LABEL } from "@/lib/constants";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InstallmentItem = {
  id: string;
  paymentId: string;
  seq: number;
  amount: number;
  dueDate: string; // ISO string
  paidAt: string | null; // ISO string or null
  paidPaymentId: string | null;
  payment: {
    id: string;
    examNumber: string | null;
    category: PaymentCategory;
    netAmount: number;
    note: string | null;
    student: { name: string; phone: string | null } | null;
    firstItemName: string | null;
  };
};

type StatusFilter = "overdue" | "upcoming" | "paid" | "all";

type Props = {
  initialItems: InstallmentItem[];
  initialStatus: StatusFilter;
  summary: {
    overdueCount: number;
    upcomingCount: number;
    paidCount: number;
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

/** D-n 또는 D+n (연체) 표시 */
function dueDateLabel(isoString: string): { label: string; overdue: boolean } {
  const dueDate = new Date(isoString);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const diffMs = dueDate.getTime() - todayStart.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return { label: "D-Day", overdue: false };
  if (diffDays > 0) return { label: `D-${diffDays}`, overdue: false };
  return { label: `D+${Math.abs(diffDays)}`, overdue: true };
}

function getInstallmentStatus(item: InstallmentItem): "paid" | "overdue" | "upcoming" {
  if (item.paidAt !== null) return "paid";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  if (new Date(item.dueDate) < todayStart) return "overdue";
  return "upcoming";
}

const STATUS_BADGE: Record<
  "paid" | "overdue" | "upcoming",
  { label: string; className: string }
> = {
  paid: {
    label: "완납",
    className: "border-forest/30 bg-forest/10 text-forest",
  },
  overdue: {
    label: "연체",
    className: "border-red-200 bg-red-50 text-red-700",
  },
  upcoming: {
    label: "예정",
    className: "border-ink/20 bg-ink/5 text-slate",
  },
};

const TABS: { value: StatusFilter; label: string }[] = [
  { value: "overdue", label: "연체" },
  { value: "upcoming", label: "예정" },
  { value: "paid", label: "완납" },
  { value: "all", label: "전체" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function InstallmentManager({ initialItems, initialStatus, summary }: Props) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<StatusFilter>(initialStatus);
  const [items, setItems] = useState<InstallmentItem[]>(initialItems);
  const [total, setTotal] = useState<number>(initialItems.length);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [summaryState, setSummaryState] = useState(summary);

  const fetchItems = useCallback(async (status: StatusFilter) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payments/installments?status=${status}&page=1`);
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? "조회 실패");
        return;
      }
      setItems(json.data.items);
      setTotal(json.data.total);
      setSummaryState(json.data.summary);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleTabChange(tab: StatusFilter) {
    setActiveTab(tab);
    void fetchItems(tab);
  }

  async function handleMarkPaid(item: InstallmentItem) {
    if (
      !confirm(
        `${item.payment.student?.name ?? item.payment.examNumber ?? "?"}의 ${item.seq}회차 ${formatKRW(item.amount)}를 납부 처리하시겠습니까?`,
      )
    )
      return;

    setProcessingId(item.id);
    try {
      const res = await fetch(
        `/api/payments/${item.paymentId}/installments/${item.seq}`,
        { method: "PATCH" },
      );
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? "납부 처리 실패");
        return;
      }

      // Update local state: mark paidAt
      const paidAt: string = json.data.paidAt;
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, paidAt } : it,
        ),
      );
      // If current tab is overdue or upcoming, remove the paid item
      if (activeTab === "overdue" || activeTab === "upcoming") {
        setItems((prev) => prev.filter((it) => it.id !== item.id));
        setTotal((prev) => Math.max(0, prev - 1));
      }

      // Re-fetch summary
      void fetchSummary();
      router.refresh();
    } finally {
      setProcessingId(null);
    }
  }

  async function fetchSummary() {
    try {
      const res = await fetch(`/api/payments/installments?status=all&page=1`);
      const json = await res.json();
      if (res.ok) {
        setSummaryState(json.data.summary);
      }
    } catch {
      // ignore
    }
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.value;
          const count =
            tab.value === "overdue"
              ? summaryState.overdueCount
              : tab.value === "upcoming"
                ? summaryState.upcomingCount
                : tab.value === "paid"
                  ? summaryState.paidCount
                  : null;

          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleTabChange(tab.value)}
              disabled={loading}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
                isActive
                  ? "border-ember bg-ember text-white"
                  : "border-ink/20 bg-white text-ink hover:border-ember/40 hover:text-ember",
              ].join(" ")}
            >
              {tab.label}
              {count !== null ? (
                <span
                  className={[
                    "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                    isActive
                      ? "bg-white/30 text-white"
                      : tab.value === "overdue"
                        ? "bg-red-50 text-red-700"
                        : "bg-mist text-slate",
                  ].join(" ")}
                >
                  {count.toLocaleString()}
                </span>
              ) : null}
            </button>
          );
        })}

        <span className="ml-auto text-sm text-slate">
          {loading ? "조회 중..." : `${total.toLocaleString()}건`}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[20px] border border-ink/10 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-ember/20 border-t-ember" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-4xl">&#10003;</p>
            <p className="mt-4 text-lg font-medium text-ink">
              {activeTab === "overdue"
                ? "연체 항목이 없습니다"
                : activeTab === "upcoming"
                  ? "예정된 분할납부가 없습니다"
                  : activeTab === "paid"
                    ? "완납된 항목이 없습니다"
                    : "분할납부 내역이 없습니다"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  {[
                    "학생명 (학번)",
                    "수납 내역",
                    "회차",
                    "예정일",
                    "금액",
                    "상태",
                    "처리",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {items.map((item) => {
                  const status = getInstallmentStatus(item);
                  const badge = STATUS_BADGE[status];
                  const { label: dLabel, overdue } = item.paidAt
                    ? { label: formatDate(item.paidAt), overdue: false }
                    : dueDateLabel(item.dueDate);
                  const isProcessing = processingId === item.id;
                  const paymentDesc =
                    item.payment.firstItemName ??
                    PAYMENT_CATEGORY_LABEL[item.payment.category] ??
                    "수납";

                  return (
                    <tr
                      key={item.id}
                      className={[
                        "transition-colors hover:bg-mist/50",
                        status === "overdue"
                          ? "border-l-4 border-l-red-400"
                          : status === "upcoming"
                            ? "border-l-4 border-l-amber-300"
                            : "border-l-4 border-l-forest/40",
                      ].join(" ")}
                    >
                      {/* 학생명 (학번) */}
                      <td className="px-5 py-4">
                        {item.payment.examNumber ? (
                          <a
                            href={`/admin/students/${item.payment.examNumber}`}
                            className="font-medium text-ink hover:text-forest hover:underline"
                          >
                            {item.payment.student?.name ?? item.payment.examNumber}
                          </a>
                        ) : (
                          <span className="text-slate">—</span>
                        )}
                        {item.payment.examNumber && item.payment.student ? (
                          <p className="mt-0.5 font-mono text-xs text-slate">
                            {item.payment.examNumber}
                          </p>
                        ) : null}
                      </td>

                      {/* 수납 내역 */}
                      <td className="px-5 py-4">
                        <a
                          href={`/admin/payments/${item.paymentId}`}
                          className="text-forest hover:underline font-medium"
                        >
                          {paymentDesc}
                        </a>
                        <p className="mt-0.5 font-mono text-xs text-slate">
                          {formatKRW(item.payment.netAmount)}
                        </p>
                      </td>

                      {/* 회차 */}
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink/5 text-xs font-semibold text-ink">
                          {item.seq}회
                        </span>
                      </td>

                      {/* 예정일 */}
                      <td className="px-5 py-4">
                        <p className="font-mono text-xs text-ink">{formatDate(item.dueDate)}</p>
                        {!item.paidAt ? (
                          <p
                            className={[
                              "mt-0.5 text-xs font-semibold",
                              overdue ? "text-red-600" : "text-amber-600",
                            ].join(" ")}
                          >
                            {dLabel}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-forest">납부 {dLabel}</p>
                        )}
                      </td>

                      {/* 금액 */}
                      <td className="px-5 py-4 font-mono text-sm font-semibold text-ink tabular-nums">
                        {formatKRW(item.amount)}
                      </td>

                      {/* 상태 배지 */}
                      <td className="px-5 py-4">
                        <span
                          className={[
                            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                            badge.className,
                          ].join(" ")}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* 납부 처리 버튼 */}
                      <td className="px-5 py-4">
                        {item.paidAt === null ? (
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleMarkPaid(item)}
                            className={[
                              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
                              status === "overdue"
                                ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                : "border-ember/30 bg-ember/10 text-ember hover:bg-ember/20",
                            ].join(" ")}
                          >
                            {isProcessing ? "처리 중..." : "납부 처리"}
                          </button>
                        ) : (
                          <span className="text-xs text-slate">완납</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && total > items.length ? (
        <p className="mt-3 text-center text-xs text-slate">
          * 현재 {items.length.toLocaleString()}건 표시 중 (전체 {total.toLocaleString()}건).
          더 많은 항목을 보려면 필터를 좁혀주세요.
        </p>
      ) : null}
    </div>
  );
}
