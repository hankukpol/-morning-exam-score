import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_CATEGORY_COLOR,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_COLOR,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ examNumber: string }>;
};

const SUB_NAV = [
  { href: "enrollments", label: "수업" },
  { href: "payments", label: "수납" },
] as const;

function formatDatetime(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${y}.${mo}.${day} ${h}:${mi}`;
}

export default async function StudentPaymentsPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { examNumber } = await params;
  const prisma = getPrisma();

  const [student, payments] = await Promise.all([
    prisma.student.findUnique({
      where: { examNumber },
      select: { name: true, examNumber: true, phone: true, isActive: true },
    }),
    prisma.payment.findMany({
      where: { examNumber },
      include: {
        items: true,
        processor: { select: { name: true } },
        refunds: {
          select: {
            id: true,
            amount: true,
            refundType: true,
            status: true,
            processedAt: true,
            reason: true,
          },
        },
      },
      orderBy: { processedAt: "desc" },
    }),
  ]);

  if (!student) notFound();

  // KPI calculations
  const approvedPayments = payments.filter(
    (p) =>
      p.status === "APPROVED" ||
      p.status === "PARTIAL_REFUNDED" ||
      p.status === "FULLY_REFUNDED",
  );

  const totalNet = approvedPayments.reduce((sum, p) => sum + p.netAmount, 0);
  const totalDiscount = approvedPayments.reduce(
    (sum, p) => sum + p.discountAmount + p.couponAmount + p.pointAmount,
    0,
  );
  const totalRefunded = payments
    .flatMap((p) => p.refunds)
    .filter((r) => r.status === "COMPLETED")
    .reduce((sum, r) => sum + r.amount, 0);
  const netReceived = totalNet - totalRefunded;

  return (
    <div className="p-8 sm:p-10">
      {/* 브레드크럼 */}
      <nav className="mb-6 flex items-center gap-2 text-xs text-slate">
        <Link
          href="/admin/students"
          className="transition-colors hover:text-forest"
        >
          수강생 목록
        </Link>
        <span>/</span>
        <Link
          href={`/admin/students/${examNumber}`}
          className="transition-colors hover:text-forest"
        >
          {student.name}
        </Link>
        <span>/</span>
        <span className="text-ink">수납</span>
      </nav>

      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-[#C55A11]/20 bg-[#C55A11]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#C55A11]">
            수납 이력
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-ink">
            {student.name}
            <span className="ml-2 text-base font-normal text-slate">
              ({student.examNumber})
            </span>
          </h1>
          {student.phone && (
            <p className="mt-1 text-sm text-slate">{student.phone}</p>
          )}
        </div>

        <Link
          href={`/admin/payments/new?examNumber=${examNumber}`}
          className="inline-flex items-center rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
        >
          + 수납 등록
        </Link>
      </div>

      {/* 서브 내비 */}
      <div className="mt-6 flex gap-1 border-b border-ink/10">
        {SUB_NAV.map((item) => (
          <Link
            key={item.href}
            href={`/admin/students/${examNumber}/${item.href}`}
            className={`rounded-t-2xl px-5 py-2.5 text-sm font-semibold transition ${
              item.href === "payments"
                ? "-mb-px border border-b-white border-ink/10 bg-white text-ink"
                : "text-slate hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/* KPI 카드 */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">
            총 수납액
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {totalNet.toLocaleString()}원
          </p>
          {totalDiscount > 0 && (
            <p className="mt-1 text-xs text-forest">
              할인 -{totalDiscount.toLocaleString()}원
            </p>
          )}
        </div>
        <div className="rounded-[28px] border border-red-100 bg-red-50 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-500">
            총 환불액
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-red-600">
            {totalRefunded > 0 ? `-${totalRefunded.toLocaleString()}원` : "0원"}
          </p>
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-forest">
            순 수납액
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-forest">
            {netReceived.toLocaleString()}원
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">
            수납 건수
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {payments.length}건
          </p>
        </div>
      </div>

      {/* 목록 */}
      <div className="mt-6">
        {payments.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            수납 이력이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-ink/10 shadow-panel">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">처리일시</th>
                  <th className="px-4 py-3 font-semibold">유형</th>
                  <th className="px-4 py-3 font-semibold">수납 내역</th>
                  <th className="px-4 py-3 font-semibold">결제수단</th>
                  <th className="px-4 py-3 text-right font-semibold">수납액</th>
                  <th className="px-4 py-3 text-right font-semibold">환불액</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                  <th className="px-4 py-3 font-semibold">처리 직원</th>
                  <th className="px-4 py-3 font-semibold">상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {payments.map((p) => {
                  const refundTotal = p.refunds
                    .filter((r) => r.status === "COMPLETED")
                    .reduce((s, r) => s + r.amount, 0);

                  return (
                    <tr
                      key={p.id}
                      className={`transition hover:bg-mist/40 ${
                        p.status === "CANCELLED" ? "opacity-50" : ""
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                        {formatDatetime(p.processedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${PAYMENT_CATEGORY_COLOR[p.category]}`}
                        >
                          {PAYMENT_CATEGORY_LABEL[p.category]}
                        </span>
                      </td>
                      <td className="max-w-[200px] px-4 py-3">
                        <div className="space-y-0.5">
                          {p.items.map((item) => (
                            <div
                              key={item.id}
                              className="truncate text-xs text-slate"
                            >
                              {item.itemName}
                              {item.quantity > 1 ? ` ×${item.quantity}` : ""}
                            </div>
                          ))}
                          {p.items.length === 0 && p.note && (
                            <div className="truncate text-xs text-slate">
                              {p.note}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate">
                        {PAYMENT_METHOD_LABEL[p.method]}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div className="font-medium">
                          {p.netAmount.toLocaleString()}원
                        </div>
                        {p.discountAmount > 0 && (
                          <div className="mt-0.5 text-xs text-forest">
                            -{p.discountAmount.toLocaleString()}원
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {refundTotal > 0 ? (
                          <span className="font-medium text-red-600">
                            -{refundTotal.toLocaleString()}원
                          </span>
                        ) : (
                          <span className="text-slate">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${PAYMENT_STATUS_COLOR[p.status]}`}
                        >
                          {PAYMENT_STATUS_LABEL[p.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate">
                        {p.processor.name}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/payments/${p.id}`}
                          className="text-xs font-semibold text-ember transition hover:underline"
                        >
                          상세보기
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 학생 프로필 이동 */}
      <div className="mt-8">
        <Link
          href={`/admin/students/${examNumber}`}
          className="inline-flex items-center gap-1.5 text-sm text-forest transition hover:underline"
        >
          ← 학생 프로필로 이동
        </Link>
      </div>
    </div>
  );
}
