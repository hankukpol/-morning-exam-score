import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PaymentDetail, type PaymentDetailData } from "./payment-detail";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

export default async function PaymentDetailPage({
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
      cashReceiptNo: true,
      cashReceiptType: true,
      cashReceiptIssuedAt: true,
      processedAt: true,
      student: { select: { name: true, phone: true } },
      processor: { select: { name: true } },
      items: { orderBy: { id: "asc" } },
      refunds: {
        orderBy: { processedAt: "desc" },
        select: {
          id: true,
          refundType: true,
          status: true,
          amount: true,
          reason: true,
          rejectionReason: true,
          bankName: true,
          accountNo: true,
          accountHolder: true,
          processedAt: true,
        },
      },
      installments: {
        orderBy: { seq: "asc" },
      },
    },
  });

  if (!payment) notFound();

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "수강 관리", href: "/admin/payments" },
          { label: "수납 이력", href: "/admin/payments" },
          { label: `#${id.slice(-6)}` },
        ]}
      />

      {/* Badge + header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 상세
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            {payment.student ? payment.student.name : "비회원"}
            <span className="ml-3 text-xl font-normal text-slate">
              {payment.netAmount.toLocaleString()}원
            </span>
          </h1>
          {payment.examNumber ? (
            <p className="mt-1 text-sm text-slate">학번: {payment.examNumber}</p>
          ) : null}
        </div>
        <Link
          href="/admin/payments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 목록으로
        </Link>
      </div>

      <div className="mt-8">
        <PaymentDetail payment={payment as unknown as PaymentDetailData} />
      </div>
    </div>
  );
}
