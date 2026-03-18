import { AdminRole, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = {
  params: {
    examNumber: string;
  };
};

/**
 * PATCH /api/students/[examNumber]/contact
 * 비상연락처 / 주소 업데이트.
 * Body: {
 *   emergencyContactName?, emergencyContactPhone?, emergencyContactRelation?,
 *   address?, zipCode?,
 *   mobile?, email?, marketingConsent?   (기존 연락처 필드 — 선택)
 * }
 * Auth: COUNSELOR+
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { examNumber } = params;
    const body = (await request.json()) as Record<string, unknown>;

    // Build update data — only include keys that were actually sent
    const data: Prisma.StudentUpdateInput = {};

    // Emergency contact fields
    if ("emergencyContactName" in body) {
      data.emergencyContactName =
        typeof body.emergencyContactName === "string"
          ? body.emergencyContactName.trim() || null
          : null;
    }
    if ("emergencyContactPhone" in body) {
      data.emergencyContactPhone =
        typeof body.emergencyContactPhone === "string"
          ? body.emergencyContactPhone.trim() || null
          : null;
    }
    if ("emergencyContactRelation" in body) {
      data.emergencyContactRelation =
        typeof body.emergencyContactRelation === "string"
          ? body.emergencyContactRelation.trim() || null
          : null;
    }
    if ("address" in body) {
      data.address =
        typeof body.address === "string"
          ? body.address.trim() || null
          : null;
    }
    if ("zipCode" in body) {
      data.zipCode =
        typeof body.zipCode === "string"
          ? body.zipCode.trim() || null
          : null;
    }

    // Legacy contact fields (mobile / email / marketingConsent)
    if ("mobile" in body) {
      data.phone =
        typeof body.mobile === "string" ? body.mobile.trim() || null : null;
    }
    if ("email" in body) {
      // email is not stored on Student model currently — ignore silently
    }
    if ("marketingConsent" in body) {
      if (typeof body.marketingConsent === "boolean") {
        data.notificationConsent = body.marketingConsent;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
    }

    const prisma = getPrisma();
    const student = await prisma.student.update({
      where: { examNumber },
      data,
      select: {
        examNumber: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        emergencyContactRelation: true,
        address: true,
        zipCode: true,
      },
    });

    return NextResponse.json({ data: student });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "저장에 실패했습니다." },
      { status: 400 },
    );
  }
}
