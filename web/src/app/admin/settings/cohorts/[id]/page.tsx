import { AdminRole, EnrollmentStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { WaitlistPromoteButton } from "./waitlist-promote-button";

const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  PENDING: "수강 대기",
  ACTIVE: "수강 중",
  SUSPENDED: "휴원",
  COMPLETED: "수료",
  WITHDRAWN: "퇴원",
  CANCELLED: "취소",
  WAITING: "정원 대기",
};

const ENROLLMENT_STATUS_COLOR: Record<EnrollmentStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  ACTIVE: "border-forest/20 bg-forest/10 text-forest",
  SUSPENDED: "border-blue-200 bg-blue-50 text-blue-700",
  COMPLETED: "border-slate/20 bg-slate/10 text-slate",
  WITHDRAWN: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-red-200 bg-red-50 text-red-700",
  WAITING: "border-amber-200 bg-amber-50 text-amber-700",
};

export const dynamic = "force-dynamic";

type PageProps = {
  params: { id: string };
};

export default async function CohortDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const cohort = await getPrisma().cohort.findUnique({
    where: { id: params.id },
  });

  if (!cohort) notFound();

  const [enrollments, waitlistEnrollments] = await Promise.all([
    getPrisma().courseEnrollment.findMany({
      where: {
        cohortId: cohort.id,
        status: { notIn: ["WAITING"] },
      },
      include: {
        student: { select: { name: true, phone: true } },
        staff: { select: { name: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    }),
    getPrisma().courseEnrollment.findMany({
      where: {
        cohortId: cohort.id,
        status: "WAITING",
      },
      include: {
        student: { select: { name: true } },
      },
      orderBy: { waitlistOrder: "asc" },
    }),
  ]);

  const activeCount = enrollments.filter(
    (e) => e.status === "PENDING" || e.status === "ACTIVE",
  ).length;

  const capacityPercent =
    cohort.maxCapacity && cohort.maxCapacity > 0
      ? Math.min(100, Math.round((activeCount / cohort.maxCapacity) * 100))
      : null;

  return (
    <div className="p-8 sm:p-10">
      {/* Back link */}
      <Link
        href="/admin/settings/cohorts"
        className="inline-flex items-center gap-1.5 text-sm text-slate transition hover:text-ink"
      >
        <span>&#8592;</span>
        <span>기수 목록으로</span>
      </Link>

      {/* Header */}
      <div className="mt-4 inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정 · 기수 상세
      </div>
      <h1 className="mt-5 text-3xl font-semibold">{cohort.name}</h1>

      {/* Cohort info card */}
      <div className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate">수험유형</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {EXAM_CATEGORY_LABEL[cohort.examCategory]}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate">기간</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {formatDate(cohort.startDate)} ~ {formatDate(cohort.endDate)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate">목표시험연도</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {cohort.targetExamYear != null ? `${cohort.targetExamYear}년` : "-"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate">상태</p>
          <p className="mt-1">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                cohort.isActive ? "bg-forest/10 text-forest" : "bg-slate/10 text-slate"
              }`}
            >
              {cohort.isActive ? "활성" : "비활성"}
            </span>
          </p>
        </div>
      </div>

      {/* Capacity bar */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">정원 현황</h2>
          <span className="text-sm text-slate">
            {cohort.maxCapacity != null
              ? `${activeCount} / ${cohort.maxCapacity}명`
              : `${activeCount}명 (무제한)`}
          </span>
        </div>
        {capacityPercent !== null ? (
          <div className="mt-3">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
              <div
                className={`h-2.5 rounded-full transition-all ${
                  capacityPercent >= 100
                    ? "bg-red-500"
                    : capacityPercent >= 80
                      ? "bg-amber-500"
                      : "bg-forest"
                }`}
                style={{ width: `${capacityPercent}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-slate">{capacityPercent}% 사용 중</p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate">정원 제한 없음</p>
        )}
        {waitlistEnrollments.length > 0 ? (
          <div className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            대기자 {waitlistEnrollments.length}명
          </div>
        ) : null}
      </div>

      {/* Enrolled students table */}
      <div className="mt-6">
        <h2 className="mb-4 text-base font-semibold text-ink">
          수강생 명단{" "}
          <span className="ml-1 text-sm font-normal text-slate">({enrollments.length}명)</span>
        </h2>
        {enrollments.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-10 text-center text-sm text-slate">
            등록된 수강생이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr>
                  {["#", "학생명", "수험번호", "연락처", "수강료", "상태", "등록일", "담당자", "바로가기"].map((h) => (
                    <th
                      key={h}
                      className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {enrollments.map((e, i) => (
                  <tr key={e.id} className="hover:bg-mist/20">
                    <td className="px-4 py-3 text-xs text-slate tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                      {e.student?.name ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate tabular-nums">{e.examNumber}</td>
                    <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                      {e.student?.phone ?? "-"}
                    </td>
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                      {e.finalFee.toLocaleString()}원
                      {e.discountAmount > 0 && (
                        <span className="ml-1 text-xs text-slate">(-{e.discountAmount.toLocaleString()})</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${ENROLLMENT_STATUS_COLOR[e.status]}`}>
                        {ENROLLMENT_STATUS_LABEL[e.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                      {formatDate(e.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                      {e.staff?.name ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/enrollments/${e.id}`}
                          className="rounded-full border border-ink/10 px-2.5 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
                        >
                          수강 상세
                        </Link>
                        <Link
                          href={`/admin/students/${e.examNumber}`}
                          className="rounded-full border border-ink/10 px-2.5 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
                        >
                          학생 정보
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Waitlist table */}
      <div className="mt-6">
        <h2 className="mb-4 text-base font-semibold text-ink">대기자 명단</h2>
        {waitlistEnrollments.length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-10 text-center text-sm text-slate">
            대기자가 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead>
                <tr>
                  {["순번", "학생명", "수험번호", "수강료", "등록일", "액션"].map((header) => (
                    <th
                      key={header}
                      className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {waitlistEnrollments.map((enrollment) => (
                  <tr key={enrollment.id} className="transition hover:bg-mist/30">
                    <td className="px-4 py-3 text-slate">
                      {enrollment.waitlistOrder ?? "-"}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {enrollment.student?.name ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate">{enrollment.examNumber}</td>
                    <td className="px-4 py-3 text-slate">
                      {enrollment.finalFee.toLocaleString("ko-KR")}원
                    </td>
                    <td className="px-4 py-3 text-xs text-slate">
                      {formatDate(enrollment.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <WaitlistPromoteButton enrollmentId={enrollment.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
