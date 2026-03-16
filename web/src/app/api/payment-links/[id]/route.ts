import { NextRequest, NextResponse } from "next/server";
import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

// GET /api/payment-links/[id] - get link by id (or token)
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Public endpoint — also used by /pay/[token]
  const { id } = params;
  const isToken = isNaN(Number(id));

  const link = await getPrisma().paymentLink.findFirst({
    where: isToken ? { token: id } : { id: Number(id) },
    include: {
      staff: { select: { name: true } },
      course: { select: { name: true, cohortStartDate: true, cohortEndDate: true } },
    },
  });

  if (!link) {
    return NextResponse.json({ error: "결제 링크를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    link: {
      ...link,
      expiresAt: link.expiresAt.toISOString(),
      createdAt: link.createdAt.toISOString(),
      updatedAt: link.updatedAt.toISOString(),
      course: link.course
        ? {
            ...link.course,
            cohortStartDate: link.course.cohortStartDate?.toISOString() ?? null,
            cohortEndDate: link.course.cohortEndDate?.toISOString() ?? null,
          }
        : null,
    },
  });
}

// PATCH /api/payment-links/[id] - update (disable, change expiry, etc.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = Number(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json();
  const { status, expiresAt, note } = body as {
    status?: "ACTIVE" | "DISABLED";
    expiresAt?: string;
    note?: string;
  };

  const link = await getPrisma().paymentLink.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
      ...(note !== undefined ? { note: note?.trim() ?? null } : {}),
    },
  });

  return NextResponse.json({
    link: {
      ...link,
      expiresAt: link.expiresAt.toISOString(),
      createdAt: link.createdAt.toISOString(),
      updatedAt: link.updatedAt.toISOString(),
    },
  });
}

// DELETE /api/payment-links/[id] - disable the link
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = Number(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  await getPrisma().paymentLink.update({
    where: { id },
    data: { status: "DISABLED" },
  });

  return NextResponse.json({ ok: true });
}
