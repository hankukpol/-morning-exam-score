import { cache } from "react";
import { AdminRole, Prisma } from "@/generated/prisma";
import { redirect } from "next/navigation";
import { ROLE_LEVEL } from "@/lib/constants";
import { getSetupState } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export function roleAtLeast(role: AdminRole, minimum: AdminRole) {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[minimum];
}

const ADMIN_CONTEXT_QUERY_RETRY_DELAY_MS = 75;
const ADMIN_CONTEXT_QUERY_RETRY_COUNT = 2;

function isRetryableAdminContextError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P1017"
  );
}

async function findAdminUserWithRetry(id: string) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await getPrisma().adminUser.findUnique({
        where: { id },
      });
    } catch (error) {
      if (attempt >= ADMIN_CONTEXT_QUERY_RETRY_COUNT || !isRetryableAdminContextError(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, ADMIN_CONTEXT_QUERY_RETRY_DELAY_MS * (attempt + 1)));
    }
  }
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

  const adminUser = await findAdminUserWithRetry(user.id);

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