import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PaymentForm } from "@/components/payments/payment-form";

export const dynamic = "force-dynamic";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const rawTextbooks = await getPrisma().textbook.findMany({
    where: { isActive: true },
    orderBy: { title: "asc" },
  });
  const textbooks = rawTextbooks.map((t) => ({ ...t, id: String(t.id) }));

  const initialExamNumber = Array.isArray(searchParams?.examNumber)
    ? searchParams?.examNumber[0]
    : (searchParams?.examNumber ?? "");

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">수납 등록</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        현금 또는 계좌이체로 수납을 등록합니다. 학생을 검색하여 수강료를 연결하거나 교재 판매,
        시설비 등을 직접 입력할 수 있습니다.
      </p>
      <div className="mt-8 max-w-3xl">
        <PaymentForm initialTextbooks={textbooks} initialExamNumber={initialExamNumber} />
      </div>
    </div>
  );
}
