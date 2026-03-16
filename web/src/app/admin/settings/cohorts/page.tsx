import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { CohortManager } from "@/components/cohorts/cohort-manager";

export const dynamic = "force-dynamic";

export default async function CohortsSettingsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const rawCohorts = await getPrisma().cohort.findMany({
    orderBy: [{ startDate: "desc" }],
    include: {
      enrollments: {
        select: { status: true },
      },
    },
  });

  const cohorts = rawCohorts.map(({ enrollments, ...cohort }) => {
    const activeCount = enrollments.filter(
      (e) => e.status === "PENDING" || e.status === "ACTIVE",
    ).length;
    const waitlistCount = enrollments.filter((e) => e.status === "WAITING").length;
    return { ...cohort, activeCount, waitlistCount };
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정 · 기수 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">기수 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수험유형별 기수(期數)를 등록하고 관리합니다. 기수명, 시작일·종료일, 목표시험연도를
        설정할 수 있습니다.
      </p>
      <div className="mt-8">
        <CohortManager initialCohorts={cohorts as any} />
      </div>
    </div>
  );
}
