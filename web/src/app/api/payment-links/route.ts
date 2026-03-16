import { NextRequest, NextResponse } from "next/server";
import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

// GET /api/payment-links - list all payment links
export async function GET(req: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;

  const links = await getPrisma().paymentLink.findMany({
    where: status ? { status: status as "ACTIVE" | "EXPIRED" | "DISABLED" | "USED_UP" } : undefined,
    include: {
      staff: { select: { name: true } },
      course: { select: { name: true } },
      _count: { select: { payments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const serialized = links.map((link) => ({
    ...link,
    expiresAt: link.expiresAt.toISOString(),
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
    isExpired: link.expiresAt < now,
  }));

  return NextResponse.json({ links: serialized });
}

// POST /api/payment-links - create a new payment link
export async function POST(req: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const {
    title,
    courseId,
    amount,
    discountAmount = 0,
    allowPoint = true,
    expiresAt,
    maxUsage,
    note,
  } = body as {
    title: string;
    courseId?: number;
    amount: number;
    discountAmount?: number;
    allowPoint?: boolean;
    expiresAt: string;
    maxUsage?: number;
    note?: string;
  };

  if (!title?.trim()) {
    return NextResponse.json({ error: "제목을 입력해 주세요." }, { status: 400 });
  }
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "결제 금액을 입력해 주세요." }, { status: 400 });
  }
  if (!expiresAt) {
    return NextResponse.json({ error: "만료일을 입력해 주세요." }, { status: 400 });
  }

  const finalAmount = Math.max(0, amount - (discountAmount ?? 0));

  const link = await getPrisma().paymentLink.create({
    data: {
      title: title.trim(),
      courseId: courseId ?? null,
      amount,
      discountAmount: discountAmount ?? 0,
      finalAmount,
      allowPoint: allowPoint ?? true,
      expiresAt: new Date(expiresAt),
      maxUsage: maxUsage ?? null,
      note: note?.trim() ?? null,
      createdBy: auth.context.adminUser.id,
    },
  });

  return NextResponse.json(
    {
      link: {
        ...link,
        expiresAt: link.expiresAt.toISOString(),
        createdAt: link.createdAt.toISOString(),
        updatedAt: link.updatedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
