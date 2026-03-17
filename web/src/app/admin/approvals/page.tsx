import { AdminRole, RefundType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { ApprovalActions, type PendingRefundRow } from "./approval-actions";

export const dynamic = "force-dynamic";

const REFUND_TYPE_LABEL: Record<RefundType, string> = {
  CARD_CANCEL: "카드취소",
  CASH: "현금환불",
  TRANSFER: "계좌이체",
  PARTIAL: "부분환불",
};

export default async function ApprovalsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const refunds = await getPrisma().refund.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      payment: {
        select: {
          examNumber: true,
          student: { select: { name: true } },
          grossAmount: true,
          netAmount: true,
          note: true,
        },
      },
    },
  });

  // Fetch requestedBy admin names
  const adminIds = [...new Set(refunds.map((r) => r.processedBy))];
  const admins =
    adminIds.length > 0
      ? await getPrisma().adminUser.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, name: true },
        })
      : [];
  const adminMap = Object.fromEntries(admins.map((a) => [a.id, a.name]));

  const rows: PendingRefundRow[] = refunds.map((r) => ({
    id: r.id,
    paymentId: r.paymentId,
    refundType: r.refundType,
    amount: r.amount,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    requestedByName: adminMap[r.processedBy] ?? null,
    payment: {
      examNumber: r.payment.examNumber,
      student: r.payment.student ?? null,
      grossAmount: r.payment.grossAmount,
      netAmount: r.payment.netAmount,
      note: r.payment.note,
    },
  }));

  const count = rows.length;

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
        결재 관리
      </div>

      {/* Header */}
      <div className="mt-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">결재 대기함</h1>
          <p className="mt-1 text-sm text-slate">
            승인이 필요한 환불 요청을 검토합니다.
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
            count > 0
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-forest/30 bg-forest/10 text-forest"
          }`}
        >
          대기 중 {count}건
        </span>
      </div>

      {/* Table */}
      <div className="mt-8">
        {rows.length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-12 text-center">
            <p className="text-sm text-slate">대기 중인 환불 요청이 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead>
                  <tr>
                    {[
                      "학번",
                      "이름",
                      "환불 금액",
                      "환불 유형",
                      "요청 사유",
                      "요청일",
                      "요청자",
                      "처리",
                    ].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {rows.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-mist/30">
                      {/* 학번 */}
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                        {row.payment.examNumber ? (
                          <a
                            href={`/admin/students/${row.payment.examNumber}`}
                            className="font-medium text-ink transition-colors hover:text-ember"
                          >
                            {row.payment.examNumber}
                          </a>
                        ) : (
                          <span className="text-slate/60">—</span>
                        )}
                      </td>
                      {/* 이름 */}
                      <td className="whitespace-nowrap px-4 py-3">
                        {row.payment.student ? (
                          <a
                            href={`/admin/students/${row.payment.examNumber}`}
                            className="font-medium text-ink transition-colors hover:text-ember"
                          >
                            {row.payment.student.name}
                          </a>
                        ) : (
                          <span className="text-xs text-slate">비회원</span>
                        )}
                      </td>
                      {/* 환불 금액 */}
                      <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-red-600">
                        -{row.amount.toLocaleString()}원
                      </td>
                      {/* 환불 유형 */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                          {REFUND_TYPE_LABEL[row.refundType]}
                        </span>
                      </td>
                      {/* 요청 사유 */}
                      <td className="max-w-[200px] truncate px-4 py-3 text-slate">
                        {row.reason}
                      </td>
                      {/* 요청일 */}
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                        {formatDateTime(row.createdAt)}
                      </td>
                      {/* 요청자 */}
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                        {row.requestedByName ?? "—"}
                      </td>
                      {/* 처리 */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <ApprovalActions refund={row} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Back link */}
      <div className="mt-6">
        <a
          href="/admin/payments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 수납 이력으로
        </a>
      </div>
    </div>
  );
}
