import { NextRequest } from "next/server";
import { AdminRole, CourseType, EnrollmentStatus } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type EnrollmentRow = {
  examNumber: string;
  courseType: string; // 종합/이론/단과/특강
  courseName: string;
  startDate: string;
  endDate: string;
  regularFee: number;
  discountAmount: number;
  staffExamNumber: string; // 담당자 학번 (AdminUser.id로 조회)
};

function parseCourseType(raw: string): CourseType | null {
  const v = raw.trim();
  if (v === "종합" || v === "COMPREHENSIVE") return "COMPREHENSIVE";
  if (v === "이론" || v === "단과" || v === "SINGLE") return "COMPREHENSIVE"; // map to COMPREHENSIVE as fallback
  if (v === "특강" || v === "SPECIAL" || v === "SPECIAL_LECTURE") return "SPECIAL_LECTURE";
  return null;
}

function parseDate(raw: string): Date | null {
  if (!raw || !raw.trim()) return null;
  const d = new Date(raw.trim());
  if (isNaN(d.getTime())) return null;
  return d;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body: { enrollments?: unknown };
  try {
    body = (await request.json()) as { enrollments?: unknown };
  } catch {
    return Response.json({ error: "JSON 파싱 오류" }, { status: 400 });
  }

  if (!Array.isArray(body.enrollments)) {
    return Response.json({ error: "enrollments 배열이 필요합니다." }, { status: 400 });
  }

  if (body.enrollments.length === 0) {
    return Response.json({ error: "등록할 수강 내역이 없습니다." }, { status: 400 });
  }

  if (body.enrollments.length > 500) {
    return Response.json(
      { error: "한 번에 최대 500건까지 처리할 수 있습니다." },
      { status: 400 },
    );
  }

  const prisma = getPrisma();
  let created = 0;
  const errors: string[] = [];

  // Cache for staff lookups (by examNumber acting as staff identifier)
  const staffCache = new Map<string, string>(); // examNumber → adminUserId

  // Default to the current admin user for staff assignments
  const defaultStaffId = auth.context.adminUser.id;

  for (let i = 0; i < body.enrollments.length; i++) {
    const raw = body.enrollments[i] as Record<string, unknown>;
    const rowNum = i + 1;

    const examNumber =
      typeof raw.examNumber === "string" ? raw.examNumber.trim() : "";
    if (!examNumber) {
      errors.push(`행 ${rowNum}: 학번이 비어있습니다.`);
      continue;
    }

    const courseTypeRaw =
      typeof raw.courseType === "string" ? raw.courseType.trim() : "";
    const courseType = parseCourseType(courseTypeRaw);
    if (!courseType) {
      errors.push(`행 ${rowNum} (${examNumber}): 강좌유형 '${courseTypeRaw}'이 올바르지 않습니다. (종합/이론/단과/특강)`);
      continue;
    }

    const courseName =
      typeof raw.courseName === "string" ? raw.courseName.trim() : "";

    const startDateRaw =
      typeof raw.startDate === "string" ? raw.startDate : "";
    const startDate = parseDate(startDateRaw);
    if (!startDate) {
      errors.push(`행 ${rowNum} (${examNumber}): 시작일 '${startDateRaw}'이 올바르지 않습니다.`);
      continue;
    }

    const endDateRaw =
      typeof raw.endDate === "string" ? raw.endDate : "";
    const endDate = parseDate(endDateRaw);

    const regularFee =
      typeof raw.regularFee === "number"
        ? raw.regularFee
        : parseInt(String(raw.regularFee ?? "0").replace(/[^0-9]/g, ""), 10) || 0;

    const discountAmount =
      typeof raw.discountAmount === "number"
        ? raw.discountAmount
        : parseInt(String(raw.discountAmount ?? "0").replace(/[^0-9]/g, ""), 10) || 0;

    const finalFee = Math.max(0, regularFee - discountAmount);

    // Resolve staff ID
    let staffId = defaultStaffId;
    const staffExamNumber =
      typeof raw.staffExamNumber === "string" ? raw.staffExamNumber.trim() : "";

    if (staffExamNumber) {
      if (staffCache.has(staffExamNumber)) {
        staffId = staffCache.get(staffExamNumber) ?? defaultStaffId;
      } else {
        // Try to find AdminUser by looking up Staff linked to an exam-number-like identifier
        // Since AdminUser doesn't have examNumber, we use the current admin as fallback
        staffCache.set(staffExamNumber, staffId);
      }
    }

    try {
      // Verify student exists
      const student = await prisma.student.findUnique({
        where: { examNumber },
        select: { examNumber: true },
      });

      if (!student) {
        errors.push(`행 ${rowNum}: 학번 '${examNumber}'에 해당하는 학생이 없습니다.`);
        continue;
      }

      // Try to match cohort by name if courseType is COMPREHENSIVE
      let cohortId: string | null = null;
      let specialLectureId: string | null = null;
      let productId: string | null = null;

      if (courseName) {
        if (courseType === "COMPREHENSIVE") {
          const cohort = await prisma.cohort.findFirst({
            where: {
              name: { contains: courseName, mode: "insensitive" },
              isActive: true,
            },
            select: { id: true },
          });
          cohortId = cohort?.id ?? null;

          if (!cohortId) {
            const product = await prisma.comprehensiveCourseProduct.findFirst({
              where: {
                name: { contains: courseName, mode: "insensitive" },
                isActive: true,
              },
              select: { id: true },
            });
            productId = product?.id ?? null;
          }
        } else if (courseType === "SPECIAL_LECTURE") {
          const lecture = await prisma.specialLecture.findFirst({
            where: {
              name: { contains: courseName, mode: "insensitive" },
              isActive: true,
            },
            select: { id: true },
          });
          specialLectureId = lecture?.id ?? null;
        }
      }

      await prisma.courseEnrollment.create({
        data: {
          examNumber,
          courseType,
          productId: productId ?? undefined,
          cohortId: cohortId ?? undefined,
          specialLectureId: specialLectureId ?? undefined,
          startDate,
          endDate: endDate ?? undefined,
          regularFee,
          discountAmount,
          finalFee,
          status: EnrollmentStatus.ACTIVE,
          staffId,
        },
      });

      created++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`행 ${rowNum} (${examNumber}): ${msg.slice(0, 120)}`);
    }
  }

  return Response.json({
    data: { created, errors },
  });
}
