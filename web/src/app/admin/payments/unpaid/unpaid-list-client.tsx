"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UnpaidInstallmentRow = {
  id: string;
  paymentId: string;
  enrollmentId: string | null;
  examNumber: string | null;
  studentName: string | null;
  mobile: string | null;
  courseName: string;
  seq: number;
  totalRounds: number;
  dueDate: string; // formatted "YYYY.MM.DD"
  amount: number;
  installmentStatus: "PENDING" | "OVERDUE";
  isThisWeek: boolean;
};

type FilterTab = "all" | "pending" | "overdue" | "thisWeek";

type Summary = {
  totalCount: number;
  pendingCount: number;
  overdueCount: number;
  thisWeekCount: number;
  totalUnpaidAmount: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

function statusBadgeClass(status: UnpaidInstallmentRow["installmentStatus"]): string {
  if (status === "OVERDUE") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function statusLabel(status: UnpaidInstallmentRow["installmentStatus"]): string {
  if (status === "OVERDUE") return "연체";
  return "미납";
}

function rowAccentClass(status: UnpaidInstallmentRow["installmentStatus"]): string {
  if (status === "OVERDUE") return "border-l-4 border-l-red-400";
  return "border-l-4 border-l-amber-400";
}

// ─── Remind button ────────────────────────────────────────────────────────────

type RemindState = "idle" | "loading" | "sent" | "error";

function RemindButton({ row }: { row: UnpaidInstallmentRow }) {
  const [state, setState] = useState<RemindState>("idle");
  const [tooltip, setTooltip] = useState("");

  async function handleRemind() {
    if (state === "loading" || state === "sent") return;
    setState("loading");
    setTooltip("");

    try {
      const res = await fetch("/api/payments/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examNumber: row.examNumber,
          enrollmentId: row.enrollmentId,
          unpaidAmount: row.amount,
          courseName: row.courseName,
        }),
      });

      const json = (await res.json()) as {
        data?: { sent: boolean; message: string };
        error?: string;
      };

      if (!res.ok || json.error) {
        setState("error");
        setTooltip(json.error ?? "발송 실패");
        setTimeout(() => setState("idle"), 4000);
        return;
      }

      setState("sent");
      setTooltip(json.data?.message ?? "발송 완료");
    } catch {
      setState("error");
      setTooltip("네트워크 오류");
      setTimeout(() => setState("idle"), 4000);
    }
  }

  if (state === "sent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-forest/30 bg-forest/10 px-3 py-1.5 text-xs font-medium text-forest">
        ✓ 발송 완료
      </span>
    );
  }

  return (
    <div className="relative inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleRemind}
        disabled={state === "loading"}
        className={[
          "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
          state === "loading"
            ? "cursor-not-allowed border-ink/20 bg-ink/5 text-ink/40"
            : state === "error"
              ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
              : "border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100",
        ].join(" ")}
      >
        {state === "loading" ? (
          <>
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            발송 중…
          </>
        ) : state === "error" ? (
          "재시도"
        ) : (
          "독촉 발송"
        )}
      </button>
      {tooltip && (
        <span className="absolute top-full z-10 mt-1 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[10px] text-white shadow-lg">
          {tooltip}
        </span>
      )}
    </div>
  );
}

// ─── Bulk Remind Toast ────────────────────────────────────────────────────────

type BulkToast = {
  type: "success" | "error" | "partial";
  message: string;
};

// ─── Main component ───────────────────────────────────────────────────────────

const TABS: { value: FilterTab; labelKey: keyof Summary; label: string }[] = [
  { value: "all", labelKey: "totalCount", label: "전체" },
  { value: "pending", labelKey: "pendingCount", label: "미납" },
  { value: "overdue", labelKey: "overdueCount", label: "연체" },
  { value: "thisWeek", labelKey: "thisWeekCount", label: "이번 주 예정" },
];

export function UnpaidListClient({
  rows,
  summary,
}: {
  rows: UnpaidInstallmentRow[];
  summary: Summary;
}) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [toast, setToast] = useState<BulkToast | null>(null);

  const filtered = rows.filter((row) => {
    if (activeTab === "all") return true;
    if (activeTab === "pending") return row.installmentStatus === "PENDING";
    if (activeTab === "overdue") return row.installmentStatus === "OVERDUE";
    if (activeTab === "thisWeek") return row.isThisWeek;
    return true;
  });

  const filteredUnpaidAmount = filtered.reduce((s, r) => s + r.amount, 0);

  // Rows that can be reminded (have examNumber)
  const remindableFiltered = filtered.filter((r) => r.examNumber);

  const allRemindableSelected =
    remindableFiltered.length > 0 &&
    remindableFiltered.every((r) => selectedIds.has(r.id));

  const someSelected = selectedIds.size > 0;

  const handleSelectAll = useCallback(() => {
    if (allRemindableSelected) {
      // Deselect all currently visible remindable rows
      setSelectedIds((prev) => {
        const next = new Set(prev);
        remindableFiltered.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      // Select all currently visible remindable rows
      setSelectedIds((prev) => {
        const next = new Set(prev);
        remindableFiltered.forEach((r) => next.add(r.id));
        return next;
      });
    }
  }, [allRemindableSelected, remindableFiltered]);

  const handleToggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  function showToast(t: BulkToast) {
    setToast(t);
    setTimeout(() => setToast(null), 5000);
  }

  async function handleBulkRemind() {
    if (bulkLoading || selectedIds.size === 0) return;

    const selectedRows = rows.filter((r) => selectedIds.has(r.id) && r.examNumber);
    if (selectedRows.length === 0) {
      showToast({ type: "error", message: "학번이 없는 항목은 발송할 수 없습니다." });
      return;
    }

    setBulkLoading(true);

    try {
      const items = selectedRows.map((r) => ({
        examNumber: r.examNumber as string,
        enrollmentId: r.enrollmentId ?? undefined,
        unpaidAmount: r.amount,
        courseName: r.courseName,
      }));

      const res = await fetch("/api/payments/remind-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      const json = (await res.json()) as {
        data?: { sent: number; failed: number; errors: string[] };
        error?: string;
      };

      if (!res.ok || json.error) {
        showToast({ type: "error", message: json.error ?? "일괄 발송 실패" });
        return;
      }

      const { sent, failed } = json.data ?? { sent: 0, failed: 0 };

      if (failed === 0) {
        showToast({
          type: "success",
          message: `${sent}건 발송 완료`,
        });
        // Clear selection on full success
        setSelectedIds(new Set());
      } else if (sent > 0) {
        showToast({
          type: "partial",
          message: `${sent}건 발송 완료, ${failed}건 실패`,
        });
      } else {
        showToast({ type: "error", message: `전체 ${failed}건 발송 실패` });
      }
    } catch {
      showToast({ type: "error", message: "네트워크 오류" });
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div
          className={[
            "mb-4 flex items-center justify-between rounded-2xl border px-5 py-3 text-sm font-medium shadow-sm",
            toast.type === "success"
              ? "border-forest/30 bg-forest/10 text-forest"
              : toast.type === "partial"
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-red-300 bg-red-50 text-red-700",
          ].join(" ")}
        >
          <span>
            {toast.type === "success" ? "✓ " : toast.type === "partial" ? "⚠ " : "✕ "}
            {toast.message}
          </span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-4 text-current opacity-60 hover:opacity-100"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((tab) => {
          const count = summary[tab.labelKey] as number;
          const isActive = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-ember bg-ember text-white"
                  : "border-ink/20 bg-white text-ink hover:border-ember/40 hover:text-ember",
              ].join(" ")}
            >
              {tab.label}
              <span
                className={[
                  "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                  isActive
                    ? "bg-white/30 text-white"
                    : tab.value === "overdue"
                      ? "bg-red-50 text-red-700"
                      : tab.value === "pending"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-mist text-slate",
                ].join(" ")}
              >
                {count.toLocaleString()}
              </span>
            </button>
          );
        })}

        <span className="ml-auto text-sm text-slate">
          {filtered.length.toLocaleString()}건 /{" "}
          <span className="font-semibold text-ember">
            {filteredUnpaidAmount.toLocaleString()}원
          </span>
        </span>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-sm font-medium text-amber-800">
            {selectedIds.size}건 선택됨
          </span>
          <button
            type="button"
            onClick={handleBulkRemind}
            disabled={bulkLoading}
            className={[
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              bulkLoading
                ? "cursor-not-allowed bg-ink/10 text-ink/40"
                : "bg-amber-500 text-white hover:bg-amber-600 shadow-sm",
            ].join(" ")}
          >
            {bulkLoading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                발송 중…
              </>
            ) : (
              `선택한 항목에 독촉 알림 발송 (${selectedIds.size}건)`
            )}
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-amber-700 underline hover:text-amber-900"
          >
            선택 해제
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-[20px] border border-ink/10 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-4xl text-forest">✓</div>
            <p className="mt-4 text-lg font-medium text-ink">
              {activeTab === "overdue"
                ? "연체 항목이 없습니다"
                : activeTab === "pending"
                  ? "미납 예정 항목이 없습니다"
                  : activeTab === "thisWeek"
                    ? "이번 주 예정 항목이 없습니다"
                    : "미납 내역이 없습니다"}
            </p>
            <p className="mt-2 text-sm text-slate">선택한 조건에 해당하는 항목이 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  {/* 전체 선택 checkbox */}
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={allRemindableSelected}
                      onChange={handleSelectAll}
                      disabled={remindableFiltered.length === 0}
                      title="전체 선택"
                      className="h-4 w-4 cursor-pointer rounded border-ink/30 text-amber-500 accent-amber-500"
                    />
                  </th>
                  {[
                    "이름",
                    "학번",
                    "강좌",
                    "분납 회차",
                    "예정일",
                    "금액",
                    "상태",
                    "수납하기",
                    "독촉 발송",
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
                {filtered.map((row) => {
                  const isChecked = selectedIds.has(row.id);
                  const canSelect = !!row.examNumber;
                  return (
                    <tr
                      key={row.id}
                      className={[
                        rowAccentClass(row.installmentStatus),
                        isChecked ? "bg-amber-50/60" : "transition-colors hover:bg-mist/60",
                      ].join(" ")}
                    >
                      {/* Checkbox */}
                      <td className="w-10 px-3 py-4 text-center">
                        {canSelect ? (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleRow(row.id)}
                            className="h-4 w-4 cursor-pointer rounded border-ink/30 text-amber-500 accent-amber-500"
                          />
                        ) : (
                          <span className="text-xs text-slate/30">—</span>
                        )}
                      </td>

                      {/* 이름 */}
                      <td className="px-5 py-4">
                        {row.examNumber ? (
                          <Link
                            href={`/admin/students/${row.examNumber}`}
                            className="font-medium text-ink hover:text-forest hover:underline"
                          >
                            {row.studentName ?? "—"}
                          </Link>
                        ) : (
                          <span className="text-slate">{row.studentName ?? "—"}</span>
                        )}
                      </td>

                      {/* 학번 */}
                      <td className="px-5 py-4">
                        {row.examNumber ? (
                          <Link
                            href={`/admin/students/${row.examNumber}`}
                            className="font-mono text-xs font-medium text-forest hover:underline"
                          >
                            {row.examNumber}
                          </Link>
                        ) : (
                          <span className="text-slate">—</span>
                        )}
                      </td>

                      {/* 강좌 */}
                      <td className="px-5 py-4 text-ink">{row.courseName}</td>

                      {/* 분납 회차 */}
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center gap-0.5 rounded-full border border-ink/20 bg-ink/5 px-2.5 py-0.5 font-mono text-xs font-semibold text-ink">
                          {row.seq}
                          <span className="text-slate/60">/{row.totalRounds}</span>
                        </span>
                      </td>

                      {/* 예정일 */}
                      <td className="px-5 py-4 font-mono text-xs text-ink">
                        {row.dueDate}
                        {row.isThisWeek && row.installmentStatus !== "OVERDUE" && (
                          <span className="ml-1.5 inline-flex rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                            이번 주
                          </span>
                        )}
                      </td>

                      {/* 금액 */}
                      <td className="px-5 py-4 font-mono text-sm font-semibold text-ink tabular-nums">
                        {formatKRW(row.amount)}
                      </td>

                      {/* 상태 */}
                      <td className="px-5 py-4">
                        <span
                          className={[
                            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                            statusBadgeClass(row.installmentStatus),
                          ].join(" ")}
                        >
                          {statusLabel(row.installmentStatus)}
                        </span>
                      </td>

                      {/* 수납하기 */}
                      <td className="px-5 py-4">
                        <Link
                          href={
                            row.enrollmentId
                              ? `/admin/payments/new?enrollmentId=${row.enrollmentId}`
                              : `/admin/payments/new`
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-ember/30 bg-ember/5 px-3 py-1.5 text-xs font-medium text-ember transition-colors hover:border-ember hover:bg-ember hover:text-white"
                        >
                          수납하기
                        </Link>
                      </td>

                      {/* 독촉 발송 */}
                      <td className="px-5 py-4">
                        {row.examNumber ? (
                          <RemindButton row={row} />
                        ) : (
                          <span className="text-xs text-slate">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Footer total */}
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist/80">
                  <td className="px-3 py-3" />
                  <td colSpan={5} className="px-5 py-3 text-xs font-semibold text-slate">
                    합계 ({filtered.length.toLocaleString()}건)
                  </td>
                  <td className="px-5 py-3 text-left font-mono text-sm font-semibold text-ember tabular-nums">
                    {formatKRW(filteredUnpaidAmount)}
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
