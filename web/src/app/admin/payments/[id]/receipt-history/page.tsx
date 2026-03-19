import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PaymentStatus } from "@prisma/client";
import {
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_COLOR,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const REFUND_STATUS_LABEL: Record<string, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인됨",
  REJECTED: "거절됨",
  COMPLETED: "완료",
  CANCELLED: "취소",
};

const REFUND_TYPE_LABEL: Record<string, string> = {
  CARD_CANCEL: "카드취소",
  CASH: "현금환불",
  TRANSFER: "계좌이체",
  PARTIAL: "부분환불",
};

type TimelineEvent = {
  id: string;
  type: "payment_created" | "refund" | "status_change" | "audit";
  timestamp: Date;
  title: string;
  description: string;
  amount?: number;
  amountIsNegative?: boolean;
  badge?: string;
  badgeColor?: string;
  actor?: string;
};

export default async function PaymentReceiptHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;

  const payment = await getPrisma().payment.findUnique({
    where: { id },
    select: {
      id: true,
      examNumber: true,
      enrollmentId: true,
      category: true,
      method: true,
      status: true,
      grossAmount: true,
      discountAmount: true,
      couponAmount: true,
      pointAmount: true,
      netAmount: true,
      note: true,
      processedAt: true,
      createdAt: true,
      updatedAt: true,
      student: { select: { name: true, examNumber: true } },
      processor: { select: { name: true } },
      items: {
        orderBy: { id: "asc" },
        select: { id: true, itemName: true, amount: true, itemType: true },
      },
      refunds: {
        orderBy: { processedAt: "asc" },
        select: {
          id: true,
          refundType: true,
          status: true,
          amount: true,
          reason: true,
          rejectionReason: true,
          processedAt: true,
          processedBy: true,
        },
      },
    },
  });

  if (!payment) notFound();

  // Fetch related AuditLog entries
  const auditLogs = await getPrisma().auditLog.findMany({
    where: { targetType: "payment", targetId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      action: true,
      before: true,
      after: true,
      createdAt: true,
      admin: { select: { name: true } },
    },
  });

  // Build timeline
  const events: TimelineEvent[] = [];

  // Initial payment created
  events.push({
    id: `payment-created-${payment.id}`,
    type: "payment_created",
    timestamp: payment.processedAt,
    title: "수납 등록",
    description: `${PAYMENT_CATEGORY_LABEL[payment.category]} · ${PAYMENT_METHOD_LABEL[payment.method]}`,
    amount: payment.netAmount,
    amountIsNegative: false,
    badge: "등록",
    badgeColor: "border-forest/30 bg-forest/10 text-forest",
    actor: payment.processor.name,
  });

  // Refund events
  for (const refund of payment.refunds) {
    const statusLabel = REFUND_STATUS_LABEL[refund.status] ?? refund.status;
    const typeLabel = REFUND_TYPE_LABEL[refund.refundType] ?? refund.refundType;
    const isRejected = refund.status === "REJECTED";
    events.push({
      id: `refund-${refund.id}`,
      type: "refund",
      timestamp: refund.processedAt,
      title: `환불 ${isRejected ? "거절" : "신청"}: ${typeLabel}`,
      description: refund.reason + (refund.rejectionReason ? ` (거절 사유: ${refund.rejectionReason})` : ""),
      amount: refund.amount,
      amountIsNegative: true,
      badge: statusLabel,
      badgeColor: isRejected
        ? "border-red-200 bg-red-50 text-red-700"
        : refund.status === "COMPLETED"
          ? "border-forest/30 bg-forest/10 text-forest"
          : "border-amber-200 bg-amber-50 text-amber-800",
    });
  }

  // Audit log entries
  for (const log of auditLogs) {
    const actionLabel: Record<string, string> = {
      CREATE_PAYMENT: "수납 등록",
      UPDATE_PAYMENT: "수납 수정",
      CREATE_REFUND: "환불 처리",
      APPROVE_REFUND: "환불 승인",
      REJECT_REFUND: "환불 거절",
    };
    const label = actionLabel[log.action] ?? log.action;

    // Skip CREATE_PAYMENT as we already have that event
    if (log.action === "CREATE_PAYMENT") continue;

    // Build description from before/after
    let desc = "";
    const before = log.before as Record<string, unknown> | null;
    const after = log.after as Record<string, unknown> | null;
    if (before && after) {
      const changes: string[] = [];
      for (const key of Object.keys(after)) {
        if (before[key] !== after[key]) {
          const statusBefore = key === "status" && typeof before[key] === "string"
            ? (PAYMENT_STATUS_LABEL[before[key] as PaymentStatus] ?? String(before[key]))
            : String(before[key] ?? "");
          const statusAfter = key === "status" && typeof after[key] === "string"
            ? (PAYMENT_STATUS_LABEL[after[key] as PaymentStatus] ?? String(after[key]))
            : String(after[key] ?? "");
          changes.push(`${key}: ${statusBefore} → ${statusAfter}`);
        }
      }
      desc = changes.join(", ");
    } else if (after) {
      const relevant = ["refundId", "refundType", "amount", "status", "reason"];
      const parts = relevant
        .filter((k) => after[k] !== undefined)
        .map((k) => `${k}: ${after[k]}`);
      desc = parts.join(", ");
    }

    events.push({
      id: `audit-${log.id}`,
      type: "audit",
      timestamp: log.createdAt,
      title: label,
      description: desc || log.action,
      badge: "감사",
      badgeColor: "border-sky-200 bg-sky-50 text-sky-700",
      actor: log.admin?.name,
    });
  }

  // Sort by timestamp ascending
  events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const totalRefunded = payment.refunds
    .filter((r) => r.status === "COMPLETED" || r.status === "APPROVED")
    .reduce((s, r) => s + r.amount, 0);
  const netAfterRefund = payment.netAmount - totalRefunded;
  const studentName = payment.student?.name ?? "비회원";
  const examNumber = payment.student?.examNumber ?? payment.examNumber;

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "수납 이력", href: "/admin/payments" },
          { label: `#${id.slice(-6)}`, href: `/admin/payments/${id}` },
          { label: "영수증 이력" },
        ]}
      />

      {/* Badge + Header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        영수증 이력
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            {studentName}
            {examNumber && (
              <span className="ml-2 text-lg font-normal text-slate">({examNumber})</span>
            )}
          </h1>
          <p className="mt-1 text-sm text-slate">
            수납 #&thinsp;{id.slice(-8).toUpperCase()} &middot;{" "}
            {PAYMENT_CATEGORY_LABEL[payment.category]} &middot;{" "}
            {PAYMENT_METHOD_LABEL[payment.method]}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/payments/${id}/receipt`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-forest/20 px-5 py-2.5 text-sm font-semibold text-forest transition hover:border-forest/50"
          >
            영수증 출력
          </Link>
          <Link
            href={`/admin/payments/${id}`}
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            ← 수납 상세
          </Link>
        </div>
      </div>

      {/* Summary KPI */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">수납 금액</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
            {payment.netAmount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">원</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">환불 합계</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-red-600">
            {totalRefunded > 0 ? `-${totalRefunded.toLocaleString()}` : "0"}
          </p>
          <p className="mt-1 text-xs text-slate">원</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">실 수납액</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-forest">
            {netAfterRefund.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">원</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">현재 상태</p>
          <div className="mt-2">
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${PAYMENT_STATUS_COLOR[payment.status]}`}
            >
              {PAYMENT_STATUS_LABEL[payment.status]}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* Timeline */}
        <div>
          <h2 className="mb-6 text-base font-semibold text-ink">변경 이력 타임라인</h2>

          {events.length === 0 ? (
            <div className="rounded-[24px] border border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
              이력이 없습니다.
            </div>
          ) : (
            <ol className="relative space-y-0 border-l-2 border-ink/10 pl-6">
              {events.map((event, idx) => (
                <li key={event.id} className="relative pb-8 last:pb-0">
                  {/* Dot */}
                  <span
                    className={`absolute -left-[25px] flex h-4 w-4 items-center justify-center rounded-full border-2 border-white ${
                      event.type === "payment_created"
                        ? "bg-forest"
                        : event.type === "refund"
                          ? "bg-red-500"
                          : "bg-sky-500"
                    }`}
                  />

                  <div className="rounded-[20px] border border-ink/10 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">{event.title}</span>
                        {event.badge && (
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${event.badgeColor}`}
                          >
                            {event.badge}
                          </span>
                        )}
                      </div>
                      <time className="whitespace-nowrap text-xs text-slate">
                        {formatDateTime(event.timestamp)}
                      </time>
                    </div>

                    {event.description && (
                      <p className="mt-1.5 text-sm text-slate">{event.description}</p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      {event.amount !== undefined && (
                        <span
                          className={`text-sm font-bold tabular-nums ${
                            event.amountIsNegative ? "text-red-600" : "text-forest"
                          }`}
                        >
                          {event.amountIsNegative ? "-" : "+"}{event.amount.toLocaleString()}원
                        </span>
                      )}
                      {event.actor && (
                        <span className="text-xs text-slate">처리자: {event.actor}</span>
                      )}
                    </div>
                  </div>

                  {/* Connector line hint between events */}
                  {idx < events.length - 1 && (
                    <div className="absolute -left-[17px] top-8 h-full w-0.5 bg-transparent" />
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Print-ready receipt summary */}
        <aside>
          <h2 className="mb-4 text-base font-semibold text-ink">영수증 요약</h2>
          <div
            className="rounded-[24px] border border-ink/10 bg-white p-6"
            style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" }}
          >
            {/* Header */}
            <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "#1F4D3A" }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/60">
                Korea Police Academy
              </p>
              <p className="mt-1 text-lg font-bold text-white">수납 영수증</p>
              <p className="text-[10px] text-white/50">#{id.slice(-8).toUpperCase()}</p>
            </div>

            {/* Academy info */}
            <div
              className="rounded-b-none px-4 py-1.5 text-[10px] font-semibold text-white"
              style={{ backgroundColor: "#C55A11" }}
            >
              한국경찰학원 · 053-241-0112
            </div>

            {/* Body */}
            <div className="mt-4 space-y-0 divide-y divide-ink/5 text-sm">
              <div className="flex justify-between py-2">
                <span className="text-slate">학생</span>
                <span className="font-medium text-ink">{studentName}</span>
              </div>
              {examNumber && (
                <div className="flex justify-between py-2">
                  <span className="text-slate">학번</span>
                  <span className="tabular-nums text-ink">{examNumber}</span>
                </div>
              )}
              <div className="flex justify-between py-2">
                <span className="text-slate">수납일시</span>
                <span className="text-xs tabular-nums text-ink">
                  {formatDateTime(payment.processedAt)}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate">수납 유형</span>
                <span className="text-ink">{PAYMENT_CATEGORY_LABEL[payment.category]}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate">결제 수단</span>
                <span className="text-ink">{PAYMENT_METHOD_LABEL[payment.method]}</span>
              </div>
            </div>

            {/* Items */}
            {payment.items.length > 0 && (
              <div className="mt-3 rounded-xl bg-mist/50 p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate">
                  수납 항목
                </p>
                {payment.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-xs">
                    <span className="text-slate">{item.itemName}</span>
                    <span className="tabular-nums font-medium text-ink">
                      {item.amount.toLocaleString()}원
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Totals */}
            <div className="mt-3 space-y-1 border-t border-ink/10 pt-3 text-sm">
              {payment.discountAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate">할인</span>
                  <span className="tabular-nums text-red-600">
                    -{payment.discountAmount.toLocaleString()}원
                  </span>
                </div>
              )}
              <div className="flex justify-between font-bold">
                <span className="text-ink">실수납액</span>
                <span className="tabular-nums text-forest">
                  {payment.netAmount.toLocaleString()}원
                </span>
              </div>
              {totalRefunded > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-red-600">환불 합계</span>
                  <span className="tabular-nums font-semibold text-red-600">
                    -{totalRefunded.toLocaleString()}원
                  </span>
                </div>
              )}
            </div>

            {/* Processor */}
            <div className="mt-4 border-t border-ink/10 pt-3 text-center text-xs text-slate">
              <p>처리자: {payment.processor.name}</p>
              <p className="mt-0.5">위 금액을 정히 영수함</p>
            </div>
          </div>

          {/* Print button */}
          <Link
            href={`/admin/payments/${id}/receipt`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-forest/20 bg-forest/5 py-2.5 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            영수증 인쇄 →
          </Link>
        </aside>
      </div>
    </div>
  );
}
