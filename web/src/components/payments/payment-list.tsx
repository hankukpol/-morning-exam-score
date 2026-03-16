"use client";

import Link from "next/link";
import { useState } from "react";
import { PaymentCategory, PaymentMethod, PaymentStatus } from "@prisma/client";
import {
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_CATEGORY_COLOR,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_COLOR,
} from "@/lib/constants";
import { formatDateTime, todayDateInputValue } from "@/lib/format";

export type PaymentItemSnapshot = {
  id: string;
  itemType: PaymentCategory;
  itemName: string;
  unitPrice: number;
  quantity: number;
  amount: number;
};

export type PaymentWithRelations = {
  id: string;
  examNumber: string | null;
  category: PaymentCategory;
  method: PaymentMethod;
  status: PaymentStatus;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  note: string | null;
  processedAt: string;
  student: { name: string; phone: string | null } | null;
  processor: { name: string };
  items: PaymentItemSnapshot[];
  refunds: { amount: number }[];
};

type Props = {
  initialPayments: PaymentWithRelations[];
};

const CATEGORY_FILTERS: Array<{ value: PaymentCategory | "ALL"; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "TUITION", label: "수강료" },
  { value: "TEXTBOOK", label: "교재" },
  { value: "FACILITY", label: "시설비" },
  { value: "MATERIAL", label: "교구·소모품" },
  { value: "ETC", label: "기타" },
];

const METHOD_FILTERS: Array<{ value: PaymentMethod | "ALL"; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "CASH", label: "현금" },
  { value: "TRANSFER", label: "이체" },
  { value: "CARD", label: "카드" },
];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "요청에 실패했습니다.");
  return payload as T;
}

function itemsSummary(items: PaymentItemSnapshot[]): string {
  if (items.length === 0) return "-";
  if (items.length === 1) {
    const it = items[0];
    return it.quantity > 1 ? `${it.itemName} ×${it.quantity}` : it.itemName;
  }
  return `${items[0].itemName} 외 ${items.length - 1}건`;
}

export function PaymentList({ initialPayments }: Props) {
  const today = todayDateInputValue();
  const [payments, setPayments] = useState<PaymentWithRelations[]>(initialPayments);
  const [filterCategory, setFilterCategory] = useState<PaymentCategory | "ALL">("ALL");
  const [filterMethod, setFilterMethod] = useState<PaymentMethod | "ALL">("ALL");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function fetchPayments() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const sp = new URLSearchParams();
      if (filterCategory !== "ALL") sp.set("category", filterCategory);
      if (filterMethod !== "ALL") sp.set("method", filterMethod);
      if (fromDate) sp.set("from", fromDate);
      if (toDate) sp.set("to", toDate);
      sp.set("limit", "200");

      const result = await requestJson<{ payments: PaymentWithRelations[] }>(
        `/api/payments?${sp.toString()}`,
      );
      setPayments(result.payments);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  const filtered = payments.filter((p) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const nameMatch = p.student?.name.toLowerCase().includes(q) ?? false;
      const numMatch = p.examNumber?.includes(q) ?? false;
      if (!nameMatch && !numMatch) return false;
    }
    return true;
  });

  const totalRefunded = filtered.reduce(
    (sum, p) => sum + p.refunds.reduce((rs, r) => rs + r.amount, 0),
    0,
  );
  const totalGross = filtered.reduce((sum, p) => sum + p.grossAmount, 0);
  const totalNet = filtered.reduce((sum, p) => sum + p.netAmount, 0);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          {/* Category filter */}
          <div className="flex flex-wrap gap-1">
            {CATEGORY_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilterCategory(f.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filterCategory === f.value
                    ? "bg-ember text-white"
                    : "border border-ink/10 bg-white text-slate hover:border-ink/30"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Method filter */}
          <div className="flex flex-wrap gap-1">
            {METHOD_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilterMethod(f.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filterMethod === f.value
                    ? "bg-ink text-white"
                    : "border border-ink/10 bg-white text-slate hover:border-ink/30"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Date range + search */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-full border border-ink/10 px-3 py-1.5 text-sm outline-none focus:border-ink/30"
            />
            <span className="text-xs text-slate">~</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-full border border-ink/10 px-3 py-1.5 text-sm outline-none focus:border-ink/30"
            />
            <button
              type="button"
              onClick={fetchPayments}
              disabled={loading}
              className="rounded-full bg-forest px-4 py-1.5 text-xs font-medium text-white transition hover:bg-forest/90 disabled:opacity-50"
            >
              {loading ? "조회 중..." : "조회"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 또는 수험번호"
            className="rounded-full border border-ink/10 px-4 py-2 text-sm outline-none focus:border-ink/30 w-48"
          />
          <Link
            href="/admin/payments/new"
            className="inline-flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90 whitespace-nowrap"
          >
            <span>+</span>
            <span>수납 등록</span>
          </Link>
        </div>
      </div>

      {/* Error */}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {/* Summary bar */}
      <div className="flex flex-wrap gap-4 rounded-[28px] border border-ink/10 bg-white px-6 py-4">
        <div className="flex flex-col">
          <span className="text-xs text-slate">총 건수</span>
          <span className="mt-0.5 text-lg font-semibold text-ink tabular-nums">
            {filtered.length.toLocaleString()}건
          </span>
        </div>
        <div className="w-px bg-ink/10 self-stretch" />
        <div className="flex flex-col">
          <span className="text-xs text-slate">청구 합계</span>
          <span className="mt-0.5 text-lg font-semibold text-ink tabular-nums">
            {totalGross.toLocaleString()}원
          </span>
        </div>
        <div className="w-px bg-ink/10 self-stretch" />
        <div className="flex flex-col">
          <span className="text-xs text-slate">실납부 합계</span>
          <span className="mt-0.5 text-lg font-semibold text-forest tabular-nums">
            {totalNet.toLocaleString()}원
          </span>
        </div>
        {totalRefunded > 0 ? (
          <>
            <div className="w-px bg-ink/10 self-stretch" />
            <div className="flex flex-col">
              <span className="text-xs text-slate">환불 합계</span>
              <span className="mt-0.5 text-lg font-semibold text-red-600 tabular-nums">
                -{totalRefunded.toLocaleString()}원
              </span>
            </div>
          </>
        ) : null}
      </div>

      {/* Table */}
      <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead>
              <tr>
                {[
                  "날짜/시간",
                  "학생",
                  "유형",
                  "결제수단",
                  "내역",
                  "청구금액",
                  "실납부금액",
                  "처리자",
                  "상태",
                  "비고",
                  "",
                ].map((header) => (
                  <th
                    key={header}
                    className="text-xs font-medium text-slate uppercase px-4 py-3 bg-mist/50 text-left whitespace-nowrap"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y divide-ink/10 ${loading ? "opacity-60" : ""}`}>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate">
                    수납 내역이 없습니다.
                  </td>
                </tr>
              ) : null}
              {filtered.map((payment) => (
                <tr key={payment.id} className="hover:bg-mist/30 transition">
                  {/* 날짜/시간 */}
                  <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                    {formatDateTime(payment.processedAt)}
                  </td>

                  {/* 학생 */}
                  <td className="px-4 py-3">
                    {payment.student ? (
                      <div>
                        <div className="font-medium text-ink">{payment.student.name}</div>
                        {payment.examNumber ? (
                          <div className="mt-0.5 text-xs text-slate">{payment.examNumber}</div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-slate">비회원</span>
                    )}
                  </td>

                  {/* 유형 badge */}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${PAYMENT_CATEGORY_COLOR[payment.category]}`}
                    >
                      {PAYMENT_CATEGORY_LABEL[payment.category]}
                    </span>
                  </td>

                  {/* 결제수단 badge */}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                        payment.method === "CASH"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : payment.method === "TRANSFER"
                            ? "border-sky-200 bg-sky-50 text-sky-800"
                            : payment.method === "CARD"
                              ? "border-purple-200 bg-purple-50 text-purple-800"
                              : "border-ink/20 bg-ink/5 text-slate"
                      }`}
                    >
                      {PAYMENT_METHOD_LABEL[payment.method]}
                    </span>
                  </td>

                  {/* 내역 */}
                  <td className="px-4 py-3 text-sm text-slate max-w-[160px] truncate">
                    {itemsSummary(payment.items)}
                  </td>

                  {/* 청구금액 */}
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                    <span className="text-sm text-ink">
                      {payment.grossAmount.toLocaleString()}원
                    </span>
                    {payment.discountAmount > 0 ? (
                      <div className="mt-0.5 text-xs text-slate">
                        할인 -{payment.discountAmount.toLocaleString()}원
                      </div>
                    ) : null}
                  </td>

                  {/* 실납부금액 */}
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                    <span className="text-sm font-semibold text-forest">
                      {payment.netAmount.toLocaleString()}원
                    </span>
                    {payment.refunds.length > 0 ? (
                      <div className="mt-0.5 text-xs text-red-600">
                        환불 -{payment.refunds
                          .reduce((s, r) => s + r.amount, 0)
                          .toLocaleString()}원
                      </div>
                    ) : null}
                  </td>

                  {/* 처리자 */}
                  <td className="px-4 py-3 text-sm text-slate whitespace-nowrap">
                    {payment.processor.name}
                  </td>

                  {/* 상태 badge */}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${PAYMENT_STATUS_COLOR[payment.status]}`}
                    >
                      {PAYMENT_STATUS_LABEL[payment.status]}
                    </span>
                  </td>

                  {/* 비고 */}
                  <td className="px-4 py-3 text-xs text-slate max-w-[120px] truncate">
                    {payment.note ?? "-"}
                  </td>

                  {/* 상세 */}
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/payments/${payment.id}`}
                      className="inline-flex rounded-full border border-ink/10 px-3 py-1 text-xs text-slate transition hover:border-ink/30 hover:text-ink whitespace-nowrap"
                    >
                      상세
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
