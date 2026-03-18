import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

const DEFAULTS = {
  refundApprovalThreshold: 200000,
  discountApprovalThreshold: 50000,
  cashApprovalThreshold: 100000,
} as const;

export async function GET(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const settings = await getPrisma().academySettings.findUnique({ where: { id: 1 } });

  return NextResponse.json({
    data: {
      refundApprovalThreshold:
        settings?.refundApprovalThreshold ?? DEFAULTS.refundApprovalThreshold,
      discountApprovalThreshold:
        settings?.discountApprovalThreshold ?? DEFAULTS.discountApprovalThreshold,
      cashApprovalThreshold:
        settings?.cashApprovalThreshold ?? DEFAULTS.cashApprovalThreshold,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.DIRECTOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await request.json()) as {
      refundApprovalThreshold?: unknown;
      discountApprovalThreshold?: unknown;
      cashApprovalThreshold?: unknown;
    };

    const refundApprovalThreshold = Number(body.refundApprovalThreshold);
    const discountApprovalThreshold = Number(body.discountApprovalThreshold);
    const cashApprovalThreshold = Number(body.cashApprovalThreshold);

    if (
      !Number.isInteger(refundApprovalThreshold) ||
      refundApprovalThreshold < 0 ||
      !Number.isInteger(discountApprovalThreshold) ||
      discountApprovalThreshold < 0 ||
      !Number.isInteger(cashApprovalThreshold) ||
      cashApprovalThreshold < 0
    ) {
      return NextResponse.json(
        { error: "금액은 0 이상의 정수여야 합니다." },
        { status: 400 },
      );
    }

    const updated = await getPrisma().academySettings.upsert({
      where: { id: 1 },
      update: {
        refundApprovalThreshold,
        discountApprovalThreshold,
        cashApprovalThreshold,
      },
      create: {
        id: 1,
        refundApprovalThreshold,
        discountApprovalThreshold,
        cashApprovalThreshold,
      },
    });

    return NextResponse.json({
      data: {
        refundApprovalThreshold: updated.refundApprovalThreshold,
        discountApprovalThreshold: updated.discountApprovalThreshold,
        cashApprovalThreshold: updated.cashApprovalThreshold,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "저장 실패" },
      { status: 400 },
    );
  }
}
