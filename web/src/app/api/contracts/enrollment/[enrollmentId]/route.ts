import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ enrollmentId: string }> };

type ContractItem = { label: string; amount: number };

/**
 * GET /api/contracts/enrollment/[enrollmentId]
 * 계약서 조회. 없으면 enrollment 데이터로 자동 생성 후 반환.
 */
export async function GET(_req: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { enrollmentId } = await context.params;
  const prisma = getPrisma();

  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      courseType: true,
      productId: true,
      cohortId: true,
      specialLectureId: true,
      regularFee: true,
      finalFee: true,
      product: { select: { name: true } },
      cohort: { select: { name: true } },
      specialLecture: { select: { name: true } },
      student: { select: { name: true, examNumber: true } },
    },
  });

  if (!enrollment) {
    return NextResponse.json({ error: "수강 등록을 찾을 수 없습니다." }, { status: 404 });
  }

  let contract = await prisma.courseContract.findUnique({
    where: { enrollmentId },
  });

  if (!contract) {
    // 자동 생성: 항목명 우선순위 product > cohort > specialLecture > "수강료"
    let itemLabel = "수강료";
    if (enrollment.product?.name) {
      itemLabel = enrollment.product.name;
    } else if (enrollment.cohort?.name) {
      itemLabel = enrollment.cohort.name;
    } else if (enrollment.specialLecture?.name) {
      itemLabel = enrollment.specialLecture.name;
    }

    const initialItems: ContractItem[] = [
      { label: itemLabel, amount: enrollment.finalFee },
    ];

    contract = await prisma.courseContract.create({
      data: {
        enrollmentId,
        items: initialItems,
        staffId: auth.context.adminUser.id,
      },
    });
  }

  return NextResponse.json({ data: { contract, enrollment } });
}

/**
 * PATCH /api/contracts/enrollment/[enrollmentId]
 * 계약서 항목(items) 및 특약사항(note) 수정.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { enrollmentId } = await context.params;

  let body: { items?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  // Validate items if provided
  if (body.items !== undefined) {
    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: "items는 배열이어야 합니다." }, { status: 400 });
    }
    for (const item of body.items) {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof (item as Record<string, unknown>).label !== "string" ||
        typeof (item as Record<string, unknown>).amount !== "number"
      ) {
        return NextResponse.json(
          { error: "각 항목은 label(문자열)과 amount(숫자)를 포함해야 합니다." },
          { status: 400 },
        );
      }
    }
  }

  const prisma = getPrisma();

  const existing = await prisma.courseContract.findUnique({ where: { enrollmentId } });
  if (!existing) {
    return NextResponse.json({ error: "계약서를 찾을 수 없습니다." }, { status: 404 });
  }

  const updated = await prisma.courseContract.update({
    where: { enrollmentId },
    data: {
      ...(body.items !== undefined ? { items: body.items as ContractItem[] } : {}),
      ...(body.note !== undefined ? { note: body.note as string | null } : {}),
    },
  });

  return NextResponse.json({ data: { contract: updated } });
}
