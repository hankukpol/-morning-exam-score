import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = {
  params: {
    examNumber: string;
  };
};

// POST: 휴원 처리 — 수강 중(ACTIVE) 등록을 모두 SUSPENDED로 바꾸고 LeaveRecord 생성
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { reason?: string; returnDate?: string } = {};
  try {
    body = (await request.json()) as { reason?: string; returnDate?: string };
  } catch {
    // empty body is fine
  }

  const { reason, returnDate } = body;

  try {
    const prisma = getPrisma();

    // 수강생 존재 확인
    const student = await prisma.student.findUnique({
      where: { examNumber: params.examNumber },
      select: { examNumber: true, name: true, isActive: true },
    });
    if (!student) {
      return NextResponse.json({ error: "수강생을 찾을 수 없습니다." }, { status: 404 });
    }

    // ACTIVE 상태인 수강 등록 조회
    const activeEnrollments = await prisma.courseEnrollment.findMany({
      where: {
        examNumber: params.examNumber,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    if (activeEnrollments.length === 0) {
      return NextResponse.json({ error: "현재 수강 중인 등록이 없습니다." }, { status: 400 });
    }

    const leaveDate = new Date();
    const parsedReturnDate = returnDate ? new Date(returnDate) : null;

    await prisma.$transaction(async (tx) => {
      // 모든 ACTIVE 등록을 SUSPENDED로 변경하고 LeaveRecord 생성
      for (const enrollment of activeEnrollments) {
        await tx.courseEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "SUSPENDED" },
        });

        await tx.leaveRecord.create({
          data: {
            enrollmentId: enrollment.id,
            leaveDate,
            returnDate: parsedReturnDate,
            reason: reason ?? null,
            approvedBy: auth.context.adminUser.id,
          },
        });
      }

      // AuditLog 기록
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "STUDENT_SUSPEND",
          targetType: "Student",
          targetId: params.examNumber,
          after: {
            reason,
            returnDate,
            enrollmentIds: activeEnrollments.map((e) => e.id),
          },
          ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
        },
      });
    });

    return NextResponse.json({ success: true, suspended: activeEnrollments.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "휴원 처리에 실패했습니다." },
      { status: 500 },
    );
  }
}

// DELETE: 복교 처리 — SUSPENDED 등록을 ACTIVE로 복구하고 LeaveRecord.returnedAt 기록
export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const prisma = getPrisma();

    // 수강생 존재 확인
    const student = await prisma.student.findUnique({
      where: { examNumber: params.examNumber },
      select: { examNumber: true, name: true },
    });
    if (!student) {
      return NextResponse.json({ error: "수강생을 찾을 수 없습니다." }, { status: 404 });
    }

    // SUSPENDED 상태인 수강 등록 조회
    const suspendedEnrollments = await prisma.courseEnrollment.findMany({
      where: {
        examNumber: params.examNumber,
        status: "SUSPENDED",
      },
      include: {
        leaveRecords: {
          where: { returnDate: null },
          orderBy: { leaveDate: "desc" },
          take: 1,
        },
      },
    });

    if (suspendedEnrollments.length === 0) {
      return NextResponse.json({ error: "현재 휴원 중인 등록이 없습니다." }, { status: 400 });
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      for (const enrollment of suspendedEnrollments) {
        // ACTIVE로 복구
        await tx.courseEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "ACTIVE" },
        });

        // 열린 LeaveRecord의 returnDate를 오늘로 업데이트
        const openLeave = enrollment.leaveRecords[0];
        if (openLeave) {
          await tx.leaveRecord.update({
            where: { id: openLeave.id },
            data: { returnDate: now },
          });
        }
      }

      // AuditLog 기록
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "STUDENT_RESTORE",
          targetType: "Student",
          targetId: params.examNumber,
          after: {
            enrollmentIds: suspendedEnrollments.map((e) => e.id),
            restoredAt: now.toISOString(),
          },
          ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
        },
      });
    });

    return NextResponse.json({ success: true, restored: suspendedEnrollments.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "복교 처리에 실패했습니다." },
      { status: 500 },
    );
  }
}
