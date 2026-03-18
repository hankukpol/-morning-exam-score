import { AdminRole, PaymentMethod } from "@prisma/client";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  POINT: "포인트",
  MIXED: "혼합",
};

const PAYMENT_CATEGORY_LABEL: Record<string, string> = {
  TUITION: "수강료",
  FACILITY: "시설비",
  TEXTBOOK: "교재",
  MATERIAL: "교구·소모품",
  SINGLE_COURSE: "단과 POS",
  PENALTY: "위약금",
  ETC: "기타",
};

function formatReceiptDate(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatReceiptDateTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${formatReceiptDate(date)} ${h}:${m}`;
}

export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;

  const payment = await getPrisma().payment.findUnique({
    where: { id },
    include: {
      student: { select: { examNumber: true, name: true, phone: true } },
      processor: { select: { name: true } },
      items: {
        select: {
          id: true,
          itemType: true,
          itemName: true,
          unitPrice: true,
          quantity: true,
          amount: true,
        },
        orderBy: { id: "asc" },
      },
      refunds: {
        where: { status: "COMPLETED" },
        select: {
          id: true,
          amount: true,
          reason: true,
          processedAt: true,
        },
        orderBy: { processedAt: "asc" },
      },
    },
  });

  if (!payment) notFound();

  // Fetch enrollment info separately
  let enrollmentLabel: string | null = null;
  if (payment.enrollmentId) {
    const enrollment = await getPrisma().courseEnrollment.findUnique({
      where: { id: payment.enrollmentId },
      include: {
        cohort: { select: { name: true } },
        specialLecture: { select: { name: true } },
        product: { select: { name: true } },
      },
    });
    if (enrollment) {
      enrollmentLabel =
        enrollment.cohort?.name ??
        enrollment.specialLecture?.name ??
        enrollment.product?.name ??
        null;
    }
  }

  const receiptNo = id.slice(-8).toUpperCase();
  const paidAt = new Date(payment.processedAt);
  const studentName = payment.student?.name ?? "비회원";
  const studentExamNo = payment.student?.examNumber ?? payment.examNumber ?? null;
  const studentPhone = payment.student?.phone ?? null;
  const processorName = payment.processor?.name ?? "-";
  const methodLabel = PAYMENT_METHOD_LABEL[payment.method] ?? payment.method;
  const categoryLabel = PAYMENT_CATEGORY_LABEL[payment.category] ?? payment.category;

  const totalRefunded = payment.refunds.reduce((sum, r) => sum + r.amount, 0);
  const hasDiscount =
    payment.discountAmount > 0 ||
    payment.couponAmount > 0 ||
    payment.pointAmount > 0;

  return (
    <div className="min-h-screen bg-[#F7F4EF]">
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
          .receipt-wrapper {
            padding: 0 !important;
            background: white !important;
            display: flex !important;
            justify-content: center !important;
          }
          .receipt-paper {
            width: 100% !important;
            max-width: none !important;
            box-shadow: none !important;
            border: 1px solid #ccc !important;
            border-radius: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>

      {/* Top bar — hidden when printing */}
      <div className="no-print flex items-center justify-between gap-4 border-b border-[#111827]/10 bg-white px-6 py-4">
        <a
          href={`/admin/payments/${id}`}
          className="inline-flex items-center gap-2 rounded-full border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
        >
          ← 수납 상세로
        </a>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#4B5563]">영수증 #{receiptNo}</span>
          <PrintButton />
        </div>
      </div>

      {/* Receipt preview area */}
      <div className="receipt-wrapper flex justify-center p-8">
        <div
          className="receipt-paper w-full max-w-[620px] overflow-hidden rounded-[16px] border border-[#111827]/15 bg-white shadow-xl"
          style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
        >
          {/* ── Header ── */}
          <div
            className="px-10 pb-6 pt-8"
            style={{ backgroundColor: "#1F4D3A" }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  Korea Police Academy
                </p>
                <p className="mt-1.5 text-3xl font-bold tracking-wide text-white">
                  수납 영수증
                </p>
                <p
                  className="mt-1 text-xs"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                >
                  PAYMENT RECEIPT
                </p>
              </div>
              <div className="text-right">
                <p
                  className="text-[11px]"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  영수증 번호
                </p>
                <p className="mt-1 text-lg font-bold tracking-widest text-white">
                  #{receiptNo}
                </p>
              </div>
            </div>
          </div>

          {/* ── Academy info band ── */}
          <div
            className="flex flex-wrap items-center justify-between gap-2 px-10 py-2.5 text-[11px]"
            style={{ backgroundColor: "#C55A11", color: "white" }}
          >
            <span className="font-semibold">한국경찰학원</span>
            <span>대구광역시 중구 중앙대로 390 센트럴엠빌딩&nbsp;｜&nbsp;053-241-0112</span>
          </div>

          {/* ── Issue date ── */}
          <div className="flex justify-between px-10 pt-5 text-sm">
            <div>
              <span className="text-[#4B5563]">수납일시&nbsp;</span>
              <span className="font-semibold text-[#111827]">
                {formatReceiptDateTime(paidAt)}
              </span>
            </div>
            <div>
              <span className="text-[#4B5563]">수납 유형&nbsp;</span>
              <span className="font-semibold text-[#111827]">{categoryLabel}</span>
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="mx-10 my-4 border-t border-dashed border-[#111827]/15" />

          {/* ── Student info ── */}
          <div className="px-10">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#4B5563]">
              수납자 정보
            </p>
            <div className="space-y-0 divide-y divide-[#111827]/6 text-sm">
              <div className="flex justify-between py-2.5">
                <span className="text-[#4B5563]">학생명</span>
                <span className="font-medium text-[#111827]">{studentName}</span>
              </div>
              {studentExamNo ? (
                <div className="flex justify-between py-2.5">
                  <span className="text-[#4B5563]">학번</span>
                  <span className="font-medium tabular-nums text-[#111827]">{studentExamNo}</span>
                </div>
              ) : null}
              {studentPhone ? (
                <div className="flex justify-between py-2.5">
                  <span className="text-[#4B5563]">연락처</span>
                  <span className="font-medium tabular-nums text-[#111827]">{studentPhone}</span>
                </div>
              ) : null}
              {enrollmentLabel ? (
                <div className="flex justify-between py-2.5">
                  <span className="text-[#4B5563]">수강 강좌</span>
                  <span className="max-w-[280px] text-right font-medium leading-snug text-[#111827]">
                    {enrollmentLabel}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="mx-10 my-4 border-t border-dashed border-[#111827]/15" />

          {/* ── Payment items table ── */}
          <div className="px-10">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#4B5563]">
              수납 항목
            </p>
            {payment.items.length === 0 ? (
              <p className="text-xs text-[#4B5563]">항목 없음</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-[#111827]/10 text-[11px] text-[#4B5563]">
                    <th className="py-2 text-left font-medium">항목</th>
                    <th className="py-2 text-center font-medium">단가</th>
                    <th className="py-2 text-center font-medium">수량</th>
                    <th className="py-2 text-right font-medium">금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#111827]/6">
                  {payment.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2.5 text-[#111827]">{item.itemName}</td>
                      <td className="py-2.5 text-center tabular-nums text-[#4B5563]">
                        {item.unitPrice.toLocaleString("ko-KR")}원
                      </td>
                      <td className="py-2.5 text-center tabular-nums text-[#4B5563]">
                        {item.quantity}
                      </td>
                      <td className="py-2.5 text-right font-medium tabular-nums text-[#111827]">
                        {item.amount.toLocaleString("ko-KR")}원
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Totals ── */}
          <div className="mx-10 mt-3 space-y-0 divide-y divide-[#111827]/6 border-t border-[#111827]/15 text-sm">
            {hasDiscount ? (
              <>
                <div className="flex justify-between py-2">
                  <span className="text-[#4B5563]">소계</span>
                  <span className="tabular-nums text-[#111827]">
                    {payment.grossAmount.toLocaleString("ko-KR")}원
                  </span>
                </div>
                {payment.discountAmount > 0 ? (
                  <div className="flex justify-between py-2">
                    <span className="text-[#4B5563]">할인금액</span>
                    <span className="tabular-nums text-red-600">
                      -{payment.discountAmount.toLocaleString("ko-KR")}원
                    </span>
                  </div>
                ) : null}
                {payment.couponAmount > 0 ? (
                  <div className="flex justify-between py-2">
                    <span className="text-[#4B5563]">쿠폰 할인</span>
                    <span className="tabular-nums text-red-600">
                      -{payment.couponAmount.toLocaleString("ko-KR")}원
                    </span>
                  </div>
                ) : null}
                {payment.pointAmount > 0 ? (
                  <div className="flex justify-between py-2">
                    <span className="text-[#4B5563]">포인트 사용</span>
                    <span className="tabular-nums text-red-600">
                      -{payment.pointAmount.toLocaleString("ko-KR")}원
                    </span>
                  </div>
                ) : null}
              </>
            ) : null}
            <div className="flex justify-between py-3">
              <span className="font-bold text-[#111827]">합계 (실수납액)</span>
              <span className="text-xl font-bold tabular-nums text-[#1F4D3A]">
                {payment.netAmount.toLocaleString("ko-KR")}원
              </span>
            </div>
          </div>

          {/* ── Payment method row ── */}
          <div className="mx-10 mt-1 space-y-0 divide-y divide-[#111827]/6 border-t border-[#111827]/10 text-sm">
            <div className="flex justify-between py-2">
              <span className="text-[#4B5563]">결제 수단</span>
              <span className="font-medium text-[#111827]">{methodLabel}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-[#4B5563]">처리 담당</span>
              <span className="font-medium text-[#111827]">{processorName}</span>
            </div>
          </div>

          {/* ── Refunds (completed) ── */}
          {payment.refunds.length > 0 ? (
            <>
              <div className="mx-10 my-4 border-t border-dashed border-red-200" />
              <div className="px-10">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-red-600">
                  환불 내역
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-red-100 text-[11px] text-red-500">
                      <th className="py-1.5 text-left font-medium">환불일</th>
                      <th className="py-1.5 text-left font-medium">사유</th>
                      <th className="py-1.5 text-right font-medium">금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-50">
                    {payment.refunds.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 text-[#4B5563]">
                          {formatReceiptDate(new Date(r.processedAt))}
                        </td>
                        <td className="py-2 text-[#4B5563]">{r.reason}</td>
                        <td className="py-2 text-right tabular-nums font-semibold text-red-600">
                          -{r.amount.toLocaleString("ko-KR")}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-between border-t border-red-100 pt-2 text-sm">
                  <span className="font-bold text-red-700">환불 합계</span>
                  <span className="tabular-nums font-bold text-red-700">
                    -{totalRefunded.toLocaleString("ko-KR")}원
                  </span>
                </div>
              </div>
            </>
          ) : null}

          {/* ── Footer ── */}
          <div className="mx-10 mb-8 mt-6">
            {/* Divider */}
            <div className="border-t-2 border-[#111827]/20" />

            {/* Statement */}
            <p className="mt-5 text-center text-lg font-bold text-[#111827]">
              위 금액을 정히 영수함
            </p>

            {/* Stamp + signature area */}
            <div className="mt-5 flex items-end justify-between">
              <div className="text-sm text-[#4B5563]">
                <p>{formatReceiptDate(paidAt)}</p>
                <p className="mt-1 font-semibold text-[#111827]">한국경찰학원</p>
                <p className="text-xs text-[#4B5563]">대구광역시 중구 중앙대로 390</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div
                  className="flex h-20 w-20 flex-col items-center justify-center rounded-full border-[2.5px] text-center"
                  style={{ borderColor: "#C55A11", color: "#C55A11" }}
                >
                  <span className="text-[11px] font-bold leading-tight">한국경찰</span>
                  <span className="text-[11px] font-bold leading-tight">학원</span>
                  <span className="mt-0.5 text-[10px]">(인)</span>
                </div>
                <span className="text-xs text-[#4B5563]">원장</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Helper text — screen only */}
      <p className="no-print mt-2 pb-8 text-center text-xs text-[#4B5563]/60">
        인쇄 대화상자에서 용지 크기를 A4로 선택하고 여백을 15mm로 설정하세요.
      </p>
    </div>
  );
}
