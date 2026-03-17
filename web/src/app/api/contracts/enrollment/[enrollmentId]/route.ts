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
      finalFee: true,
      regularFee: true,
      cohort: { select: { name: true, examCategory: true } },
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
    // 초기 items: cohort name + finalFee
    const initialItems: ContractItem[] = [
      { label: enrollment.cohort?.name ?? "수강료", amount: enrollment.finalFee ?? enrollment.regularFee ?? 0 },
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
  const body = await request.json() as { items?: ContractItem[]; note?: string };

  const prisma = getPrisma();

  const existing = await prisma.courseContract.findUnique({ where: { enrollmentId } });
  if (!existing) {
    return NextResponse.json({ error: "계약서를 찾을 수 없습니다." }, { status: 404 });
  }

  const updated = await prisma.courseContract.update({
    where: { enrollmentId },
    data: {
      ...(body.items !== undefined ? { items: body.items } : {}),
      ...(body.note !== undefined ? { note: body.note } : {}),
    },
  });

  return NextResponse.json({ data: { contract: updated } });
}
