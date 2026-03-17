import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getSystemConfig } from "@/lib/system-config";
import { SystemSettingsClient } from "./system-settings-client";

export const dynamic = "force-dynamic";

export default async function SystemSettingsPage() {
  await requireAdminContext(AdminRole.SUPER_ADMIN);

  const [config, academyRow] = await Promise.all([
    getSystemConfig(),
    getPrisma().academySettings.findUnique({ where: { id: 1 } }),
  ]);

  const academy = {
    name: academyRow?.name ?? "",
    directorName: academyRow?.directorName ?? "",
    businessRegNo: academyRow?.businessRegNo ?? "",
    academyRegNo: academyRow?.academyRegNo ?? "",
    address: academyRow?.address ?? "",
    phone: academyRow?.phone ?? "",
    bankName: academyRow?.bankName ?? "",
    bankAccount: academyRow?.bankAccount ?? "",
    bankHolder: academyRow?.bankHolder ?? "",
    websiteUrl: academyRow?.websiteUrl ?? "",
  };

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        시스템 설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">통합 시스템 설정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        학원 기본 정보, 운영 시간, 알림 채널, 수납 환불 정책을 한 곳에서 관리합니다.
      </p>

      <div className="mt-8 max-w-2xl">
        <SystemSettingsClient config={config} academy={academy} />
      </div>
    </div>
  );
}
