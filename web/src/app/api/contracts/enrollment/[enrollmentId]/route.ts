import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
type RouteContext = { params: Promise<{ enrollmentId: string }> };

type ContractItem = { label: string; amount: number };

function makeInitialItems(enrollment: {
  cohort: { name: string } | null;
  specialLecture: { name: string } | null;
  product: { name: string } | null;
  finalFee: number;
}): ContractItem[] {
  const courseName =
    enrollment.cohort?.name ??
    enrollment.specialLecture?.name ??
    enrollment.product?.name ??
    "강좌";
  return [{ label: courseName, amount: enrollment.finalFee }];
}

/**
 * GET /api/contracts/enrollment/[enrollmentId]
 * 계약서 조회. 없으면 enrollment 데이터로 자동 생성 후 반환.
 */
export async function GET(_req: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { enrollmentId } = await context.params;
  const prisma = getPrisma();

  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      cohort: { select: { name: true } },
      specialLecture: { select: { name: true } },
      product: { select: { name: true } },
    },
  });
  if (!enrollment) {
    return NextResponse.json({ error: "수강 등록을 찾을 수 없습니다." }, { status: 404 });
  }

  let contract = await prisma.courseContract.findUnique({
    where: { enrollmentId },
  });

  if (!contract) {
    // 최초 조회 시 자동 생성
    contract = await prisma.courseContract.create({
      data: {
        enrollmentId,
        items: makeInitialItems(enrollment),
        staffId: auth.context.adminUser.id,
      },
    });
  }

  return NextResponse.json({ contract });
}

/**
 * PATCH /api/contracts/enrollment/[enrollmentId]
 * 계약서 항목(items) 및 특약사항(note) 수정.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { enrollmentId } = await context.params;
  const body = await request.json();
  const { items, note } = body as { items?: ContractItem[]; note?: string };

  if (items !== undefined) {
    if (!Array.isArray(items)) {
      return NextResponse.json({ error: "items는 배열이어야 합니다." }, { status: 400 });
    }
    for (const item of items) {
      if (typeof item.label !== "string" || !item.label.trim()) {
        return NextResponse.json({ error: "각 항목에 label이 필요합니다." }, { status: 400 });
      }
      if (typeof item.amount !== "number" || !Number.isFinite(item.amount)) {
        return NextResponse.json({ error: "각 항목에 숫자 amount가 필요합니다." }, { status: 400 });
      }
    }
  }

  const prisma = getPrisma();
  const contract = await prisma.courseContract.findUnique({ where: { enrollmentId } });
  if (!contract) {
    return NextResponse.json({ error: "계약서가 존재하지 않습니다. 먼저 조회하세요." }, { status: 404 });
  }

  const updated = await prisma.courseContract.update({
    where: { enrollmentId },
    data: {
      ...(items !== undefined ? { items } : {}),
      ...(note !== undefined ? { note: note.trim() || null } : {}),
    },
  });

  return NextResponse.json({ contract: updated });
}
