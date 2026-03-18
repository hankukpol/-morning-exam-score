"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

type PaymentRow = {
  id: string;
  examNumber: string | null;
  studentName: string | null;
  cohortName: string | null;
  netAmount: number;
  method: string;
  category: string;
  processedAt: string;
  enrollmentId: string | null;
};

type Props = {
  payments: PaymentRow[];
  totalAmount: number;
  receiptReadyCount: number;
  initialFrom: string;
  initialTo: string;
  initialSearch: string;
};

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMethodLabel(method: string): string {
  const map: Record<string, string> = {
    CASH: "현금",
    CARD: "카드",
    TRANSFER: "이체",
    POINT: "포인트",
    MIXED: "혼합",
  };
  return map[method] ?? method;
}

function getMethodBadgeClass(method: string): string {
  switch (method) {
    case "CASH":
      return "bg-green-50 text-green-700 border-green-200";
    case "CARD":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "TRANSFER":
      return "bg-purple-50 text-purple-700 border-purple-200";
    default:
      return "bg-gray-50 text-gray-600 border-gray-200";
  }
}

function getCategoryLabel(category: string): string {
  const map: Record<string, string> = {
    TUITION: "수강료",
    FACILITY: "시설비",
    TEXTBOOK: "교재",
    MATERIAL: "교구",
    SINGLE_COURSE: "단과",
    PENALTY: "위약금",
    ETC: "기타",
  };
  return map[category] ?? category;
}

export function ReceiptHubClient({
  payments,
  totalAmount,
  receiptReadyCount,
  initialFrom,
  initialTo,
  initialSearch,
}: Props) {
  const [search, setSearch] = useState(initialSearch);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = payments.filter((p) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (p.studentName ?? "").toLowerCase().includes(q) ||
      (p.examNumber ?? "").toLowerCase().includes(q) ||
      (p.cohortName ?? "").toLowerCase().includes(q)
    );
  });

  const allFilteredIds = filtered.map((p) => p.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.has(id));

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allFilteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allFilteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [allSelected, allFilteredIds]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedPayments = filtered.filter((p) => selectedIds.has(p.id));

  const handleBulkPrint = () => {
    // Open each enrollment card in new windows/tabs
    const enrollmentIds = selectedPayments
      .filter((p) => p.enrollmentId)
      .map((p) => p.enrollmentId as string);
    if (enrollmentIds.length === 0) {
      alert("영수증을 출력할 수 있는 수납 건이 없습니다. (수강 연동 건만 출력 가능)");
      return;
    }
    enrollmentIds.forEach((id) => {
      window.open(`/admin/enrollments/${id}/card`, "_blank");
    });
  };

  const handleExcelExport = () => {
    const params = new URLSearchParams({
      from: initialFrom,
      to: initialTo,
      type: "payments",
    });
    window.open(`/api/admin/export/payments?${params.toString()}`, "_blank");
  };

  return (
    <div>
      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate">수납 건수</p>
          <p className="mt-2 text-3xl font-bold text-ink">{payments.length.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-slate">건</p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate">총 금액</p>
          <p className="mt-2 text-2xl font-bold text-ink">
            {totalAmount >= 10000
              ? `${Math.floor(totalAmount / 10000).toLocaleString()}만원`
              : formatKRW(totalAmount)}
          </p>
          <p className="mt-0.5 text-xs text-slate">{formatKRW(totalAmount)}</p>
        </div>
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-5 shadow-sm">
          <p className="text-xs font-medium text-forest">영수증 발급 가능</p>
          <p className="mt-2 text-3xl font-bold text-forest">{receiptReadyCount.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-forest/70">수강 연동 건</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form method="GET" className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-ink">기간</label>
            <input
              type="date"
              name="from"
              defaultValue={initialFrom}
              className="rounded-2xl border border-ink/10 px-3 py-2 text-sm"
            />
            <span className="text-slate">~</span>
            <input
              type="date"
              name="to"
              defaultValue={initialTo}
              className="rounded-2xl border border-ink/10 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-forest"
          >
            조회
          </button>
        </form>
        <input
          type="search"
          placeholder="학생 검색 (이름·학번·반)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-2xl border border-ink/10 px-4 py-2 text-sm w-56"
        />
        <div className="flex-1" />
        <button
          onClick={handleExcelExport}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
        >
          엑셀 내보내기
        </button>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-ember/20 bg-ember/5 px-4 py-3">
          <span className="text-sm font-medium text-ember">
            {selectedIds.size}건 선택됨
          </span>
          <button
            onClick={handleBulkPrint}
            className="inline-flex items-center gap-2 rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            선택 영수증 일괄 출력
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <h2 className="font-semibold text-ink">
            수납 내역
            <span className="ml-2 text-sm font-normal text-slate">{filtered.length}건</span>
          </h2>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate">해당 기간에 수납 내역이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist/50">
                  <th className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-slate">일시</th>
                  <th className="px-4 py-3 text-left font-medium text-slate">학생</th>
                  <th className="px-4 py-3 text-left font-medium text-slate">반/기수</th>
                  <th className="px-4 py-3 text-left font-medium text-slate">구분</th>
                  <th className="px-4 py-3 text-left font-medium text-slate">결제방법</th>
                  <th className="px-4 py-3 text-right font-medium text-slate">금액</th>
                  <th className="px-4 py-3 text-center font-medium text-slate">영수증</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={[
                      "border-b border-ink/5 last:border-0 hover:bg-mist/30",
                      selectedIds.has(p.id) ? "bg-ember/5" : "",
                    ].join(" ")}
                  >
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3 text-slate text-xs">{formatDate(p.processedAt)}</td>
                    <td className="px-4 py-3">
                      {p.examNumber ? (
                        <Link
                          href={`/admin/students/${p.examNumber}`}
                          className="font-medium text-ink hover:text-ember"
                        >
                          {p.studentName ?? p.examNumber}
                          <span className="ml-1 font-mono text-xs text-slate">
                            {p.examNumber}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate text-xs">{p.cohortName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-ink/5 px-2 py-0.5 text-xs font-medium text-ink">
                        {getCategoryLabel(p.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getMethodBadgeClass(p.method)}`}
                      >
                        {getMethodLabel(p.method)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">
                      {formatKRW(p.netAmount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.enrollmentId ? (
                        <button
                          onClick={() =>
                            window.open(`/admin/enrollments/${p.enrollmentId}/card`, "_blank")
                          }
                          className="inline-flex items-center gap-1 rounded-full bg-forest/10 px-3 py-1.5 text-xs font-semibold text-forest transition hover:bg-forest/20"
                        >
                          영수증 출력
                        </button>
                      ) : (
                        <span className="text-xs text-slate/50">비해당</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
