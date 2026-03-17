import { AdminRole, PassType } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { GraduateDetailClient } from "./graduate-detail-client";

export const dynamic = "force-dynamic";

export type GraduateDetail = {
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
  student: {
    name: string;
    generation: number | null;
    examType: string;
  };
  staff: { name: string };
  scoreSnapshots: Array<{
    id: string;
    snapshotType: PassType;
    totalEnrolledMonths: number;
    overallAverage: number | null;
    finalMonthAverage: number | null;
    attendanceRate: number | null;
    subjectAverages: Record<string, number>;
    monthlyAverages: Array<{ month: string; avg: number }>;
    first3MonthsAvg: number | null;
    last3MonthsAvg: number | null;
    createdAt: string;
  }>;
};

type PageProps = { params: Promise<{ id: string }> };

export default async function GraduateDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.VIEWER);

  const { id } = await params;

  const record = await getPrisma().graduateRecord.findUnique({
    where: { id },
    include: {
      student: { select: { name: true, generation: true, examType: true } },
      staff: { select: { name: true } },
      scoreSnapshots: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!record) notFound();

  const detail: GraduateDetail = {
    ...record,
    writtenPassDate: record.writtenPassDate?.toISOString() ?? null,
    finalPassDate: record.finalPassDate?.toISOString() ?? null,
    appointedDate: record.appointedDate?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    student: {
      name: record.student.name,
      generation: record.student.generation,
      examType: record.student.examType,
    },
    scoreSnapshots: record.scoreSnapshots.map((s) => ({
      id: s.id,
      snapshotType: s.snapshotType,
      totalEnrolledMonths: s.totalEnrolledMonths,
      overallAverage: s.overallAverage,
      finalMonthAverage: s.finalMonthAverage,
      attendanceRate: s.attendanceRate,
      subjectAverages: s.subjectAverages as Record<string, number>,
      monthlyAverages: s.monthlyAverages as Array<{ month: string; avg: number }>,
      first3MonthsAvg: s.first3MonthsAvg,
      last3MonthsAvg: s.last3MonthsAvg,
      createdAt: s.createdAt.toISOString(),
    })),
  };

  return (
    <div className="p-8 sm:p-10">
      <div className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/graduates" className="hover:text-forest transition-colors">
          합격자 관리
        </Link>
        <span>/</span>
        <span className="text-ink">{record.student.name}</span>
      </div>

      <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
        합격자 상세
      </div>
      <h1 className="mt-5 text-3xl font-semibold">
        {record.student.name}
        <span className="ml-2 text-lg font-normal text-slate">
          {record.student.generation ? `${record.student.generation}기` : ""}
        </span>
      </h1>

      <GraduateDetailClient detail={detail} />
    </div>
  );
}
