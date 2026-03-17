import { AdminRole, ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/exams/morning/subscriptions
 *
 * 아침모의고사 수강생 목록 조회
 * - 기간(periodId)별, 수험유형(examType)별 필터
 * - PeriodEnrollment 기반: 해당 기간에 등록된 학생 목록
 * - 학생의 examType(GONGCHAE/GYEONGCHAE)으로 수험유형 구분
 * - 온라인 수강생은 Student.onlineId 유무로 구분
 *
 * Query params:
 *   periodId   - ExamPeriod ID (필수)
 *   examType   - GONGCHAE | GYEONGCHAE (선택)
 *   query      - 이름/학번 검색 (선택)
 *   page       - 페이지 번호 (기본 1)
 *   limit      - 페이지 크기 (기본 50, 최대 200)
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const periodIdValue = sp.get("periodId");
  const examTypeValue = sp.get("examType") as ExamType | null;
  const query = sp.get("query")?.trim() ?? undefined;
  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? "50") || 50, 1), 200);
  const skip = (page - 1) * limit;

  if (!periodIdValue) {
    return NextResponse.json({ error: "periodId가 필요합니다." }, { status: 400 });
  }

  const periodId = Number(periodIdValue);
  if (Number.isNaN(periodId) || periodId <= 0) {
    return NextResponse.json({ error: "유효하지 않은 periodId입니다." }, { status: 400 });
  }

  // Validate examType
  if (examTypeValue && !Object.values(ExamType).includes(examTypeValue)) {
    return NextResponse.json({ error: "유효하지 않은 examType입니다." }, { status: 400 });
  }

  // PeriodEnrollment 기반으로 해당 기간에 등록된 학생 조회
  const studentWhere = {
    ...(examTypeValue ? { examType: examTypeValue } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { examNumber: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [enrollments, total] = await getPrisma().$transaction([
    getPrisma().periodEnrollment.findMany({
      where: {
        periodId,
        student: studentWhere,
      },
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            phone: true,
            examType: true,
            onlineId: true,
            isActive: true,
            currentStatus: true,
            registeredAt: true,
            generation: true,
            className: true,
          },
        },
      },
      orderBy: [{ student: { examType: "asc" } }, { student: { examNumber: "asc" } }],
      skip,
      take: limit,
    }),
    getPrisma().periodEnrollment.count({
      where: {
        periodId,
        student: studentWhere,
      },
    }),
  ]);

  // 수험유형별 집계 (전체 기간 기준) — 병렬 조회
  const [totalCount, gongchaeCount, gyeongchaeCount, onlineCount] = await getPrisma().$transaction([
    getPrisma().periodEnrollment.count({ where: { periodId } }),
    getPrisma().periodEnrollment.count({
      where: { periodId, student: { examType: ExamType.GONGCHAE } },
    }),
    getPrisma().periodEnrollment.count({
      where: { periodId, student: { examType: ExamType.GYEONGCHAE } },
    }),
    getPrisma().periodEnrollment.count({
      where: { periodId, student: { onlineId: { not: null } } },
    }),
  ]);

  const subscriptions = enrollments.map((e) => ({
    enrolledAt: e.enrolledAt.toISOString(),
    student: {
      examNumber: e.student.examNumber,
      name: e.student.name,
      mobile: e.student.phone ?? null,
      examType: e.student.examType,
      onlineId: e.student.onlineId ?? null,
      isActive: e.student.isActive,
      currentStatus: e.student.currentStatus,
      registeredAt: e.student.registeredAt?.toISOString() ?? null,
      generation: e.student.generation ?? null,
      className: e.student.className ?? null,
      isOnline: e.student.onlineId !== null,
    },
  }));

  return NextResponse.json({
    data: {
      subscriptions,
      total,
      page,
      limit,
      stats: {
        total: totalCount,
        gongchae: gongchaeCount,
        gyeongchae: gyeongchaeCount,
        online: onlineCount,
      },
    },
  });
}
