const requiredSupabaseKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const requiredDatabaseKeys = ["DATABASE_URL", "DIRECT_URL"] as const;

const requiredNotificationKeys = [
  "SOLAPI_API_KEY",
  "SOLAPI_API_SECRET",
  "SOLAPI_SENDER",
  "SOLAPI_PF_ID",
  "SOLAPI_TEMPLATE_WARNING_1",
  "SOLAPI_TEMPLATE_WARNING_2",
  "SOLAPI_TEMPLATE_DROPOUT",
] as const;

export function hasSupabaseConfig() {
  return requiredSupabaseKeys.every((key) => Boolean(process.env[key]));
}

export function hasDatabaseConfig() {
  return requiredDatabaseKeys.every((key) => Boolean(process.env[key]));
}

export function hasServiceRoleConfig() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function hasNotificationConfig() {
  return requiredNotificationKeys.every((key) => Boolean(process.env[key]));
}

export function getMissingEnvKeys() {
  return [...requiredSupabaseKeys, ...requiredDatabaseKeys].filter(
    (key) => !process.env[key],
  );
}

export function getMissingNotificationEnvKeys() {
  return requiredNotificationKeys.filter((key) => !process.env[key]);
}

export function getSetupState() {
  return {
    supabaseReady: hasSupabaseConfig(),
    databaseReady: hasDatabaseConfig(),
    serviceRoleReady: hasServiceRoleConfig(),
    notificationReady: hasNotificationConfig(),
    missingKeys: getMissingEnvKeys(),
    missingNotificationKeys: getMissingNotificationEnvKeys(),
  };
}
