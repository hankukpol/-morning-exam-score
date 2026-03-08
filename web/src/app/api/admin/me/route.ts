import { NextResponse } from "next/server";
import { getCurrentAdminContext } from "@/lib/auth";

export async function GET() {
  const context = await getCurrentAdminContext();

  if (!context) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: context.adminUser.id,
      email: context.adminUser.email,
      name: context.adminUser.name,
      role: context.adminUser.role,
    },
  });
}
