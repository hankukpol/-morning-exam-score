import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { DiscountCodeManager } from "./discount-code-manager";

export const dynamic = "force-dynamic";

export type DiscountCodeRow = {
  id: number;
  code: string;
  type: "REFERRAL" | "ENROLLMENT" | "CAMPAIGN";
  discountType: "RATE" | "FIXED";
  discountValue: number;
  maxUsage: number | null;
  usageCount: number;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  staffName: string;
  createdAt: string;
};

export default async function PaymentPoliciesPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const codes = await getPrisma().discountCode.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: { staff: { select: { name: true } } },
  });

  const rows: DiscountCodeRow[] = codes.map((c) => ({
    id: c.id,
    code: c.code,
    type: c.type as "REFERRAL" | "ENROLLMENT" | "CAMPAIGN",
    discountType: c.discountType as "RATE" | "FIXED",
    discountValue: c.discountValue,
    maxUsage: c.maxUsage,
    usageCount: c.usageCount,
    validFrom: c.validFrom.toISOString().split("T")[0],
    validUntil: c.validUntil ? c.validUntil.toISOString().split("T")[0] : null,
    isActive: c.isActive,
    staffName: c.staff.name,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">할인 코드 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        추천인 코드, 입소 코드, 캠페인 코드를 발급하고 관리합니다. 코드는 수납 등록 시 적용할 수
        있습니다.
      </p>
      <div className="mt-8">
        <DiscountCodeManager initialCodes={rows} />
      </div>
    </div>
  );
}
