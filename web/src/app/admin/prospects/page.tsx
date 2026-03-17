import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ProspectManager } from "./prospect-manager";

export const dynamic = "force-dynamic";

export type ProspectRow = {
  id: string;
  name: string;
  phone: string | null;
  examType: string | null;
  source: string;
  stage: string;
  note: string | null;
  staffId: string;
  enrollmentId: string | null;
  visitedAt: string;
  createdAt: string;
  updatedAt: string;
  staff: { name: string } | null;
};

export default async function ProspectsPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prospects = await getPrisma().consultationProspect.findMany({
    orderBy: { visitedAt: "desc" },
    include: {
      staff: { select: { name: true } },
    },
  });

  const rows: ProspectRow[] = prospects.map((p) => ({
    id: p.id,
    name: p.name,
    phone: p.phone ?? null,
    examType: p.examType ?? null,
    source: p.source,
    stage: p.stage,
    note: p.note ?? null,
    staffId: p.staffId,
    enrollmentId: p.enrollmentId ?? null,
    visitedAt: p.visitedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    staff: p.staff,
  }));

  // Summary stats
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthRows = rows.filter((r) => new Date(r.createdAt) >= monthStart);
  const registered = rows.filter((r) => r.stage === "REGISTERED").length;
  const notConverted = rows.filter((r) => r.stage !== "REGISTERED" && r.stage !== "DROPPED").length;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        수강 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">상담 방문자</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        미등록 예비 원생의 상담 기록을 관리합니다. 등록 완료 후 수강 연결은 수강 등록 메뉴에서 처리하세요.
      </p>

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold text-slate">전체 방문자</p>
          <p className="mt-1 text-3xl font-bold">
            {rows.length}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/10 p-5">
          <p className="text-xs font-semibold text-forest">등록 완료</p>
          <p className="mt-1 text-3xl font-bold text-forest">
            {registered}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-ember/20 bg-ember/10 p-5">
          <p className="text-xs font-semibold text-ember">상담 진행 중</p>
          <p className="mt-1 text-3xl font-bold text-ember">
            {notConverted}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-mist p-5">
          <p className="text-xs font-semibold text-slate">이번 달 신규</p>
          <p className="mt-1 text-3xl font-bold">
            {thisMonthRows.length}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
        </div>
      </div>

      <div className="mt-8">
        <ProspectManager initialProspects={rows} />
      </div>
    </div>
  );
}
