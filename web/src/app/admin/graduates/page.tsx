import { AdminRole, PassType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { GraduateManager } from "./graduate-manager";

export const dynamic = "force-dynamic";

export type GraduateRow = {
  id: string;
  examNumber: string;
  examName: string;
  passType: PassType;
  writtenPassDate: string | null;
  finalPassDate: string | null;
  appointedDate: string | null;
  enrolledMonths: number | null;
  testimony: string | null;
  isPublic: boolean;
  note: string | null;
  createdAt: string;
  student: { name: string; generation: number | null };
  staff: { name: string };
  scoreSnapshot: { overallAverage: number | null; totalEnrolledMonths: number } | null;
};

export default async function GraduatesPage() {
  await requireAdminContext(AdminRole.VIEWER);

  const records = await getPrisma().graduateRecord.findMany({
    include: {
      student: { select: { name: true, generation: true } },
      staff: { select: { name: true } },
      scoreSnapshot: { select: { overallAverage: true, totalEnrolledMonths: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const rows: GraduateRow[] = records.map((r) => ({
    ...r,
    writtenPassDate: r.writtenPassDate?.toISOString() ?? null,
    finalPassDate: r.finalPassDate?.toISOString() ?? null,
    appointedDate: r.appointedDate?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  // 연도별 합격 현황 요약
  const currentYear = new Date().getFullYear();
  const thisYear = rows.filter((r) => {
    const date = r.finalPassDate ?? r.writtenPassDate;
    return date && date.startsWith(String(currentYear));
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
        합격자 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">합격자 현황</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        필기합격·최종합격 기록을 관리하고 합격자 성적 데이터를 보관합니다.
      </p>

      {/* 연도 요약 카드 */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(
          [
            { type: "WRITTEN_PASS", label: "필기합격", color: "bg-sky-50 text-sky-700 border-sky-200" },
            { type: "FINAL_PASS", label: "최종합격", color: "bg-forest/10 text-forest border-forest/20" },
            { type: "APPOINTED", label: "임용", color: "bg-amber-50 text-amber-700 border-amber-200" },
          ] as const
        ).map(({ type, label, color }) => (
          <div key={type} className={`rounded-[20px] border p-5 ${color}`}>
            <p className="text-xs font-semibold">{currentYear}년 {label}</p>
            <p className="mt-1 text-3xl font-bold">
              {rows.filter((r) => r.passType === type && (r.finalPassDate ?? r.writtenPassDate)?.startsWith(String(currentYear))).length}
              <span className="text-sm font-normal ml-1">명</span>
            </p>
          </div>
        ))}
        <div className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold text-slate">전체 합격자</p>
          <p className="mt-1 text-3xl font-bold">
            {rows.filter((r) => ["WRITTEN_PASS", "FINAL_PASS", "APPOINTED"].includes(r.passType)).length}
            <span className="text-sm font-normal ml-1 text-slate">명</span>
          </p>
        </div>
      </div>

      <div className="mt-8">
        <GraduateManager initialRecords={rows} />
      </div>
    </div>
  );
}
