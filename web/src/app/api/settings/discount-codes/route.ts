import { AdminRole, CodeType, DiscountType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const codes = await getPrisma().discountCode.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: { staff: { select: { name: true } } },
  });

  return NextResponse.json({ codes });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { code, type, discountType, discountValue, maxUsage, validFrom, validUntil, isActive } =
      body;

    if (!code?.trim()) {
      return NextResponse.json({ error: "할인 코드를 입력해주세요." }, { status: 400 });
    }
    if (!type || !Object.values(CodeType).includes(type)) {
      return NextResponse.json({ error: "코드 유형을 선택해주세요." }, { status: 400 });
    }
    if (!discountType || !Object.values(DiscountType).includes(discountType)) {
      return NextResponse.json({ error: "할인 방식을 선택해주세요." }, { status: 400 });
    }
    if (!discountValue || isNaN(Number(discountValue)) || Number(discountValue) <= 0) {
      return NextResponse.json({ error: "할인 값을 입력해주세요." }, { status: 400 });
    }
    if (!validFrom) {
      return NextResponse.json({ error: "유효 시작일을 입력해주세요." }, { status: 400 });
    }

    const newCode = await getPrisma().discountCode.create({
      data: {
        code: code.trim().toUpperCase(),
        type,
        discountType,
        discountValue: Number(discountValue),
        maxUsage: maxUsage ? Number(maxUsage) : null,
        validFrom: new Date(validFrom),
        validUntil: validUntil ? new Date(validUntil) : null,
        isActive: isActive !== false,
        staffId: auth.context.adminUser.id,
      },
      include: { staff: { select: { name: true } } },
    });

    return NextResponse.json({ code: newCode }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint") &&
      error.message.includes("code")
    ) {
      return NextResponse.json({ error: "이미 존재하는 코드입니다." }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "등록 실패" },
      { status: 400 },
    );
  }
}
