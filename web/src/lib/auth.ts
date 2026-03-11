import { cache } from "react";
import { AdminRole } from "@/generated/prisma";
import { redirect } from "next/navigation";
import { ROLE_LEVEL } from "@/lib/constants";
import { getSetupState } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export function roleAtLeast(role: AdminRole, minimum: AdminRole) {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[minimum];
}

export const getCurrentAuthUser = cache(async () => {
  const setup = getSetupState();

  if (!setup.supabaseReady || !setup.databaseReady) {
    return null;
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return data.user;
});

export const getCurrentAdminContext = cache(async () => {
  const user = await getCurrentAuthUser();

  if (!user) {
    return null;
  }

  const adminUser = await getPrisma().adminUser.findUnique({
    where: { id: user.id },
  });

  if (!adminUser || !adminUser.isActive) {
    return null;
  }

  return {
    authUser: user,
    adminUser,
  };
});

export async function requireAdminContext(minRole: AdminRole = AdminRole.VIEWER) {
  const context = await getCurrentAdminContext();

  if (!context) {
    redirect("/login?error=unauthorized");
  }

  if (!roleAtLeast(context.adminUser.role, minRole)) {
    redirect("/admin?error=forbidden");
  }

  return context;
}