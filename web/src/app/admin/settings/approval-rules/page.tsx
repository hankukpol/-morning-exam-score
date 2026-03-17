import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ApprovalRulesForm } from "./approval-rules-form";

export const dynamic = "force-dynamic";

export type ApprovalRulesSettings = {
  refundApprovalThreshold: number;
  discountApprovalThreshold: number;
  cashApprovalThreshold: number;
};

const DEFAULTS: ApprovalRulesSettings = {
  refundApprovalThreshold: 200000,
  discountApprovalThreshold: 50000,
  cashApprovalThreshold: 100000,
};

export default async function ApprovalRulesPage() {
  await requireAdminContext(AdminRole.DIRECTOR);

  const settings = await getPrisma().academySettings.findUnique({ where: { id: 1 } });

  const current: ApprovalRulesSettings = {
    refundApprovalThreshold: settings?.refundApprovalThreshold ?? DEFAULTS.refundApprovalThreshold,
    discountApprovalThreshold: settings?.discountApprovalThreshold ?? DEFAULTS.discountApprovalThreshold,
    cashApprovalThreshold: settings?.cashApprovalThreshold ?? DEFAULTS.cashApprovalThreshold,
  };

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        시스템 설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">승인 라인 설정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        환불·할인·현금 지급 처리 시 상위 결재가 필요한 금액 기준을 설정합니다.
      </p>
      <div className="mt-8 max-w-2xl">
        <ApprovalRulesForm initialSettings={current} />
      </div>
    </div>
  );
}
