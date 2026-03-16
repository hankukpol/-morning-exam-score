import { AdminRole, CodeType, DiscountType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = Number(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  try {
    const body = await request.json();
    const { code, type, discountType, discountValue, maxUsage, validFrom, validUntil, isActive } =
      body;

    if (type && !Object.values(CodeType).includes(type)) {
      return NextResponse.json({ error: "유효하지 않은 코드 유형" }, { status: 400 });
    }
    if (discountType && !Object.values(DiscountType).includes(discountType)) {
      return NextResponse.json({ error: "유효하지 않은 할인 방식" }, { status: 400 });
    }

    const updated = await getPrisma().discountCode.update({
      where: { id },
      data: {
        ...(code !== undefined && { code: code.trim().toUpperCase() }),
        ...(type !== undefined && { type }),
        ...(discountType !== undefined && { discountType }),
        ...(discountValue !== undefined && { discountValue: Number(discountValue) }),
        ...(maxUsage !== undefined && { maxUsage: maxUsage ? Number(maxUsage) : null }),
        ...(validFrom !== undefined && { validFrom: new Date(validFrom) }),
        ...(validUntil !== undefined && { validUntil: validUntil ? new Date(validUntil) : null }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { staff: { select: { name: true } } },
    });

    return NextResponse.json({ code: updated });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint") &&
      error.message.includes("code")
    ) {
      return NextResponse.json({ error: "이미 존재하는 코드입니다." }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = Number(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  try {
    // Check if code has been used
    const usage = await getPrisma().discountCodeUsage.findFirst({ where: { codeId: id } });
    if (usage) {
      return NextResponse.json(
        { error: "이미 사용된 코드는 삭제할 수 없습니다. 비활성화를 사용하세요." },
        { status: 400 },
      );
    }

    await getPrisma().discountCode.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제 실패" },
      { status: 400 },
    );
  }
}
