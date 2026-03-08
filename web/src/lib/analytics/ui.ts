import { ExamType } from "@/generated/prisma";
import { listPeriods } from "@/lib/periods/service";

type SearchParamValue = string | string[] | undefined;
type SearchParams = Record<string, SearchParamValue>;
type PeriodRecord = Awaited<ReturnType<typeof listPeriods>>[number];

function pickFirst(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function readStringParam(searchParams: SearchParams | undefined, key: string) {
  return pickFirst(searchParams?.[key]);
}

export function readNumberParam(searchParams: SearchParams | undefined, key: string) {
  const value = readStringParam(searchParams, key);
  return value ? Number(value) : undefined;
}

export function readExamTypeParam(searchParams: SearchParams | undefined, key = "examType") {
  const value = readStringParam(searchParams, key);
  return value === ExamType.GYEONGCHAE ? ExamType.GYEONGCHAE : ExamType.GONGCHAE;
}

export async function getAnalyticsContext(searchParams?: SearchParams) {
  const periods = await listPeriods();
  const requestedPeriodId = readNumberParam(searchParams, "periodId");
  const activePeriod = periods.find((period) => period.isActive) ?? periods[0] ?? null;
  const selectedPeriod =
    periods.find((period) => period.id === requestedPeriodId) ?? activePeriod ?? null;
  const examType = readExamTypeParam(searchParams);

  return {
    periods,
    selectedPeriod,
    examType,
  };
}

export function getWeekOptions(period: PeriodRecord | null, examType: ExamType) {
  if (!period) {
    return [];
  }

  return Array.from(
    new Set(
      period.sessions
        .filter((session) => session.examType === examType)
        .map((session) => session.week),
    ),
  ).sort((left, right) => left - right);
}

export function getMonthOptions(period: PeriodRecord | null, examType: ExamType) {
  if (!period) {
    return [];
  }

  const monthKeys = new Map<string, { year: number; month: number }>();

  for (const session of period.sessions) {
    if (session.examType !== examType) {
      continue;
    }

    const year = session.examDate.getFullYear();
    const month = session.examDate.getMonth() + 1;
    monthKeys.set(`${year}-${month}`, { year, month });
  }

  return Array.from(monthKeys.values()).sort(
    (left, right) => left.year - right.year || left.month - right.month,
  );
}

export function buildHref(
  pathname: string,
  params: Record<string, string | number | boolean | null | undefined>,
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}
