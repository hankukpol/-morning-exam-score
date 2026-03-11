import { cache } from "react";
import { AdminRole, Prisma } from "@/generated/prisma";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_LEVEL } from "@/lib/constants";
import { getSetupState } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

const AUTH_USER_ID_HEADER = "x-morning-auth-user-id";
const AUTH_USER_EMAIL_HEADER = "x-morning-auth-user-email";
const ADMIN_CONTEXT_QUERY_RETRY_DELAY_MS = 75;
const ADMIN_CONTEXT_QUERY_RETRY_COUNT = 2;

type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export function roleAtLeast(role: AdminRole, minimum: AdminRole) {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[minimum];
}

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

function readVerifiedAuthUserFromHeaders(): AuthenticatedUser | null {
  const headerStore = headers();
  const id = headerStore.get(AUTH_USER_ID_HEADER);

  if (!id) {
    return null;
  }

  const email = headerStore.get(AUTH_USER_EMAIL_HEADER);

  return {
    id,
    email: email?.trim() ? email : null,
  };
}

export const getCurrentAuthUser = cache(async () => {
  const setup = getSetupState();

  if (!setup.supabaseReady || !setup.databaseReady) {
    return null;
  }

  // Admin requests already pass through middleware auth verification.
  // Reuse that result to avoid a second Supabase roundtrip while rendering.
  const headerUser = readVerifiedAuthUserFromHeaders();

  if (headerUser) {
    return headerUser;
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
  } satisfies AuthenticatedUser;
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