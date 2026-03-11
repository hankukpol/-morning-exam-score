import { PointType } from "@/generated/prisma";
import { toAuditJson } from "@/lib/audit";
import { getPointManagementData } from "@/lib/analytics/service";
import { getPrisma } from "@/lib/prisma";
import { revalidateAdminReadCaches } from "@/lib/cache-tags";

type GrantPointEntry = {
  examNumber: string;
  type: PointType;
  amount: number;
  reason: string;
  periodId?: number | null;
  year?: number | null;
  month?: number | null;
};

export async function listAttendancePointCandidates(input: {
  periodId: number;
  examType: "GONGCHAE" | "GYEONGCHAE";
  year: number;
  month: number;
}) {
  const data = await getPointManagementData(
    input.periodId,
    input.examType,
    input.year,
    input.month,
  );

  return data.candidates.filter(
    (candidate) =>
      candidate.monthSessionCount > 0 && candidate.perfectAttendance && !candidate.alreadyGranted,
  );
}

export async function grantPoints(input: {
  adminId: string;
  adminName: string;
  entries: GrantPointEntry[];
  ipAddress?: string | null;
}) {
  if (input.entries.length === 0) {
    throw new Error("吏湲됲븷 ?ъ씤????곸쓣 ?좏깮?섏꽭??");
  }

  const normalizedEntries = input.entries.map((entry) => {
    const examNumber = entry.examNumber.trim();
    const reason = entry.reason.trim();

    if (!examNumber) {
      throw new Error("?섑뿕踰덊샇媛 鍮꾩뼱 ?덉뒿?덈떎.");
    }

    if (!Number.isFinite(entry.amount) || entry.amount <= 0) {
      throw new Error("?ъ씤??湲덉븸? 1 ?댁긽?댁뼱???⑸땲??");
    }

    if (!reason) {
      throw new Error("吏湲??ъ쑀瑜??낅젰?섏꽭??");
    }

    return {
      ...entry,
      examNumber,
      reason,
    };
  });

  const result = await getPrisma().$transaction(async (tx) => {
    const created = [];
    const skipped = [];

    for (const entry of normalizedEntries) {
      const existing =
        entry.type === PointType.PERFECT_ATTENDANCE && entry.periodId && entry.year && entry.month
          ? await tx.pointLog.findFirst({
              where: {
                examNumber: entry.examNumber,
                type: entry.type,
                periodId: entry.periodId,
                year: entry.year,
                month: entry.month,
              },
            })
          : null;

      if (existing) {
        skipped.push({
          examNumber: entry.examNumber,
          type: entry.type,
          reason: "?대? ?숈씪 ??媛쒓렐 ?ъ씤?멸? 吏湲됰릺?덉뒿?덈떎.",
        });
        continue;
      }

      const log = await tx.pointLog.create({
        data: {
          examNumber: entry.examNumber,
          type: entry.type,
          amount: entry.amount,
          reason: entry.reason,
          periodId: entry.periodId ?? null,
          year: entry.year ?? null,
          month: entry.month ?? null,
          grantedBy: input.adminName,
        },
        include: {
          student: {
            select: {
              name: true,
            },
          },
        },
      });

      created.push(log);
    }

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "POINT_GRANT",
        targetType: "PointLog",
        targetId: created.map((log) => String(log.id)).join(",") || "SKIPPED",
        before: toAuditJson(null),
        after: toAuditJson({
          created,
          skipped,
        }),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
    };
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return result;
}