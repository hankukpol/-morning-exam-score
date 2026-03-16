import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const prisma = getPrisma();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  // ── KPI ─────────────────────────────────────────────────────────────────────
  const [totalStudents, activeStudents, newThisMonth, inactiveCount] = await Promise.all([
    prisma.student.count(),
    prisma.student.count({ where: { isActive: true } }),
    prisma.student.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.student.count({ where: { isActive: false } }),
  ]);

  // ── examType distribution ────────────────────────────────────────────────────
  const examTypeRaw = await prisma.student.groupBy({
    by: ["examType"],
    _count: { examType: true },
  });
  const examTypeDistribution = examTypeRaw.map((r) => ({
    examType: r.examType as string,
    count: r._count.examType,
  }));

  // ── status distribution based on latest enrollment per student ───────────────
  // For each student, find their most recent enrollment and use its status.
  // We group by status across all "latest" enrollments.
  const latestEnrollments = await prisma.$queryRaw<
    { status: string; cnt: bigint }[]
  >`
    SELECT ce.status, COUNT(*) AS cnt
    FROM "CourseEnrollment" ce
    INNER JOIN (
      SELECT "examNumber", MAX("createdAt") AS max_created
      FROM "CourseEnrollment"
      GROUP BY "examNumber"
    ) latest ON ce."examNumber" = latest."examNumber"
      AND ce."createdAt" = latest.max_created
    GROUP BY ce.status
  `;
  const statusDistribution = latestEnrollments.map((r) => ({
    status: r.status,
    count: Number(r.cnt),
  }));

  // ── monthly new students (last 12 months) ────────────────────────────────────
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0);
  const monthlyRaw = await prisma.student.findMany({
    where: { createdAt: { gte: twelveMonthsAgo } },
    select: { createdAt: true },
  });

  const monthlyMap = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, 0);
  }
  for (const s of monthlyRaw) {
    const d = s.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthlyMap.has(key)) {
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1);
    }
  }
  const monthlyNewStudents = Array.from(monthlyMap.entries()).map(([month, count]) => ({
    month,
    count,
  }));

  // ── generation distribution ──────────────────────────────────────────────────
  const generationRaw = await prisma.student.groupBy({
    by: ["generation"],
    _count: { generation: true },
    where: { generation: { not: null } },
    orderBy: { generation: "asc" },
  });
  const gradeDistribution = generationRaw.map((r) => ({
    generation: r.generation !== null ? String(r.generation) : "미정",
    count: r._count.generation,
  }));

  return NextResponse.json({
    data: {
      kpi: { totalStudents, activeStudents, newThisMonth, inactiveCount },
      examTypeDistribution,
      statusDistribution,
      monthlyNewStudents,
      gradeDistribution,
    },
  });
}
