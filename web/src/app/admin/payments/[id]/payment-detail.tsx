"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PaymentCategory, PaymentMethod, PaymentStatus, RefundType } from "@prisma/client";
import {
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_CATEGORY_COLOR,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_COLOR,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { RefundModal } from "@/components/payments/refund-modal";

export type RefundRecord = {
  id: string;
  refundType: RefundType;
  amount: number;
  reason: string;
  bankName: string | null;
  accountNo: string | null;
  accountHolder: string | null;
  processedAt: string;
};

export type PaymentItemRecord = {
  id: string;
  itemType: PaymentCategory;
  itemName: string;
  unitPrice: number;
  quantity: number;
  amount: number;
};

export type PaymentDetailData = {
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
  items: PaymentItemRecord[];
  refunds: RefundRecord[];
};

const REFUND_TYPE_LABEL: Record<RefundType, string> = {
  CARD_CANCEL: "카드취소",
  CASH: "현금환불",
  TRANSFER: "계좌이체",
  PARTIAL: "부분환불",
};

export function PaymentDetail({ payment: initial }: { payment: PaymentDetailData }) {
  const router = useRouter();
  const [payment, setPayment] = useState(initial);
  const [refundOpen, setRefundOpen] = useState(false);

  const totalRefunded = payment.refunds.reduce((s, r) => s + r.amount, 0);
  const canRefund =
    payment.status === "APPROVED" || payment.status === "PARTIAL_REFUNDED";

  async function handleRefundSuccess() {
    setRefundOpen(false);
    router.refresh();
    const res = await fetch(`/api/payments/${payment.id}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setPayment(data.payment as PaymentDetailData);
    }
  }

  const fieldClass = "flex justify-between py-2.5 border-b border-ink/5 last:border-0";
  const keyClass = "text-sm text-slate";
  const valClass = "text-sm font-medium text-ink text-right";

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        {/* 결제 정보 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-base font-semibold text-ink mb-4">결제 정보</h2>
          <div>
            <div className={fieldClass}>
              <span className={keyClass}>학생</span>
              <span className={valClass}>
                {payment.student ? (
                  <>
                    {payment.student.name}
                    {payment.examNumber ? (
                      <span className="ml-1 text-xs text-slate">({payment.examNumber})</span>
                    ) : null}
                  </>
                ) : (
                  "비회원"
                )}
              </span>
            </div>
            <div className={fieldClass}>
              <span className={keyClass}>처리일시</span>
              <span className={valClass}>{formatDateTime(payment.processedAt)}</span>
            </div>
            <div className={fieldClass}>
              <span className={keyClass}>처리자</span>
              <span className={valClass}>{payment.processor.name}</span>
            </div>
            <div className={fieldClass}>
              <span className={keyClass}>수납 유형</span>
              <span className={valClass}>
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${PAYMENT_CATEGORY_COLOR[payment.category]}`}
                >
                  {PAYMENT_CATEGORY_LABEL[payment.category]}
                </span>
              </span>
            </div>
            <div className={fieldClass}>
              <span className={keyClass}>결제 수단</span>
              <span className={valClass}>{PAYMENT_METHOD_LABEL[payment.method]}</span>
            </div>
            <div className={fieldClass}>
              <span className={keyClass}>상태</span>
              <span className={valClass}>
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${PAYMENT_STATUS_COLOR[payment.status]}`}
                >
                  {PAYMENT_STATUS_LABEL[payment.status]}
                </span>
              </span>
            </div>
            <div className={fieldClass}>
              <span className={keyClass}>청구금액</span>
              <span className={valClass}>{payment.grossAmount.toLocaleString()}원</span>
            </div>
            {payment.discountAmount > 0 ? (
              <div className={fieldClass}>
                <span className={keyClass}>할인</span>
                <span className="text-sm font-medium text-red-600 text-right">
                  -{payment.discountAmount.toLocaleString()}원
                </span>
              </div>
            ) : null}
            <div className={fieldClass}>
              <span className={keyClass}>실납부금액</span>
              <span className="text-sm font-bold text-forest text-right">
                {payment.netAmount.toLocaleString()}원
              </span>
            </div>
            {totalRefunded > 0 ? (
              <div className={fieldClass}>
                <span className={keyClass}>환불 합계</span>
                <span className="text-sm font-medium text-red-600 text-right">
                  -{totalRefunded.toLocaleString()}원
                </span>
              </div>
            ) : null}
            {payment.note ? (
              <div className={fieldClass}>
                <span className={keyClass}>비고</span>
                <span className={valClass}>{payment.note}</span>
              </div>
            ) : null}
          </div>

          {/* Action */}
          {canRefund ? (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setRefundOpen(true)}
                className="w-full rounded-full border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              >
                환불 처리
              </button>
            </div>
          ) : null}
        </div>

        {/* 결제 항목 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-base font-semibold text-ink mb-4">결제 항목</h2>
          {payment.items.length === 0 ? (
            <p className="text-sm text-slate">항목 없음</p>
          ) : (
            <div className="space-y-2">
              {payment.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl bg-mist/50 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{item.itemName}</p>
                    <p className="mt-0.5 text-xs text-slate">
                      {item.unitPrice.toLocaleString()}원 × {item.quantity}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-ink tabular-nums">
                    {item.amount.toLocaleString()}원
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 환불 내역 */}
        {payment.refunds.length > 0 ? (
          <div className="rounded-[28px] border border-red-100 bg-white p-6 md:col-span-2">
            <h2 className="text-base font-semibold text-red-700 mb-4">환불 내역</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm divide-y divide-ink/10">
                <thead>
                  <tr>
                    {["처리일시", "유형", "금액", "사유", "계좌 정보"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-xs font-medium text-slate uppercase bg-mist/50 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {payment.refunds.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                        {formatDateTime(r.processedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                          {REFUND_TYPE_LABEL[r.refundType]}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-red-600 tabular-nums whitespace-nowrap">
                        -{r.amount.toLocaleString()}원
                      </td>
                      <td className="px-4 py-3 text-slate max-w-[200px] truncate">{r.reason}</td>
                      <td className="px-4 py-3 text-xs text-slate">
                        {r.accountHolder
                          ? `${r.bankName ?? ""} ${r.accountNo ?? ""} (${r.accountHolder})`
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {/* Back button */}
      <div className="mt-6">
        <a
          href="/admin/payments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 목록으로
        </a>
      </div>

      {/* Refund Modal */}
      <RefundModal
        open={refundOpen}
        paymentId={payment.id}
        studentName={payment.student?.name ?? null}
        netAmount={payment.netAmount}
        alreadyRefunded={totalRefunded}
        onClose={() => setRefundOpen(false)}
        onSuccess={handleRefundSuccess}
      />
    </>
  );
}
