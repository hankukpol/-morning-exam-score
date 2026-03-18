import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { AcademySettingsForm } from "./academy-settings-form";

export const dynamic = "force-dynamic";

export type AcademySettingsRow = {
  name: string;
  directorName: string;
  businessRegNo: string;
  academyRegNo: string;
  address: string;
  phone: string;
  faxNumber: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  websiteUrl: string;
  // 문서 발급 설정
  documentIssuer: string;
  sealImagePath: string;
  logoImagePath: string;
};

export default async function AcademySettingsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings: any = await getPrisma().academySettings.findUnique({ where: { id: 1 } });

  const row: AcademySettingsRow = {
    name: settings?.name ?? "",
    directorName: settings?.directorName ?? "",
    businessRegNo: settings?.businessRegNo ?? "",
    academyRegNo: settings?.academyRegNo ?? "",
    address: settings?.address ?? "",
    phone: settings?.phone ?? "",
    faxNumber: settings?.faxNumber ?? "",
    bankName: settings?.bankName ?? "",
    bankAccount: settings?.bankAccount ?? "",
    bankHolder: settings?.bankHolder ?? "",
    websiteUrl: settings?.websiteUrl ?? "",
    documentIssuer: settings?.documentIssuer ?? "",
    sealImagePath: settings?.sealImagePath ?? "",
    logoImagePath: settings?.logoImagePath ?? "",
  };

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        시스템 설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">학원 기본 정보</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        학원 이름, 원장 정보, 사업자 등록번호 등 기본 정보를 설정합니다.
        저장된 정보는 영수증, 수강확인서, 교육비 납입증명서 등 출력물에 자동으로 사용됩니다.
      </p>
      <div className="mt-8 max-w-2xl">
        <AcademySettingsForm initialSettings={row} />
      </div>
    </div>
  );
}
