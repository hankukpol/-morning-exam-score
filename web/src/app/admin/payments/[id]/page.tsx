import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PaymentDetail, type PaymentDetailData } from "./payment-detail";

export const dynamic = "force-dynamic";

export default async function PaymentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const payment = await getPrisma().payment.findUnique({
    where: { id: params.id },
    include: {
      student: { select: { name: true, phone: true } },
      processor: { select: { name: true } },
      items: true,
      refunds: {
        orderBy: { processedAt: "desc" },
      },
    },
  });

  if (!payment) notFound();

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">수납 상세</h1>
      <div className="mt-8">
        <PaymentDetail payment={payment as unknown as PaymentDetailData} />
      </div>
    </div>
  );
}
