import { PointType, StudentStatus } from "@/generated/prisma";

export const STATUS_LABEL: Record<StudentStatus, string> = {
  NORMAL: "정상",
  WARNING_1: "1차 경고",
  WARNING_2: "2차 경고",
  DROPOUT: "탈락",
};

export const STATUS_BADGE_CLASS: Record<StudentStatus, string> = {
  NORMAL: "border-forest/20 bg-forest/10 text-forest",
  WARNING_1: "border-amber-200 bg-amber-50 text-amber-700",
  WARNING_2: "border-orange-200 bg-orange-50 text-orange-700",
  DROPOUT: "border-red-200 bg-red-50 text-red-700",
};

export const STATUS_ROW_CLASS: Record<StudentStatus, string> = {
  NORMAL: "",
  WARNING_1: "bg-amber-50/50",
  WARNING_2: "bg-orange-50/60",
  DROPOUT: "bg-red-50/70",
};

export const POINT_TYPE_LABEL: Record<PointType, string> = {
  PERFECT_ATTENDANCE: "개근 장학",
  SCORE_EXCELLENCE: "성적 우수",
  ESSAY_EXCELLENCE: "주관식 우수",
  MANUAL: "수동 지급",
};

export function formatMonthLabel(year: number, month: number) {
  return `${year}년 ${month}월`;
}

export function formatRank(value: number | null) {
  return value === null ? "-" : `${value}위`;
}

export function formatScore(value: number | null) {
  return value === null ? "-" : value.toFixed(2).replace(/\.00$/, "");
}

export function formatPoint(value: number) {
  return `${value.toLocaleString("ko-KR")}P`;
}

export function summarizeCountRecord(
  values: Record<string, number>,
  formatKey?: (key: string) => string,
) {
  const entries = Object.entries(values).sort(([left], [right]) => left.localeCompare(right));

  if (entries.length === 0) {
    return "-";
  }

  return entries
    .map(([key, value]) => `${formatKey ? formatKey(key) : key}: ${value}`)
    .join(" / ");
}
