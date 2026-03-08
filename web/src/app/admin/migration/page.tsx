import { AdminRole, type Prisma } from "@/generated/prisma";
import { MigrationWorkbench } from "@/components/migration/migration-workbench";
import { requireAdminContext } from "@/lib/auth";
import { listPeriods } from "@/lib/periods/service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminMigrationPage() {
  await requireAdminContext(AdminRole.SUPER_ADMIN);

  const [recentRuns, rollbackRuns, periods] = await Promise.all([
    getPrisma().auditLog.findMany({
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
    }),
    getPrisma().auditLog.findMany({
      where: {
        action: "MIGRATION_STUDENTS_ROLLBACK",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
    }),
    listPeriods(),
  ]);

  const rollbackMap = new Map(
    rollbackRuns.map((run) => [String(run.targetId), run] as const),
  );

  const serializedRuns = recentRuns.map((run) => {
    const after = (run.after ?? {}) as Prisma.JsonObject;
    const rollbackRun = rollbackMap.get(String(run.targetId));
    const rollbackAfter = (rollbackRun?.after ?? {}) as Prisma.JsonObject;

    return {
      id: run.id,
      targetId: String(run.targetId),
      createdAt: run.createdAt.toISOString(),
      adminName: run.admin.name,
      fileName: String(after.fileName ?? "-"),
      importedCount: Number(after.importedCount ?? 0),
      createdCount: Array.isArray(after.createdExamNumbers)
        ? after.createdExamNumbers.length
        : 0,
      updatedCount:
        Math.max(
          Number((after.summary as Prisma.JsonObject | undefined)?.updateRows ?? 0),
          0,
        ) || 0,
      skippedCount: Number(after.skippedCount ?? 0),
      rolledBackAt: rollbackRun?.createdAt.toISOString() ?? null,
      rollbackDeletedCount: Number(rollbackAfter.deletedCount ?? 0),
      rollbackRestoredCount: Number(rollbackAfter.restoredCount ?? 0),
      rollbackSkippedDeletes: Array.isArray(rollbackAfter.skippedDeletes)
        ? rollbackAfter.skippedDeletes.map((value) => String(value))
        : [],
    };
  });

  const serializedPeriods = periods.map((period) => ({
    id: period.id,
    name: period.name,
    isActive: period.isActive,
    sessions: period.sessions.map((session) => ({
      id: session.id,
      examType: session.examType,
      week: session.week,
      subject: session.subject,
      examDate: session.examDate.toISOString(),
      isCancelled: session.isCancelled,
    })),
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        F-18 Migration
      </div>
      <h1 className="mt-5 text-3xl font-semibold">기존 운영 엑셀 마이그레이션</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수강생 명단은 기존 업로더를 그대로 쓰고, 월간 통합본 파일은 주차 시트를 직접 읽어
        기간별 시험 회차에 점수를 반영할 수 있도록 구성했습니다.
      </p>
      <div className="mt-8">
        <MigrationWorkbench recentRuns={serializedRuns} periods={serializedPeriods} />
      </div>
    </div>
  );
}
