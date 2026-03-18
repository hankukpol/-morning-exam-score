import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseMonthParam(param: string | null): { year: number; month: number } | null {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  return null;
}

const CODE_TYPE_LABEL: Record<string, string> = {
  REFERRAL: "추천인",
  ENROLLMENT: "입소",
  CAMPAIGN: "캠페인",
};

const DISCOUNT_TYPE_LABEL: Record<string, string> = {
  RATE: "퍼센트",
  FIXED: "고정액",
};

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const monthParsed = parseMonthParam(sp.get("month"));

  const prisma = getPrisma();

  // 날짜 범위
  let dateFilter: { gte?: Date; lte?: Date } | undefined;
  if (monthParsed) {
    const { year, month } = monthParsed;
    dateFilter = {
      gte: new Date(year, month - 1, 1, 0, 0, 0, 0),
      lte: new Date(year, month, 0, 23, 59, 59, 999),
    };
  }

  // 모든 할인 코드 조회
  const allCodes = await prisma.discountCode.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      code: true,
      type: true,
      discountType: true,
      discountValue: true,
      maxUsage: true,
      usageCount: true,
      validFrom: true,
      validUntil: true,
      isActive: true,
      createdAt: true,
    },
  });

  // 사용 이력 조회 (날짜 필터 적용)
  const usages = await prisma.discountCodeUsage.findMany({
    where: {
      ...(dateFilter ? { usedAt: dateFilter } : {}),
    },
    select: {
      codeId: true,
      usedAt: true,
      payment: { select: { discountAmount: true } },
    },
    orderBy: { usedAt: "desc" },
  });

  // 코드별 집계
  const codeStatsMap = new Map<
    number,
    {
      usageCount: number;
      totalDiscountAmount: number;
      lastUsedAt: Date | null;
    }
  >();

  for (const u of usages) {
    const prev = codeStatsMap.get(u.codeId) ?? {
      usageCount: 0,
      totalDiscountAmount: 0,
      lastUsedAt: null,
    };
    codeStatsMap.set(u.codeId, {
      usageCount: prev.usageCount + 1,
      totalDiscountAmount:
        prev.totalDiscountAmount + (u.payment?.discountAmount ?? 0),
      lastUsedAt:
        prev.lastUsedAt === null || u.usedAt > prev.lastUsedAt
          ? u.usedAt
          : prev.lastUsedAt,
    });
  }

  // 결과 조합 및 정렬 (사용 수 내림차순)
  const codes = allCodes
    .map((c) => {
      const stats = codeStatsMap.get(c.id) ?? {
        usageCount: 0,
        totalDiscountAmount: 0,
        lastUsedAt: null,
      };
      const usageRate =
        c.maxUsage && c.maxUsage > 0
          ? Math.round((stats.usageCount / c.maxUsage) * 1000) / 10
          : null;

      return {
        id: c.id,
        code: c.code,
        type: c.type,
        typeLabel: CODE_TYPE_LABEL[c.type] ?? c.type,
        discountType: c.discountType,
        discountTypeLabel: DISCOUNT_TYPE_LABEL[c.discountType] ?? c.discountType,
        discountValue: c.discountValue,
        maxUsage: c.maxUsage,
        isActive: c.isActive,
        validFrom: c.validFrom.toISOString(),
        validUntil: c.validUntil ? c.validUntil.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
        // 필터 적용된 기간 통계
        filteredUsageCount: stats.usageCount,
        filteredTotalDiscountAmount: stats.totalDiscountAmount,
        filteredLastUsedAt: stats.lastUsedAt ? stats.lastUsedAt.toISOString() : null,
        usageRate,
        // 전체 누적 사용 수 (DB 필드)
        totalUsageCount: c.usageCount,
      };
    })
    .sort((a, b) => b.filteredUsageCount - a.filteredUsageCount);

  // 요약 통계
  const totalIssued = allCodes.length;
  const totalUsed = codes.filter((c) => c.filteredUsageCount > 0).length;
  const totalDiscountAmount = codes.reduce(
    (sum, c) => sum + c.filteredTotalDiscountAmount,
    0,
  );
  const totalUsageCount = codes.reduce((sum, c) => sum + c.filteredUsageCount, 0);
  const avgDiscountRate =
    totalUsageCount > 0
      ? Math.round((totalDiscountAmount / totalUsageCount / 100) * 10) / 10
      : null;

  return NextResponse.json({
    data: {
      month: monthParsed
        ? `${monthParsed.year}-${String(monthParsed.month).padStart(2, "0")}`
        : null,
      codes,
      summary: {
        totalIssued,
        totalUsed,
        totalDiscountAmount,
        totalUsageCount,
        avgDiscountRate,
      },
    },
  });
}
