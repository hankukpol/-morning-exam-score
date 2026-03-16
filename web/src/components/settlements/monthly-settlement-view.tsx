"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type CategoryStat = { count: number; gross: number; refund: number };
type MethodStat = { count: number; amount: number };

type MonthlySummary = {
  tuition: CategoryStat;
  facility: CategoryStat;
  textbook: CategoryStat;
  material: CategoryStat;
  singleCourse: CategoryStat;
  penalty: CategoryStat;
  etc: CategoryStat;
  totalCount: number;
  grossTotal: number;
  refundTotal: number;
  netTotal: number;
};

type MonthlyMethods = {
  cash: MethodStat;
  card: MethodStat;
  transfer: MethodStat;
};

type DailyEntry = {
  date: string;
  count: number;
  gross: number;
  refund: number;
  net: number;
};

type MonthlyData = {
  month: string;
  summary: MonthlySummary;
  methods: MonthlyMethods;
  dailyBreakdown: DailyEntry[];
};

type Props = {
  initialData: MonthlyData;
};

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "요청에 실패했습니다.");
  return payload as T;
}

function formatAmt(amount: number): string {
  return amount.toLocaleString() + "원";
}

function addMonths(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatKoreanMonth(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  return `${y}년 ${m}월`;
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${m}/${day}(${weekdays[d.getDay()]})`;
}

/** Bar Chart용 단순 일(day) 레이블 */
function formatDayShort(dateStr: string): string {
  const day = parseInt(dateStr.split("-")[2], 10);
  return `${day}일`;
}

const CATEGORY_ROWS: Array<{
  key: keyof MonthlySummary;
  label: string;
}> = [
  { key: "tuition", label: "수강료" },
  { key: "facility", label: "시설비" },
  { key: "textbook", label: "교재" },
  { key: "material", label: "교구·소모품" },
  { key: "singleCourse", label: "단과 POS" },
  { key: "penalty", label: "위약금" },
  { key: "etc", label: "기타" },
];

/* ── Custom Tooltip ─────────────────────────────────── */
interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function DailyTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-ink/10 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {payload.map((item) => (
        <p key={item.name} style={{ color: item.color }}>
          {item.name}: {item.value.toLocaleString()}원
        </p>
      ))}
    </div>
  );
}

/* ── Main Component ─────────────────────────────────── */
export function MonthlySettlementView({ initialData }: Props) {
  const router = useRouter();
  const [data, setData] = useState<MonthlyData>(initialData);
  const [currentMonth, setCurrentMonth] = useState(initialData.month);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const thisMonth = currentMonthStr();

  const navigateToMonth = useCallback(
    (month: string) => {
      router.push(`/admin/settlements/monthly?month=${month}`);
    },
    [router],
  );

  async function fetchMonth(month: string) {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await requestJson<MonthlyData>(
          `/api/settlements/monthly?month=${month}`,
        );
        setData(result);
        setCurrentMonth(month);
        navigateToMonth(month);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "조회 실패");
      }
    });
  }

  async function handleExport() {
    setIsExporting(true);
    try {
      const url = `/api/settlements/monthly/export?month=${currentMonth}`;
      const res = await fetch(url);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "내보내기 실패");
      }
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `월계표_${currentMonth}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "내보내기 실패");
    } finally {
      setIsExporting(false);
    }
  }

  const { summary, methods, dailyBreakdown } = data;

  const visibleRows = CATEGORY_ROWS.filter(
    (row) => (summary[row.key] as CategoryStat).count > 0,
  );

  const methodTotal =
    methods.cash.amount + methods.card.amount + methods.transfer.amount;

  /* Bar Chart 데이터: 수납액은 만원 단위로 표시 */
  const chartData = dailyBreakdown.map((entry) => ({
    label: formatDayShort(entry.date),
    수납: Math.round(entry.gross / 10000),
    환불: Math.round(entry.refund / 10000),
  }));

  return (
    <div className="space-y-6">
      {/* Month Navigation + Excel button */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fetchMonth(addMonths(currentMonth, -1))}
          disabled={isPending}
          className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink disabled:opacity-50"
        >
          ◀ 전달
        </button>
        <span className="px-3 text-lg font-semibold text-ink">
          {formatKoreanMonth(currentMonth)}
        </span>
        <button
          type="button"
          onClick={() => fetchMonth(addMonths(currentMonth, 1))}
          disabled={isPending || currentMonth >= thisMonth}
          className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink disabled:opacity-50"
        >
          다음달 ▶
        </button>
        {currentMonth !== thisMonth && (
          <button
            type="button"
            onClick={() => fetchMonth(thisMonth)}
            disabled={isPending}
            className="rounded-full bg-forest px-3 py-1.5 text-xs font-medium text-white transition hover:bg-forest/90 disabled:opacity-50"
          >
            이번 달
          </button>
        )}

        <div className="ml-auto">
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || isPending}
            className="inline-flex items-center gap-2 rounded-full bg-ember px-4 py-1.5 text-sm font-medium text-white transition hover:bg-ember/90 disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8z"
                  />
                </svg>
                내보내는 중…
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
                Excel 내보내기
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">총 건수</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
            {summary.totalCount.toLocaleString()}건
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">수납 합계</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
            {summary.grossTotal.toLocaleString()}
            <span className="ml-1 text-base font-normal text-slate">원</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">환불 합계</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-red-600">
            -{summary.refundTotal.toLocaleString()}
            <span className="ml-1 text-base font-normal text-slate">원</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-5">
          <p className="text-xs font-medium text-forest/70">실수입</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-forest">
            {summary.netTotal.toLocaleString()}
            <span className="ml-1 text-base font-normal text-forest/70">원</span>
          </p>
        </div>
      </div>

      {/* Daily Bar Chart */}
      <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-sm font-semibold text-ink">일별 수납 현황</h2>
          <p className="mt-0.5 text-xs text-slate">단위: 만원</p>
        </div>
        <div className={`px-4 py-4 ${isPending ? "opacity-50" : ""}`}>
          {chartData.length === 0 ? (
            <div className="flex h-60 items-center justify-center text-sm text-slate">
              수납 내역이 없습니다.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                barGap={2}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#4B5563" }}
                  tickLine={false}
                  axisLine={{ stroke: "#E5E7EB" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#4B5563" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v}`}
                  width={40}
                />
                <Tooltip content={<DailyTooltip />} />
                <Bar dataKey="수납" fill="#1F4D3A" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="환불" fill="#C55A11" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        {/* Legend */}
        {chartData.length > 0 && (
          <div className="flex items-center gap-4 px-6 pb-4 text-xs text-slate">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#1F4D3A]" />
              수납
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#C55A11]" />
              환불
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Category Breakdown */}
        <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
          <div className="border-b border-ink/10 px-6 py-4">
            <h2 className="text-sm font-semibold text-ink">유형별 월 수납 집계</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-ink/5 bg-mist/50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate">유형</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate">건수</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate">수납액</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate">환불액</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate">실수입</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-ink/5 ${isPending ? "opacity-50" : ""}`}>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate">
                      수납 내역이 없습니다.
                    </td>
                  </tr>
                ) : null}
                {visibleRows.map((row) => {
                  const stat = summary[row.key] as CategoryStat;
                  const net = stat.gross - stat.refund;
                  return (
                    <tr key={row.key} className="hover:bg-mist/20 transition">
                      <td className="px-6 py-3 font-medium text-ink">{row.label}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-slate">
                        {stat.count.toLocaleString()}건
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-ink">
                        {stat.gross.toLocaleString()}원
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-red-600">
                        {stat.refund > 0 ? `-${stat.refund.toLocaleString()}원` : "-"}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums font-semibold text-forest">
                        {net.toLocaleString()}원
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist/30">
                  <td className="px-6 py-3 font-semibold text-ink">합계</td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-ink">
                    {summary.totalCount.toLocaleString()}건
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-ink">
                    {summary.grossTotal.toLocaleString()}원
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-red-600">
                    {summary.refundTotal > 0
                      ? `-${summary.refundTotal.toLocaleString()}원`
                      : "-"}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-bold text-forest">
                    {summary.netTotal.toLocaleString()}원
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Method Breakdown */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-ink">결제 수단별 집계</h2>
          <div className="space-y-4">
            {/* Cash bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-slate">현금</span>
                <span className="tabular-nums text-sm font-semibold text-ink">
                  {formatAmt(methods.cash.amount)}
                  <span className="ml-2 text-xs font-normal text-slate">
                    ({methods.cash.count}건)
                  </span>
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-ink/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-400"
                  style={{
                    width: methodTotal > 0
                      ? `${(methods.cash.amount / methodTotal) * 100}%`
                      : "0%",
                  }}
                />
              </div>
            </div>
            {/* Card bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-slate">카드</span>
                <span className="tabular-nums text-sm font-semibold text-ink">
                  {formatAmt(methods.card.amount)}
                  <span className="ml-2 text-xs font-normal text-slate">
                    ({methods.card.count}건)
                  </span>
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-ink/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-purple-400"
                  style={{
                    width: methodTotal > 0
                      ? `${(methods.card.amount / methodTotal) * 100}%`
                      : "0%",
                  }}
                />
              </div>
            </div>
            {/* Transfer bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-slate">계좌이체</span>
                <span className="tabular-nums text-sm font-semibold text-ink">
                  {formatAmt(methods.transfer.amount)}
                  <span className="ml-2 text-xs font-normal text-slate">
                    ({methods.transfer.count}건)
                  </span>
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-ink/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-400"
                  style={{
                    width: methodTotal > 0
                      ? `${(methods.transfer.amount / methodTotal) * 100}%`
                      : "0%",
                  }}
                />
              </div>
            </div>

            <div className="border-t border-ink/10 pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">수납 합계</span>
                <span className="tabular-nums text-sm font-semibold text-ink">
                  {formatAmt(summary.grossTotal)}
                </span>
              </div>
              {summary.refundTotal > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-red-600">환불 합계</span>
                  <span className="tabular-nums text-sm font-semibold text-red-600">
                    -{formatAmt(summary.refundTotal)}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t border-ink/10 pt-2">
                <span className="text-base font-bold text-forest">실수입</span>
                <span className="tabular-nums text-base font-bold text-forest">
                  {formatAmt(summary.netTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Breakdown Table */}
      <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-sm font-semibold text-ink">일별 수납 추이</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-mist/50">
                <th className="px-6 py-3 text-left text-xs font-medium text-slate">날짜</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate">건수</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate">수납액</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate">환불액</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate">실수입</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-ink/10 ${isPending ? "opacity-50" : ""}`}>
              {dailyBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate">
                    수납 내역이 없습니다.
                  </td>
                </tr>
              ) : null}
              {dailyBreakdown.map((entry) => (
                <tr key={entry.date} className="hover:bg-mist/20 transition">
                  <td className="px-6 py-3 font-medium text-ink whitespace-nowrap">
                    {formatDayLabel(entry.date)}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums text-slate">
                    {entry.count.toLocaleString()}건
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums text-ink">
                    {entry.gross.toLocaleString()}원
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums text-red-600">
                    {entry.refund > 0 ? `-${entry.refund.toLocaleString()}원` : "-"}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-forest">
                    {entry.net.toLocaleString()}원
                  </td>
                </tr>
              ))}
            </tbody>
            {dailyBreakdown.length > 0 ? (
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist/30">
                  <td className="px-6 py-3 font-semibold text-ink">합계</td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-ink">
                    {summary.totalCount.toLocaleString()}건
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-ink">
                    {summary.grossTotal.toLocaleString()}원
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-red-600">
                    {summary.refundTotal > 0
                      ? `-${summary.refundTotal.toLocaleString()}원`
                      : "-"}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums font-bold text-forest">
                    {summary.netTotal.toLocaleString()}원
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </div>
  );
}
