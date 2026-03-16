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

function formatReceiptDate(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export default async function PaymentReceiptPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const payment = await getPrisma().payment.findUnique({
    where: { id: params.id },
    include: {
      student: { select: { examNumber: true, name: true } },
      processor: { select: { name: true } },
      items: {
        select: {
          id: true,
          itemName: true,
          unitPrice: true,
          quantity: true,
          amount: true,
        },
      },
    },
  });

  if (!payment) notFound();

  // Fetch enrollment info separately (no Prisma relation defined on Payment)
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

  const receiptNo = params.id.slice(-8).toUpperCase();
  const paidAt = new Date(payment.processedAt);
  const studentName = payment.student?.name ?? "비회원";
  const studentExamNo = payment.student?.examNumber ?? payment.examNumber ?? null;
  const processorName = payment.processor?.name ?? "-";
  const methodLabel = PAYMENT_METHOD_LABEL[payment.method] ?? payment.method;

  return (
    <div className="min-h-screen bg-[#F7F4EF]">
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          @page {
            size: A5 portrait;
            margin: 10mm;
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
          href={`/admin/payments/${params.id}`}
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
          className="receipt-paper w-full max-w-[420px] overflow-hidden rounded-[16px] border border-[#111827]/15 bg-white shadow-xl"
          style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
        >
          {/* ── Header ── */}
          <div
            className="px-8 pb-5 pt-7"
            style={{ backgroundColor: "#1F4D3A" }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              Korea Police Academy
            </p>
            <p className="mt-1 text-2xl font-bold tracking-wide text-white">
              수납 영수증
            </p>
            <p
              className="mt-0.5 text-xs"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              PAYMENT RECEIPT
            </p>
          </div>

          {/* ── Academy info band ── */}
          <div
            className="flex items-center justify-between px-8 py-2.5 text-[11px]"
            style={{ backgroundColor: "#C55A11", color: "white" }}
          >
            <span>한국경찰학원</span>
            <span>대구 중구 중앙대로 390 센트럴엠빌딩 ｜ 053-241-0112</span>
          </div>

          {/* ── Receipt meta ── */}
          <div className="px-8 pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-[#4B5563]">영수증 번호</p>
                <p className="mt-0.5 text-base font-bold text-[#111827] tracking-wider">
                  #{receiptNo}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-[#4B5563]">수납일</p>
                <p className="mt-0.5 text-sm font-semibold text-[#111827]">
                  {formatReceiptDate(paidAt)}
                </p>
              </div>
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="mx-8 my-4 border-t border-dashed border-[#111827]/15" />

          {/* ── Student & Course ── */}
          <div className="space-y-0 divide-y divide-[#111827]/6 px-8 text-sm">
            <div className="flex justify-between py-2.5">
              <span className="text-[#4B5563]">학생</span>
              <span className="font-medium text-[#111827]">
                {studentName}
                {studentExamNo ? (
                  <span className="ml-1.5 text-xs text-[#4B5563]">
                    ({studentExamNo})
                  </span>
                ) : null}
              </span>
            </div>
            {enrollmentLabel ? (
              <div className="flex justify-between py-2.5">
                <span className="text-[#4B5563]">수강 강좌</span>
                <span className="max-w-[220px] text-right font-medium text-[#111827] leading-snug">
                  {enrollmentLabel}
                </span>
              </div>
            ) : null}
          </div>

          {/* ── Divider ── */}
          <div className="mx-8 my-4 border-t border-dashed border-[#111827]/15" />

          {/* ── Payment items table ── */}
          <div className="px-8">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#4B5563]">
              수납 항목
            </p>
            {payment.items.length === 0 ? (
              <p className="text-xs text-[#4B5563]">항목 없음</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="border-y border-[#111827]/10 text-[11px] text-[#4B5563]"
                  >
                    <th className="py-1.5 text-left font-medium">항목</th>
                    <th className="py-1.5 text-right font-medium">금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#111827]/6">
                  {payment.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2 text-[#111827]">
                        {item.itemName}
                        {item.quantity > 1 ? (
                          <span className="ml-1 text-xs text-[#4B5563]">
                            × {item.quantity}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 text-right font-medium tabular-nums text-[#111827]">
                        {item.amount.toLocaleString("ko-KR")}원
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Totals ── */}
          <div className="mx-8 mt-3 space-y-0 divide-y divide-[#111827]/6 border-t border-[#111827]/15 text-sm">
            {payment.discountAmount > 0 ? (
              <>
                <div className="flex justify-between py-2">
                  <span className="text-[#4B5563]">청구금액</span>
                  <span className="tabular-nums text-[#111827]">
                    {payment.grossAmount.toLocaleString("ko-KR")}원
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-[#4B5563]">할인금액</span>
                  <span className="tabular-nums text-red-600">
                    -{payment.discountAmount.toLocaleString("ko-KR")}원
                  </span>
                </div>
              </>
            ) : null}
            <div className="flex justify-between py-3">
              <span className="font-bold text-[#111827]">합계</span>
              <span className="text-lg font-bold tabular-nums text-[#1F4D3A]">
                {payment.netAmount.toLocaleString("ko-KR")}원
              </span>
            </div>
          </div>

          {/* ── Payment details ── */}
          <div className="mx-8 mt-3 space-y-0 divide-y divide-[#111827]/6 border-t border-[#111827]/10 text-sm">
            <div className="flex justify-between py-2">
              <span className="text-[#4B5563]">결제 수단</span>
              <span className="font-medium text-[#111827]">{methodLabel}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-[#4B5563]">처리 담당</span>
              <span className="font-medium text-[#111827]">{processorName}</span>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="mx-8 mt-5 mb-6">
            {/* Divider */}
            <div className="border-t-2 border-[#111827]/20" />

            {/* Statement */}
            <p className="mt-4 text-center text-base font-semibold text-[#111827]">
              위 금액을 정히 영수함
            </p>

            {/* Stamp area */}
            <div className="mt-4 flex justify-end">
              <div
                className="flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 text-center"
                style={{ borderColor: "#C55A11", color: "#C55A11" }}
              >
                <span className="text-[10px] font-semibold leading-tight">
                  한국경찰
                </span>
                <span className="text-[10px] font-semibold leading-tight">
                  학원
                </span>
                <span className="mt-0.5 text-[9px]">(인)</span>
              </div>
            </div>

            {/* Academy name */}
            <p className="mt-3 text-center text-xs text-[#4B5563]">
              한국경찰학원장 (인)
            </p>
          </div>
        </div>
      </div>

      {/* Helper text — screen only */}
      <p className="no-print mt-2 text-center text-xs text-[#4B5563]/60">
        인쇄 대화상자에서 용지 크기를 A5로 선택하세요.
      </p>
    </div>
  );
}
