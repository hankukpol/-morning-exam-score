import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const settings = await getPrisma().academySettings.findUnique({ where: { id: 1 } });
  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const {
      name,
      directorName,
      businessRegNo,
      academyRegNo,
      address,
      phone,
      faxNumber,
      bankName,
      bankAccount,
      bankHolder,
      websiteUrl,
      documentIssuer,
      sealImagePath,
      logoImagePath,
    } = body;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {
      name: name?.trim() ?? "",
      directorName: directorName?.trim() ?? "",
      businessRegNo: businessRegNo?.trim() ?? "",
      academyRegNo: academyRegNo?.trim() ?? "",
      address: address?.trim() ?? "",
      phone: phone?.trim() ?? "",
      faxNumber: faxNumber?.trim() ?? "",
      bankName: bankName?.trim() ?? "",
      bankAccount: bankAccount?.trim() ?? "",
      bankHolder: bankHolder?.trim() ?? "",
      websiteUrl: websiteUrl?.trim() ?? "",
      documentIssuer: documentIssuer?.trim() ?? "",
      sealImagePath: sealImagePath?.trim() ?? "",
      logoImagePath: logoImagePath?.trim() ?? "",
    };

    const settings = await getPrisma().academySettings.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    });

    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "저장 실패" },
      { status: 400 },
    );
  }
}
