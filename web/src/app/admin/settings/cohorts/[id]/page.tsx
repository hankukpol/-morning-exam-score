import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";
import { getPrisma } from "@/lib/prisma";
import { CohortDetailClient } from "./cohort-detail-client";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CohortDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;

  const rawCohort = await getPrisma().cohort.findUnique({
    where: { id },
    include: {
      enrollments: {
        include: {
          student: { select: { name: true, phone: true } },
          staff: { select: { name: true } },
        },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!rawCohort) notFound();

  const activeCount = rawCohort.enrollments.filter(
    (e) => e.status === "PENDING" || e.status === "ACTIVE",
  ).length;
  const waitlistCount = rawCohort.enrollments.filter((e) => e.status === "WAITING").length;
  const availableSeats =
    rawCohort.maxCapacity != null ? Math.max(0, rawCohort.maxCapacity - activeCount) : null;
  const capacityPercent =
    rawCohort.maxCapacity && rawCohort.maxCapacity > 0
      ? Math.min(100, Math.round((activeCount / rawCohort.maxCapacity) * 100))
      : null;

  const cohort = {
    id: rawCohort.id,
    name: rawCohort.name,
    examCategory: rawCohort.examCategory,
    startDate: rawCohort.startDate.toISOString(),
    endDate: rawCohort.endDate.toISOString(),
    targetExamYear: rawCohort.targetExamYear,
    isActive: rawCohort.isActive,
    maxCapacity: rawCohort.maxCapacity,
    activeCount,
    waitlistCount,
    availableSeats,
    capacityPercent,
    enrollments: rawCohort.enrollments.map((e) => ({
      id: e.id,
      examNumber: e.examNumber,
      status: e.status as
        | "PENDING"
        | "ACTIVE"
        | "WAITING"
        | "SUSPENDED"
        | "COMPLETED"
        | "WITHDRAWN"
        | "CANCELLED",
      finalFee: e.finalFee,
      discountAmount: e.discountAmount,
      createdAt: e.createdAt.toISOString(),
      studentName: e.student?.name ?? null,
      studentPhone: e.student?.phone ?? null,
      staffName: e.staff?.name ?? null,
      waitlistOrder: e.waitlistOrder,
    })),
  };

  const examCategoryLabel =
    EXAM_CATEGORY_LABEL[cohort.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ??
    cohort.examCategory;

  return (
    <div className="p-8 sm:p-10">
      {/* Back link */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/settings/cohorts"
          className="inline-flex items-center gap-1.5 text-sm text-slate transition hover:text-ink"
        >
          <span>&larr;</span>
          <span>기수 목록으로</span>
        </Link>
        <span className="text-slate/40">/</span>
        <Link
          href="/admin/cohorts"
          className="text-sm text-slate transition hover:text-ink"
        >
          기수 현황 대시보드
        </Link>
      </div>

      {/* Header */}
      <div className="mt-4 inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정 · 기수 상세
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">{cohort.name}</h1>
          <p className="mt-1 text-sm text-slate">{examCategoryLabel}</p>
        </div>
        <Link
          href="/admin/cohorts/waitlist"
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
        >
          전체 대기자 관리 &rarr;
        </Link>
      </div>

      {/* Client-side detail (tabs, end date edit) */}
      <CohortDetailClient cohort={cohort} />
    </div>
  );
}
