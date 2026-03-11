import { revalidateTag } from "next/cache";

export const CACHE_TAGS = {
  analyticsDataset: "analytics-dataset",
  analyticsResultsSheet: "analytics-results-sheet",
  periodsBasic: "periods-basic",
  periodWithSessions: "period-with-sessions",
} as const;

export function revalidateAnalyticsCaches() {
  revalidateTag(CACHE_TAGS.analyticsDataset);
  revalidateTag(CACHE_TAGS.analyticsResultsSheet);
}

export function revalidatePeriodCaches() {
  revalidateTag(CACHE_TAGS.periodsBasic);
  revalidateTag(CACHE_TAGS.periodWithSessions);
}

export function revalidateAdminReadCaches(options?: {
  analytics?: boolean;
  periods?: boolean;
}) {
  if (options?.analytics ?? true) {
    revalidateAnalyticsCaches();
  }

  if (options?.periods) {
    revalidatePeriodCaches();
  }
}