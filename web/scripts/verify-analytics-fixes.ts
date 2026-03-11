import { readFileSync } from "node:fs";
import path from "node:path";
import { ExamType, ScoreSource, StudentStatus } from "../src/generated/prisma";
import { getStudentCumulativeAnalysis } from "../src/lib/analytics/analysis";
import { getDropoutMonitor, getWeeklyStatusHistory } from "../src/lib/analytics/service";
import { getPrisma } from "../src/lib/prisma";

function loadEnvFile(filePath: string) {
  try {
    const raw = readFileSync(filePath, "utf8");

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing env files.
  }
}

function loadLocalEnv() {
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, ".env"));
}

async function main() {
  loadLocalEnv();
  const prisma = getPrisma();

  const periodTargets = await prisma.examSession.findMany({
    select: {
      periodId: true,
      examType: true,
      period: {
        select: {
          name: true,
        },
      },
    },
    distinct: ["periodId", "examType"],
    orderBy: [{ periodId: "asc" }, { examType: "asc" }],
  });

  const monitorSummaries = [];
  for (const target of periodTargets) {
    const monitor = await getDropoutMonitor(target.periodId, target.examType);
    monitorSummaries.push({
      periodId: target.periodId,
      periodName: target.period.name,
      examType: target.examType,
      total: monitor.rows.length,
      dropout: monitor.rows.filter((row) => row.status === StudentStatus.DROPOUT).length,
      warning2: monitor.rows.filter((row) => row.status === StudentStatus.WARNING_2).length,
      warning1: monitor.rows.filter((row) => row.status === StudentStatus.WARNING_1).length,
    });
  }

  const sampleSnapshot = await prisma.weeklyStatusSnapshot.findFirst({
    where: {
      status: {
        in: [StudentStatus.DROPOUT, StudentStatus.WARNING_2, StudentStatus.WARNING_1],
      },
    },
    orderBy: [{ weekStartDate: "desc" }, { examNumber: "asc" }],
  });

  const weeklyHistory =
    sampleSnapshot
      ? await getWeeklyStatusHistory(
          sampleSnapshot.periodId,
          sampleSnapshot.examType,
          sampleSnapshot.weekKey,
        )
      : null;

  const sampleStudent =
    sampleSnapshot?.examNumber ??
    (
      await prisma.student.findFirst({
        where: {
          scores: {
            some: {},
          },
        },
        orderBy: { examNumber: "asc" },
        select: { examNumber: true },
      })
    )?.examNumber ??
    null;

  const cumulative = sampleStudent
    ? await getStudentCumulativeAnalysis(sampleStudent)
    : null;

  const migrationOxSummary = await prisma.score.aggregate({
    where: {
      sourceType: ScoreSource.MIGRATION,
      oxScore: {
        not: null,
      },
    },
    _count: {
      _all: true,
    },
  });

  const migrationOxSamples = await prisma.score.findMany({
    where: {
      sourceType: ScoreSource.MIGRATION,
      oxScore: {
        not: null,
      },
    },
    select: {
      examNumber: true,
      rawScore: true,
      oxScore: true,
      finalScore: true,
      session: {
        select: {
          subject: true,
          examDate: true,
        },
      },
    },
    orderBy: [{ session: { examDate: "desc" } }, { examNumber: "asc" }],
    take: 5,
  });

  console.log(
    JSON.stringify(
      {
        monitorSummaries,
        sampleWeeklyHistory: weeklyHistory
          ? {
              periodId: sampleSnapshot?.periodId ?? null,
              examType: sampleSnapshot?.examType ?? null,
              weekKey: sampleSnapshot?.weekKey ?? null,
              weekLabel: weeklyHistory.week.label,
              rowCount: weeklyHistory.rows.length,
              topRows: weeklyHistory.rows.slice(0, 5).map((row) => ({
                examNumber: row.examNumber,
                status: row.status,
                weekAbsenceCount: row.weekAbsenceCount,
                monthAbsenceCount: row.monthAbsenceCount,
                recoveryDate: row.recoveryDate?.toISOString() ?? null,
                dropoutReason: row.dropoutReason,
              })),
            }
          : null,
        sampleCumulative: cumulative
          ? {
              examNumber: cumulative.student.examNumber,
              totalSessions: cumulative.totalSessions,
              attendedCount: cumulative.attendedCount,
              attendanceRate: cumulative.attendanceRate,
              periodCount: cumulative.periods.length,
              statusHistoryCount: cumulative.statusHistory.length,
              weakSubjects: cumulative.weakSubjects,
              firstTrendRows: cumulative.trend.slice(0, 5).map((row) => ({
                label: row.label,
                subject: row.subject,
                finalScore: row.finalScore,
                periodName: row.periodName,
              })),
            }
          : null,
        migrationOxSummary: {
          totalRowsWithOx: migrationOxSummary._count._all,
          samples: migrationOxSamples.map((row) => ({
            examNumber: row.examNumber,
            subject: row.session.subject,
            examDate: row.session.examDate.toISOString(),
            rawScore: row.rawScore,
            oxScore: row.oxScore,
            finalScore: row.finalScore,
          })),
        },
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await getPrisma().$disconnect();
  } catch {
    // Ignore disconnect errors during shutdown.
  }
  process.exit(1);
});
