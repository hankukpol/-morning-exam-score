import { AdminRole } from "@/generated/prisma";
import { ExportPanel } from "@/components/export/export-panel";
import { requireAdminContext } from "@/lib/auth";
import { listPeriods } from "@/lib/periods/service";

export const dynamic = "force-dynamic";

export default async function AdminExportPage() {
  await requireAdminContext(AdminRole.VIEWER);
  const periods = await listPeriods();

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-17 Export
      </div>
      <h1 className="mt-5 text-3xl font-semibold">데이터 내보내기</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수강생 명단과 성적 원본 데이터를 CSV 또는 xlsx로 바로 내려받을 수 있습니다. CSV는 UTF-8 BOM으로 내려갑니다.
      </p>

      <div className="mt-8">
        <ExportPanel
          periods={periods.map((period) => ({
            id: period.id,
            name: period.name,
            isActive: period.isActive,
          }))}
        />
      </div>
    </div>
  );
}
