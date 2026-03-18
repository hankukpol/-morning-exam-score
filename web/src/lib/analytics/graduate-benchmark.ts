import { getPrisma } from "@/lib/prisma";
import { PassType } from "@prisma/client";

export type GraduateBenchmarkData = {
  totalGraduates: number;
  writtenPassCount: number;
  finalPassCount: number;
  appointedCount: number;
  passRate: number; // finalPass / total * 100
  avgEnrolledMonths: number;
  medianEnrolledMonths: number;
  subjectAverages: Record<string, number>; // subject -> avg score at time of pass
  monthlyPassCounts: Array<{ year: number; month: number; count: number; passType: string }>;
  enrolledMonthsDistribution: Array<{ months: string; count: number }>; // histogram
  recentGraduates: Array<{
    id: string;
    name: string;
    examNumber: string;
    examName: string;
    passType: PassType;
    enrolledMonths: number | null;
    passDate: string | null;
  }>;
};

function calcMedian(sortedArr: number[]): number {
  if (sortedArr.length === 0) return 0;
  const mid = Math.floor(sortedArr.length / 2);
  if (sortedArr.length % 2 === 0) {
    return ((sortedArr[mid - 1] ?? 0) + (sortedArr[mid] ?? 0)) / 2;
  }
  return sortedArr[mid] ?? 0;
}

export async function getGraduateBenchmarkData(): Promise<GraduateBenchmarkData> {
  const prisma = getPrisma();

  const records = await prisma.graduateRecord.findMany({
    include: {
      student: { select: { name: true } },
      scoreSnapshots: {
        select: {
          snapshotType: true,
          totalEnrolledMonths: true,
          subjectAverages: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Counts by passType
  const writtenPassCount = records.filter((r) => r.passType === PassType.WRITTEN_PASS).length;
  const finalPassCount = records.filter((r) => r.passType === PassType.FINAL_PASS).length;
  const appointedCount = records.filter((r) => r.passType === PassType.APPOINTED).length;
  const totalGraduates = records.length;
  const passRate =
    totalGraduates > 0
      ? Math.round(((finalPassCount + appointedCount) / totalGraduates) * 100)
      : 0;

  // Average and median enrolled months (from GraduateRecord.enrolledMonths)
  const monthsArr = records
    .map((r) => r.enrolledMonths)
    .filter((m): m is number => typeof m === "number");
  const sortedMonths = [...monthsArr].sort((a, b) => a - b);
  const avgEnrolledMonths =
    monthsArr.length > 0
      ? Math.round(monthsArr.reduce((s, m) => s + m, 0) / monthsArr.length)
      : 0;
  const medianEnrolledMonths = Math.round(calcMedian(sortedMonths));

  // Subject averages from snapshots (use FINAL_PASS or APPOINTED snapshots first, fallback all)
  const subjectSums: Record<string, { sum: number; count: number }> = {};
  for (const record of records) {
    // Prefer the snapshot matching the passType; fallback to any
    const snap =
      record.scoreSnapshots.find((s) => s.snapshotType === record.passType) ??
      record.scoreSnapshots[0];
    if (!snap) continue;
    const subj = snap.subjectAverages as Record<string, number>;
    for (const [subject, avg] of Object.entries(subj)) {
      if (typeof avg !== "number") continue;
      if (!subjectSums[subject]) subjectSums[subject] = { sum: 0, count: 0 };
      subjectSums[subject].sum += avg;
      subjectSums[subject].count += 1;
    }
  }
  const subjectAverages: Record<string, number> = {};
  for (const [subject, { sum, count }] of Object.entries(subjectSums)) {
    subjectAverages[subject] = Math.round((sum / count) * 10) / 10;
  }

  // Monthly pass counts by createdAt
  const monthlyMap: Record<string, Record<string, number>> = {};
  for (const record of records) {
    const d = record.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap[key]) monthlyMap[key] = {};
    const pt = record.passType as string;
    monthlyMap[key][pt] = (monthlyMap[key][pt] ?? 0) + 1;
  }
  const monthlyPassCounts: GraduateBenchmarkData["monthlyPassCounts"] = [];
  for (const [key, typeCounts] of Object.entries(monthlyMap)) {
    const [yearStr, monthStr] = key.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    for (const [passType, count] of Object.entries(typeCounts)) {
      monthlyPassCounts.push({ year, month, count, passType });
    }
  }
  monthlyPassCounts.sort((a, b) => a.year - b.year || a.month - b.month);

  // Histogram: enrolled months distribution
  const buckets: Array<{ months: string; count: number }> = [
    { months: "0~3개월", count: 0 },
    { months: "3~6개월", count: 0 },
    { months: "6~12개월", count: 0 },
    { months: "12~24개월", count: 0 },
    { months: "24개월+", count: 0 },
  ];
  for (const m of monthsArr) {
    if (m < 3) buckets[0].count += 1;
    else if (m < 6) buckets[1].count += 1;
    else if (m < 12) buckets[2].count += 1;
    else if (m < 24) buckets[3].count += 1;
    else buckets[4].count += 1;
  }

  // Recent graduates (last 20)
  const recentGraduates: GraduateBenchmarkData["recentGraduates"] = records.slice(0, 20).map((r) => {
    const passDate =
      r.finalPassDate?.toISOString() ??
      r.writtenPassDate?.toISOString() ??
      r.appointedDate?.toISOString() ??
      r.createdAt.toISOString();
    return {
      id: r.id,
      name: r.student.name,
      examNumber: r.examNumber,
      examName: r.examName,
      passType: r.passType,
      enrolledMonths: r.enrolledMonths,
      passDate: passDate.slice(0, 10),
    };
  });

  return {
    totalGraduates,
    writtenPassCount,
    finalPassCount,
    appointedCount,
    passRate,
    avgEnrolledMonths,
    medianEnrolledMonths,
    subjectAverages,
    monthlyPassCounts,
    enrolledMonthsDistribution: buckets,
    recentGraduates,
  };
}
