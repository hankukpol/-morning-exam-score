import { AdminRole, type Prisma } from "@/generated/prisma";
import { MigrationWorkbench } from "@/components/migration/migration-workbench";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminMigrationPage() {
  await requireAdminContext(AdminRole.SUPER_ADMIN);

  const recentRuns = await getPrisma().auditLog.findMany({
    where: {
      action: "MIGRATION_STUDENTS_EXECUTE",
    },
    include: {
      admin: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 5,
  });

  const serializedRuns = recentRuns.map((run) => {
    const after = (run.after ?? {}) as Prisma.JsonObject;

    return {
      id: run.id,
      createdAt: run.createdAt.toISOString(),
      adminName: run.admin.name,
      fileName: String(after.fileName ?? "-"),
      importedCount: Number(after.importedCount ?? 0),
      createdCount: Array.isArray(after.createdExamNumbers)
        ? after.createdExamNumbers.length
        : 0,
      updatedCount:
        Math.max(
          Number(
            (after.summary as Prisma.JsonObject | undefined)?.updateRows ?? 0,
          ),
          0,
        ) || 0,
      skippedCount: Number(after.skippedCount ?? 0),
    };
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        F-18 Migration
      </div>
      <h1 className="mt-5 text-3xl font-semibold">기존 엑셀 데이터 마이그레이션</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수강생 명단은 즉시 DB 반영이 가능하도록 구현했고, 점수 파일은 현재 참고자료를 기준으로
        포맷 식별까지 연결해 두었습니다. Phase 2 점수 업로드 기능과 같은 파서를 공유하도록
        설계했습니다.
      </p>
      <div className="mt-8">
        <MigrationWorkbench recentRuns={serializedRuns} />
      </div>
    </div>
  );
}
