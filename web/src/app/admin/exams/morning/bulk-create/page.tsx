import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { BulkCreateForm } from "./bulk-create-form";

export const dynamic = "force-dynamic";

export default async function BulkCreateSessionPage() {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const periods = await getPrisma().examPeriod.findMany({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      isActive: true,
      isGongchaeEnabled: true,
      isGyeongchaeEnabled: true,
      totalWeeks: true,
    },
  });

  const periodOptions = periods.map((p) => ({
    id: p.id,
    name: p.name,
    startDate: p.startDate.toISOString(),
    endDate: p.endDate.toISOString(),
    isActive: p.isActive,
    isGongchaeEnabled: p.isGongchaeEnabled,
    isGyeongchaeEnabled: p.isGyeongchaeEnabled,
    totalWeeks: p.totalWeeks,
  }));

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "아침 모의고사", href: "/admin/exams/morning" },
          { label: "회차 일괄 생성" },
        ]}
      />

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            회차 일괄 생성
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-ink">시험 회차 일괄 생성</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate">
            날짜 범위와 요일별 과목을 설정하여 시험 회차를 한 번에 생성합니다. 이미 존재하는
            회차는 자동으로 건너뜁니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/exams/morning"
            className="inline-flex items-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
          >
            수강 현황
          </Link>
          <Link
            href="/admin/exams/morning/sessions"
            className="inline-flex items-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            회차 목록 →
          </Link>
        </div>
      </div>

      {/* ── 안내 ────────────────────────────────────────────────────────────── */}
      <div className="mt-6 rounded-[20px] border border-sky-200 bg-sky-50 px-5 py-4 text-sm leading-6 text-sky-800">
        <strong>사용 방법:</strong> ①&nbsp;시험 기간 선택 → ②&nbsp;날짜 범위 설정 →
        ③&nbsp;요일별 직렬·과목·시작시간 설정 → ④&nbsp;미리보기 확인 후 <strong>일괄 생성</strong> 클릭
        <br />
        중복 회차(동일 기간·직렬·날짜·과목)는 자동으로 건너뛰고 새 회차만 생성됩니다.
      </div>

      <div className="mt-8">
        {periodOptions.length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-mist p-10 text-center">
            <p className="text-sm text-slate">등록된 시험 기간이 없습니다.</p>
            <Link
              href="/admin/periods"
              className="mt-4 inline-flex items-center rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest/90"
            >
              시험 기간 등록하기
            </Link>
          </div>
        ) : (
          <BulkCreateForm periods={periodOptions} />
        )}
      </div>
    </div>
  );
}
