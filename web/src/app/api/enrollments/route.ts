import { AdminRole, CourseType, EnrollmentStatus, EnrollSource } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const examNumber = sp.get("examNumber") ?? undefined;
  const courseType = sp.get("courseType") as CourseType | null;
  const status = sp.get("status") as EnrollmentStatus | null;
  const cohortId = sp.get("cohortId") ?? undefined;
  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? "50") || 50, 1), 200);
  const skip = (page - 1) * limit;

  const where = {
    ...(examNumber ? { examNumber } : {}),
    ...(courseType ? { courseType } : {}),
    ...(status ? { status } : {}),
    ...(cohortId ? { cohortId } : {}),
  };

  const [enrollments, total] = await getPrisma().$transaction([
    getPrisma().courseEnrollment.findMany({
      where,
      include: {
        student: { select: { name: true, phone: true } },
        cohort: { select: { name: true, examCategory: true } },
        product: { select: { name: true } },
        specialLecture: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    getPrisma().courseEnrollment.count({ where }),
  ]);

  return NextResponse.json({ enrollments, total });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const {
      examNumber,
      courseType,
      productId,
      cohortId,
      specialLectureId,
      startDate,
      endDate,
      regularFee,
      discountAmount,
      finalFee,
      enrollSource,
      isRe,
      extraData,
      discountCodeId,
    } = body;

    if (!examNumber?.trim()) throw new Error("수험번호를 입력하세요.");
    if (!courseType) throw new Error("수강 유형을 선택하세요.");
    if (courseType === "COMPREHENSIVE" && !productId) throw new Error("상품을 선택하세요.");
    if (courseType === "COMPREHENSIVE" && !cohortId) throw new Error("기수를 선택하세요.");
    if (courseType === "SPECIAL_LECTURE" && !specialLectureId)
      throw new Error("특강을 선택하세요.");
    if (!startDate) throw new Error("시작일을 입력하세요.");
    if (regularFee === undefined || regularFee === null || regularFee < 0)
      throw new Error("수강료를 입력하세요.");
    if (finalFee === undefined || finalFee === null || finalFee < 0)
      throw new Error("최종 수강료를 입력하세요.");

    // Capacity check: if cohortId is provided, check if cohort is full
    let enrollmentStatus: EnrollmentStatus = "PENDING";
    let waitlistOrder: number | null = null;

    if (cohortId) {
      const cohort = await getPrisma().cohort.findUnique({ where: { id: cohortId } });
      if (cohort?.maxCapacity) {
        const activeEnrollmentCount = await getPrisma().courseEnrollment.count({
          where: {
            cohortId,
            status: { in: ["PENDING", "ACTIVE"] },
          },
        });
        if (activeEnrollmentCount >= cohort.maxCapacity) {
          const maxWaitlistOrder = await getPrisma().courseEnrollment.aggregate({
            where: { cohortId, status: "WAITING" },
            _max: { waitlistOrder: true },
          });
          enrollmentStatus = "WAITING";
          waitlistOrder = (maxWaitlistOrder._max.waitlistOrder ?? 0) + 1;
        }
      }
    }

    // Validate discount code if provided (re-validate server-side)
    let resolvedDiscountCodeId: number | null = null;
    if (discountCodeId) {
      const codeRecord = await getPrisma().discountCode.findUnique({
        where: { id: Number(discountCodeId) },
      });
      if (!codeRecord) throw new Error("할인 코드를 찾을 수 없습니다.");
      if (!codeRecord.isActive) throw new Error("비활성화된 할인 코드입니다.");
      if (codeRecord.maxUsage !== null && codeRecord.usageCount >= codeRecord.maxUsage) {
        throw new Error("사용 한도가 초과된 할인 코드입니다.");
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const validFrom = new Date(codeRecord.validFrom);
      validFrom.setHours(0, 0, 0, 0);
      if (today < validFrom) throw new Error("아직 유효 기간이 시작되지 않은 코드입니다.");
      if (codeRecord.validUntil) {
        const validUntil = new Date(codeRecord.validUntil);
        validUntil.setHours(23, 59, 59, 999);
        if (today > validUntil) throw new Error("만료된 할인 코드입니다.");
      }
      resolvedDiscountCodeId = codeRecord.id;
    }

    const enrollment = await getPrisma().$transaction(async (tx) => {
      const created = await tx.courseEnrollment.create({
        data: {
          examNumber: examNumber.trim(),
          courseType: courseType as CourseType,
          productId: productId ?? null,
          cohortId: cohortId ?? null,
          specialLectureId: specialLectureId ?? null,
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          regularFee: Number(regularFee),
          discountAmount: Number(discountAmount ?? 0),
          finalFee: Number(finalFee),
          status: enrollmentStatus,
          waitlistOrder,
          enrollSource: (enrollSource as EnrollSource) ?? null,
          staffId: auth.context.adminUser.id,
          isRe: Boolean(isRe ?? false),
          extraData: extraData ?? null,
        },
        include: {
          student: { select: { name: true, phone: true } },
          cohort: { select: { name: true, examCategory: true } },
          product: { select: { name: true } },
          specialLecture: { select: { name: true } },
        },
      });

      // Record discount code usage if applied
      if (resolvedDiscountCodeId !== null) {
        // DiscountCodeUsage requires a paymentId, so we store in extraData only here.
        // The actual DiscountCodeUsage linking to a Payment is created at payment time.
        // We increment usageCount immediately so it can't be reused beyond maxUsage.
        await tx.discountCode.update({
          where: { id: resolvedDiscountCodeId },
          data: { usageCount: { increment: 1 } },
        });
      }

      // Auto-create contract record if not exists
      const courseName =
        created.cohort?.name ??
        created.product?.name ??
        created.specialLecture?.name ??
        "수강";
      await tx.courseContract.upsert({
        where: { enrollmentId: created.id },
        create: {
          enrollmentId: created.id,
          items: [{ label: courseName, amount: created.finalFee }],
          staffId: auth.context.adminUser.id,
        },
        update: {}, // don't overwrite if already exists
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "CREATE_ENROLLMENT",
          targetType: "courseEnrollment",
          targetId: created.id,
          after: {
            examNumber: created.examNumber,
            courseType: created.courseType,
            finalFee: created.finalFee,
            status: created.status,
            ...(resolvedDiscountCodeId !== null ? { discountCodeId: resolvedDiscountCodeId } : {}),
          },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });
      return created;
    });

    return NextResponse.json({ enrollment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "등록 실패" },
      { status: 400 },
    );
  }
}
