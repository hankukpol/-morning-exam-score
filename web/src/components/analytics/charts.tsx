"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Subject } from "@/generated/prisma";
import { SUBJECT_LABEL } from "@/lib/constants";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type NumericDatum = Record<string, number | string | null>;

type TrendLineChartProps = {
  data: NumericDatum[];
  xKey: string;
  lines: Array<{
    dataKey: string;
    color: string;
    name: string;
  }>;
};

type BarComparisonChartProps = {
  data: NumericDatum[];
  xKey: string;
  bars: Array<{
    dataKey: string;
    color: string;
    name: string;
  }>;
};

type RadarComparisonChartProps = {
  data: Array<{
    subject: Subject;
    studentAverage: number;
    cohortAverage: number;
    targetScore?: number;
  }>;
};

type DistributionChartProps = {
  data: Array<{
    range: string;
    count: number;
  }>;
};

type ChartSurfaceProps = {
  className: string;
  fallbackText: string;
  children: (size: { width: number; height: number }) => ReactNode;
};

function subjectTickFormatter(value: string) {
  return SUBJECT_LABEL[value as Subject] ?? value;
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-ink/10 text-sm text-slate">
      {message}
    </div>
  );
}

function ChartSurface({ className, fallbackText, children }: ChartSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const measure = () => {
      const width = Math.floor(node.clientWidth);
      const height = Math.floor(node.clientHeight);
      setSize((current) => {
        if (current.width === width && current.height === height) {
          return current;
        }
        return { width, height };
      });
    };

    measure();

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    window.addEventListener("resize", measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const isReady = size.width > 0 && size.height > 0;

  return (
    <div ref={containerRef} className={className}>
      {isReady ? children(size) : <EmptyChart message={fallbackText} />}
    </div>
  );
}

export function TrendLineChart({ data, xKey, lines }: TrendLineChartProps) {
  if (data.length === 0) {
    return <EmptyChart message="표시할 데이터가 없습니다." />;
  }

  return (
    <ChartSurface className="h-72" fallbackText="차트를 불러오는 중입니다.">
      {({ width, height }) => (
        <LineChart width={width} height={height} data={data} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#D6DCE5" />
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {lines.map((line) => (
            <Line
              key={line.dataKey}
              type="monotone"
              dataKey={line.dataKey}
              name={line.name}
              stroke={line.color}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      )}
    </ChartSurface>
  );
}

export function BarComparisonChart({
  data,
  xKey,
  bars,
}: BarComparisonChartProps) {
  if (data.length === 0) {
    return <EmptyChart message="표시할 데이터가 없습니다." />;
  }

  return (
    <ChartSurface className="h-72" fallbackText="차트를 불러오는 중입니다.">
      {({ width, height }) => (
        <BarChart width={width} height={height} data={data} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#D6DCE5" />
          <XAxis
            dataKey={xKey}
            tickFormatter={xKey === "subject" ? subjectTickFormatter : undefined}
            tick={{ fontSize: 12 }}
          />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {bars.map((bar) => (
            <Bar
              key={bar.dataKey}
              dataKey={bar.dataKey}
              name={bar.name}
              fill={bar.color}
              radius={[6, 6, 0, 0]}
            />
          ))}
        </BarChart>
      )}
    </ChartSurface>
  );
}

export function RadarComparisonChart({ data }: RadarComparisonChartProps) {
  if (data.length === 0) {
    return <EmptyChart message="표시할 데이터가 없습니다." />;
  }

  const chartData = data.map((row) => ({
    ...row,
    subjectLabel: SUBJECT_LABEL[row.subject],
  }));

  return (
    <ChartSurface className="h-80" fallbackText="차트를 불러오는 중입니다.">
      {({ width, height }) => (
        <RadarChart width={width} height={height} data={chartData}>
          <PolarGrid stroke="#D6DCE5" />
          <PolarAngleAxis dataKey="subjectLabel" tick={{ fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
          <Radar
            name="개인 평균"
            dataKey="studentAverage"
            stroke="#C2410C"
            fill="#FDBA74"
            fillOpacity={0.35}
          />
          <Radar
            name="전체 평균"
            dataKey="cohortAverage"
            stroke="#1D4ED8"
            fill="#93C5FD"
            fillOpacity={0.2}
          />
          {chartData.some((row) => Number(row.targetScore) > 0) ? (
            <Radar
              name="목표 점수"
              dataKey="targetScore"
              stroke="#475569"
              fillOpacity={0}
            />
          ) : null}
          <Legend />
          <Tooltip />
        </RadarChart>
      )}
    </ChartSurface>
  );
}

export function DistributionChart({ data }: DistributionChartProps) {
  if (data.length === 0) {
    return <EmptyChart message="표시할 데이터가 없습니다." />;
  }

  return (
    <ChartSurface className="h-72" fallbackText="차트를 불러오는 중입니다.">
      {({ width, height }) => (
        <BarChart width={width} height={height} data={data} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#D6DCE5" />
          <XAxis
            dataKey="range"
            tick={{ fontSize: 11 }}
            interval={1}
            angle={-35}
            textAnchor="end"
            height={56}
          />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" name="인원" fill="#0F766E" radius={[6, 6, 0, 0]} />
        </BarChart>
      )}
    </ChartSurface>
  );
}
