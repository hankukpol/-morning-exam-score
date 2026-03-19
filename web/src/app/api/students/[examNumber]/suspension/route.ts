import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: { examNumber: string } };

// GET /api/students/[examNumber]/suspension — 학생의 모든 휴원 기록 조회
export async function GET(_req: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { examNumber } = context.params;
    const prisma = getPrisma();

    const student = await prisma.student.findUnique({
      where: { examNumber },
      select: { examNumber: true, name: true },
    });
    if (!student) return NextResponse.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });

    const enrollments = await prisma.courseEnrollment.findMany({
      where: { examNumber },
      include: {
        cohort: { select: { name: true } },
        product: { select: { name: true } },
        specialLecture: { select: { name: true } },
        leaveRecords: {
          orderBy: { leaveDate: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const records = enrollments.flatMap((enrollment) => {
      const label =
        enrollment.cohort?.name ??
        enrollment.product?.name ??
        enrollment.specialLecture?.name ??
        "수강 등록";
      return enrollment.leaveRecords.map((lr) => ({
        id: lr.id,
        enrollmentId: lr.enrollmentId,
        enrollmentLabel: label,
        enrollmentStatus: enrollment.status,
        leaveDate: lr.leaveDate.toISOString(),
        returnDate: lr.returnDate ? lr.returnDate.toISOString() : null,
        reason: lr.reason,
        approvedBy: lr.approvedBy,
      }));
    });

    records.sort((a, b) => new Date(b.leaveDate).getTime() - new Date(a.leaveDate).getTime());

    return NextResponse.json({ data: records });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}

// POST /api/students/[examNumber]/suspension — 신규 휴원 신청
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { examNumber } = context.params;
    const body = (await request.json()) as {
      enrollmentId: string;
      leaveDate: string;
      expectedReturnDate?: string;
      reason?: string;
    };

    const { enrollmentId, leaveDate, expectedReturnDate, reason } = body;

    if (!enrollmentId) {
      return NextResponse.json({ error: "수강 등록을 선택해주세요." }, { status: 400 });
    }
    if (!leaveDate) {
      return NextResponse.json({ error: "휴원 시작일을 입력해주세요." }, { status: 400 });
    }

    const prisma = getPrisma();

    const enrollment = await prisma.courseEnrollment.findUnique({
      where: { id: enrollmentId },
    });
    if (!enrollment || enrollment.examNumber !== examNumber) {
      return NextResponse.json({ error: "수강 등록을 찾을 수 없습니다." }, { status: 404 });
    }
    if (enrollment.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "수강 중(ACTIVE) 상태의 등록만 휴원 처리할 수 있습니다." },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const leaveRecord = await tx.leaveRecord.create({
        data: {
          enrollmentId,
          leaveDate: new Date(leaveDate),
          returnDate: expectedReturnDate ? new Date(expectedReturnDate) : null,
          reason: reason?.trim() || null,
          approvedBy: auth.context.adminUser.id,
        },
      });

      await tx.courseEnrollment.update({
        where: { id: enrollmentId },
        data: { status: "SUSPENDED" },
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "ENROLLMENT_LEAVE",
          targetType: "CourseEnrollment",
          targetId: enrollmentId,
          before: { status: "ACTIVE" },
          after: { status: "SUSPENDED", leaveDate, expectedReturnDate, reason },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return leaveRecord;
    });

    return NextResponse.json(
      {
        data: {
          ...result,
          leaveDate: result.leaveDate.toISOString(),
          returnDate: result.returnDate ? result.returnDate.toISOString() : null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "휴원 처리 실패" },
      { status: 500 },
    );
  }
}
