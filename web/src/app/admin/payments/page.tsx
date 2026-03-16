import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  PaymentList,
  type PaymentWithRelations,
} from "@/components/payments/payment-list";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  const payments = await getPrisma().payment.findMany({
    where: {
      processedAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    include: {
      student: { select: { name: true, phone: true } },
      processor: { select: { name: true } },
      items: true,
      refunds: { select: { amount: true, refundType: true, processedAt: true } },
    },
    orderBy: { processedAt: "desc" },
    take: 200,
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">수납 내역</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        현금 및 계좌이체 수납을 등록하고 내역을 조회합니다. 오늘 날짜가 기본으로 표시되며 날짜 범위를
        변경하여 조회할 수 있습니다.
      </p>
      <div className="mt-8">
        <PaymentList initialPayments={payments as unknown as PaymentWithRelations[]} />
      </div>
    </div>
  );
}
