"use client";

import { useState } from "react";

type Props = {
  staffId: string;
  adminUserId: string;
  year: number;
  month: number;
  totalRevenue: number;
};

function formatKRW(amount: number) {
  return amount.toLocaleString("ko-KR") + "원";
}

export function StaffDetailClient({
  adminUserId,
  year,
  month,
  totalRevenue,
}: Props) {
  const [rateStr, setRateStr] = useState("");
  const [downloading, setDownloading] = useState(false);

  const rate = rateStr === "" ? 0 : parseFloat(rateStr);
  const validRate = isNaN(rate) ? 0 : Math.max(0, Math.min(100, rate));
  const commissionAmount = Math.floor(totalRevenue * (validRate / 100));

  function handleRateChange(value: string) {
    if (value === "" || /^\d{0,3}(\.\d{0,2})?$/.test(value)) {
      setRateStr(value);
    }
  }

  async function handleExcelDownload() {
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      params.set("year", String(year));
      params.set("month", String(month));
      if (validRate > 0) {
        params.set(`rates[${adminUserId}]`, String(validRate));
      }
      const res = await fetch(`/api/staff-settlements/export?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert((json as { error?: string }).error ?? "엑셀 다운로드에 실패했습니다.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `직원정산_${year}년${String(month).padStart(2, "0")}월.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Commission rate input */}
      <div className="flex items-center gap-2 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-2">
        <span className="text-sm text-amber-800">배분율</span>
        <input
          type="text"
          inputMode="decimal"
          value={rateStr}
          onChange={(e) => handleRateChange(e.target.value)}
          placeholder="0"
          className="w-16 rounded-lg border border-amber-300 bg-white px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
        />
        <span className="text-sm text-amber-800">%</span>
        {validRate > 0 && (
          <span className="ml-1 text-sm font-semibold text-ember">
            = {formatKRW(commissionAmount)}
          </span>
        )}
      </div>

      {/* Excel download */}
      <button
        onClick={handleExcelDownload}
        disabled={downloading}
        className="inline-flex items-center gap-2 rounded-full border border-forest/30 bg-forest/10 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/20 disabled:opacity-50"
      >
        {downloading ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-forest/40 border-t-forest" />
            다운로드 중...
          </>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            엑셀 다운로드
          </>
        )}
      </button>
    </div>
  );
}
