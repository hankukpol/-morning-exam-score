import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";
import { getPrisma } from "@/lib/prisma";
import { WaitlistManager } from "./waitlist-manager";

export const dynamic = "force-dynamic";

export default async function WaitlistPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  // 대기자가 있는 기수들 + 해당 수강 정보 조회
  const waitlistEnrollments = await getPrisma().courseEnrollment.findMany({
    where: {
      status: "WAITING",
      cohortId: { not: null },
    },
    include: {
      student: { select: { name: true, phone: true } },
      cohort: {
        include: {
          enrollments: { select: { status: true } },
        },
      },
    },
    orderBy: [{ cohortId: "asc" }, { waitlistOrder: "asc" }],
  });

  // 기수별 그룹핑
  type WaitlistItem = {
    id: string;
    examNumber: string;
    studentName: string | null;
    studentPhone: string | null;
    waitlistOrder: number | null;
    createdAt: string;
    finalFee: number;
  };

  type CohortGroup = {
    cohortId: string;
    cohortName: string;
    examCategory: string;
    maxCapacity: number | null;
    isActive: boolean;
    activeCount: number;
    availableSeats: number | null;
    waitlistItems: WaitlistItem[];
  };

  const cohortMap = new Map<string, CohortGroup>();

  for (const e of waitlistEnrollments) {
    if (!e.cohortId || !e.cohort) continue;

    if (!cohortMap.has(e.cohortId)) {
      const activeCount = e.cohort.enrollments.filter(
        (ce) => ce.status === "PENDING" || ce.status === "ACTIVE",
      ).length;
      const availableSeats =
        e.cohort.maxCapacity != null
          ? Math.max(0, e.cohort.maxCapacity - activeCount)
          : null;

      cohortMap.set(e.cohortId, {
        cohortId: e.cohortId,
        cohortName: e.cohort.name,
        examCategory: e.cohort.examCategory,
        maxCapacity: e.cohort.maxCapacity,
        isActive: e.cohort.isActive,
        activeCount,
        availableSeats,
        waitlistItems: [],
      });
    }

    cohortMap.get(e.cohortId)!.waitlistItems.push({
      id: e.id,
      examNumber: e.examNumber,
      studentName: e.student?.name ?? null,
      studentPhone: e.student?.phone ?? null,
      waitlistOrder: e.waitlistOrder,
      createdAt: e.createdAt.toISOString(),
      finalFee: e.finalFee,
    });
  }

  const groups = Array.from(cohortMap.values());
  const totalWaiting = groups.reduce((sum, g) => sum + g.waitlistItems.length, 0);

  return (
    <div className="p-8 sm:p-10">
      {/* Back + Header */}
      <Link
        href="/admin/cohorts"
        className="inline-flex items-center gap-1.5 text-sm text-slate transition hover:text-ink"
      >
        <span>&larr;</span>
        <span>기수 현황으로</span>
      </Link>

      <div className="mt-4 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
        수강 관리 · 대기자 관리
      </div>
      <h1 className="mt-3 text-3xl font-semibold text-ink">대기자 관리</h1>
      <p className="mt-1 text-sm text-slate">
        기수별 대기자 목록과 여석 현황을 확인하고 수강을 확정합니다.
      </p>

      {/* Summary */}
      <div className="mt-6 flex items-center gap-4">
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-3">
          <p className="text-xs text-amber-700">전체 대기자</p>
          <p className="mt-0.5 text-2xl font-semibold text-amber-700 tabular-nums">{totalWaiting}명</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white px-5 py-3">
          <p className="text-xs text-slate">대기자 있는 기수</p>
          <p className="mt-0.5 text-2xl font-semibold text-ink tabular-nums">{groups.length}개</p>
        </div>
      </div>

      {/* Waitlist manager */}
      {groups.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-16 text-center text-sm text-slate">
          현재 대기자가 없습니다.
        </div>
      ) : (
        <WaitlistManager groups={groups} />
      )}
    </div>
  );
}
