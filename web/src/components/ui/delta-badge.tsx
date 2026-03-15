"use client";

type DeltaBadgeProps = {
  current?: number | null;
  previous?: number | null;
  className?: string;
};

export function DeltaBadge({ current, previous, className = "" }: DeltaBadgeProps) {
  if (current === null || current === undefined || previous === null || previous === undefined) {
    return null;
  }

  const diff = Math.round((current - previous) * 10) / 10;
  const toneClass = diff > 0 ? "text-forest" : diff < 0 ? "text-red-600" : "text-slate";
  const label = Math.abs(diff) < 0.1 ? "—" : `${diff > 0 ? "▲" : "▼"}${Math.abs(diff).toFixed(1)}`;
  const ariaLabel =
    diff > 0
      ? `이전 대비 상승 ${Math.abs(diff).toFixed(1)}점`
      : diff < 0
        ? `이전 대비 하락 ${Math.abs(diff).toFixed(1)}점`
        : "이전 대비 변화 없음";

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${toneClass} ${className}`.trim()}
      role="status"
      aria-label={ariaLabel}
    >
      {label}
    </span>
  );
}
