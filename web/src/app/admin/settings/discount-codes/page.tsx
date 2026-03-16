import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { DiscountCodeManager } from "./discount-code-manager";

export const dynamic = "force-dynamic";

export default async function DiscountCodesSettingsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const codes = await getPrisma().discountCode.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: { staff: { select: { name: true } } },
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        P1-12 할인코드
      </div>
      <h1 className="mt-5 text-3xl font-semibold">할인 코드 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수강료 할인 코드를 생성하고 관리합니다. 비율(%) 또는 정액(원) 할인을 설정하고 유효 기간과 사용 횟수를 제한할 수 있습니다.
      </p>
      <div className="mt-8">
        <DiscountCodeManager initialCodes={codes as any} />
      </div>
    </div>
  );
}
