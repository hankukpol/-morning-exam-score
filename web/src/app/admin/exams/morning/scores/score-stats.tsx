"use client";

export interface ScoreDistribution {
  /** count in 90-100 bracket */
  s90: number;
  /** count in 80-89 bracket */
  s80: number;
  /** count in 70-79 bracket */
  s70: number;
  /** count in 60-69 bracket */
  s60: number;
  /** count below 60 */
  sBelow60: number;
}

interface DistributionBarProps {
  distribution: ScoreDistribution;
}

/** 5-bracket mini CSS bar strip (90+, 80-89, 70-79, 60-69, <60) */
export function DistributionBar({ distribution }: DistributionBarProps) {
  const { s90, s80, s70, s60, sBelow60 } = distribution;
  const total = s90 + s80 + s70 + s60 + sBelow60;

  if (total === 0) {
    return <span className="text-xs text-ink/25">—</span>;
  }

  const pct = (count: number) => Math.round((count / total) * 100);

  const segments = [
    { value: s90, color: "#1F4D3A", label: "90+", pct: pct(s90) },
    { value: s80, color: "#4ADE80", label: "80-89", pct: pct(s80) },
    { value: s70, color: "#FCD34D", label: "70-79", pct: pct(s70) },
    { value: s60, color: "#FB923C", label: "60-69", pct: pct(s60) },
    { value: sBelow60, color: "#C55A11", label: "<60", pct: pct(sBelow60) },
  ].filter((s) => s.value > 0);

  return (
    <div className="flex flex-col items-end gap-1">
      {/* bar */}
      <div
        className="flex h-2.5 w-20 overflow-hidden rounded-full"
        title={`90+:${s90}  80-89:${s80}  70-79:${s70}  60-69:${s60}  <60:${sBelow60}`}
      >
        {segments.map((seg) => (
          <div
            key={seg.label}
            style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}
            title={`${seg.label}: ${seg.value}명 (${seg.pct}%)`}
          />
        ))}
      </div>
      {/* legend (compact, 2 rows max) */}
      <div className="flex flex-wrap justify-end gap-x-2 gap-y-0.5">
        {segments.map((seg) => (
          <span key={seg.label} className="flex items-center gap-0.5 text-[10px] text-slate">
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            {seg.label}:{seg.value}
          </span>
        ))}
      </div>
    </div>
  );
}

interface DeltaBadgeProps {
  delta: number | null;
}

/** ▲/▼ delta badge vs previous same-subject session */
export function DeltaBadge({ delta }: DeltaBadgeProps) {
  if (delta === null) {
    return <span className="text-xs text-ink/25">—</span>;
  }

  const isUp = delta > 0;
  const isFlat = delta === 0;

  if (isFlat) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs font-semibold text-slate">
        ■ 0.0
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${
        isUp
          ? "border-forest/20 bg-forest/10 text-forest"
          : "border-ember/30 bg-ember/10 text-ember"
      }`}
    >
      {isUp ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}
    </span>
  );
}
