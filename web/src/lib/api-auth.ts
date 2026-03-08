import { AdminRole } from "@/generated/prisma";
import { getCurrentAdminContext, roleAtLeast } from "@/lib/auth";

export async function requireApiAdmin(minRole: AdminRole) {
  const context = await getCurrentAdminContext();

  if (!context) {
    return {
      ok: false as const,
      status: 401,
      error: "관리자 인증이 필요합니다.",
    };
  }

  if (!roleAtLeast(context.adminUser.role, minRole)) {
    return {
      ok: false as const,
      status: 403,
      error: "이 작업을 수행할 권한이 없습니다.",
    };
  }

  return {
    ok: true as const,
    context,
  };
}
