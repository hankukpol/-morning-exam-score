import { AdminRole, CourseType, EnrollmentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;

  // 필터 파싱
  const startDate = sp.get("startDate") ?? "";
  const endDate = sp.get("endDate") ?? "";
  const cohortId = sp.get("cohortId") ?? "";
  const status = sp.get("status") as EnrollmentStatus | null;
  const courseType = sp.get("courseType") as CourseType | null;

  const fromDate = startDate ? new Date(startDate + "T00:00:00") : undefined;
  const toDate = endDate ? new Date(endDate + "T23:59:59") : undefined;

  const where = {
    ...(cohortId ? { cohortId } : {}),
    ...(status ? { status } : {}),
    ...(courseType ? { courseType } : {}),
    ...((fromDate || toDate)
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const enrollments = await getPrisma().courseEnrollment.findMany({
    where,
    include: {
      student: { select: { name: true, examNumber: true, phone: true } },
      cohort: { select: { name: true, startDate: true, endDate: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
      staff: { select: { name: true } },
    },
    orderBy: { student: { examNumber: "asc" } },
    take: 1000,
  });

  // Date 직렬화
  const data = enrollments.map((e) => ({
    ...e,
    startDate: e.startDate.toISOString(),
    endDate: e.endDate?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    cohort: e.cohort
      ? {
          ...e.cohort,
          startDate: e.cohort.startDate.toISOString(),
          endDate: e.cohort.endDate.toISOString(),
        }
      : null,
  }));

  return NextResponse.json({ data });
}
