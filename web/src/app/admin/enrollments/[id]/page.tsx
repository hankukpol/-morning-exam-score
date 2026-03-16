import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EnrollmentDetailClient } from "./enrollment-detail-client";

export const dynamic = "force-dynamic";

export type LeaveRecordRow = {
  id: string;
  leaveDate: string;
  returnDate: string | null;
  reason: string | null;
};

export type EnrollmentDetailData = {
  id: string;
  examNumber: string;
  courseType: string;
  startDate: string;
  endDate: string | null;
  regularFee: number;
  discountAmount: number;
  finalFee: number;
  status: string;
  enrollSource: string | null;
  isRe: boolean;
  createdAt: string;
  studentName: string;
  studentPhone: string | null;
  cohortName: string | null;
  productName: string | null;
  specialLectureName: string | null;
  staffName: string;
  leaveRecords: LeaveRecordRow[];
};

export default async function EnrollmentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const enrollment = await getPrisma().courseEnrollment.findUnique({
    where: { id: params.id },
    include: {
      student: { select: { name: true, phone: true } },
      cohort: { select: { name: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
      staff: { select: { name: true } },
      leaveRecords: { orderBy: { leaveDate: "desc" } },
    },
  });

  if (!enrollment) notFound();

  const data: EnrollmentDetailData = {
    id: enrollment.id,
    examNumber: enrollment.examNumber,
    courseType: enrollment.courseType,
    startDate: enrollment.startDate.toISOString(),
    endDate: enrollment.endDate ? enrollment.endDate.toISOString() : null,
    regularFee: enrollment.regularFee,
    discountAmount: enrollment.discountAmount,
    finalFee: enrollment.finalFee,
    status: enrollment.status,
    enrollSource: enrollment.enrollSource,
    isRe: enrollment.isRe,
    createdAt: enrollment.createdAt.toISOString(),
    studentName: enrollment.student.name,
    studentPhone: enrollment.student.phone,
    cohortName: enrollment.cohort?.name ?? null,
    productName: enrollment.product?.name ?? null,
    specialLectureName: enrollment.specialLecture?.name ?? null,
    staffName: enrollment.staff.name,
    leaveRecords: enrollment.leaveRecords.map((l) => ({
      id: l.id,
      leaveDate: l.leaveDate.toISOString(),
      returnDate: l.returnDate ? l.returnDate.toISOString() : null,
      reason: l.reason,
    })),
  };

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        수강 관리
      </div>
      <div className="mt-4 flex items-center gap-4">
        <h1 className="text-3xl font-semibold">수강 상세</h1>
        <Link
          href="/admin/enrollments"
          className="text-sm text-slate transition hover:text-ember"
        >
          ← 목록
        </Link>
        <Link
          href={`/admin/students/${enrollment.examNumber}?tab=enrollments`}
          className="text-sm text-slate transition hover:text-ember"
        >
          학생 수업 탭 →
        </Link>
      </div>
      <div className="mt-8 max-w-3xl">
        <EnrollmentDetailClient enrollment={data} />
      </div>
    </div>
  );
}
