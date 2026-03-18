import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EnrollForm } from "./enroll-form";

export const dynamic = "force-dynamic";

type PeriodOption = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

export default async function MorningEnrollPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();

  const periods = await prisma.examPeriod.findMany({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
  });

  const periodOptions: PeriodOption[] = periods.map((p) => ({
    id: p.id,
    name: p.name,
    startDate: p.startDate.toISOString(),
    endDate: p.endDate.toISOString(),
    isActive: p.isActive,
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Back */}
      <div className="mb-6 flex items-center gap-2">
        <Link
          href="/admin/exams/morning"
          className="text-sm text-slate transition hover:text-ink"
        >
          &larr; 아침모의고사 수강 현황
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            아침 모의고사
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">수강생 등록</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate">
            기간(기수)별 아침모의고사 수강생을 등록합니다. 학번으로 개별 또는 일괄 등록이
            가능합니다.
          </p>
        </div>
      </div>

      {/* Form */}
      {periodOptions.length === 0 ? (
        <div className="rounded-[28px] border border-ink/10 bg-mist p-10 text-center">
          <p className="text-slate">등록된 시험 기간이 없습니다.</p>
          <Link
            href="/admin/periods"
            className="mt-4 inline-flex items-center rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest/90"
          >
            시험 기간 등록하기
          </Link>
        </div>
      ) : (
        <EnrollForm periods={periodOptions} />
      )}
    </div>
  );
}
