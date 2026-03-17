import { AdminRole, PointType } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PointsHistory } from "./points-history";

export const dynamic = "force-dynamic";

const POINT_TYPE_LABEL: Record<PointType, string> = {
  PERFECT_ATTENDANCE: "개근",
  SCORE_EXCELLENCE: "성적 우수",
  ESSAY_EXCELLENCE: "논술 우수",
  MANUAL: "수동 지급",
};

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function pick(params: PageProps["searchParams"], key: string): string | undefined {
  const v = params?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export type HistoryLogRow = {
  id: number;
  examNumber: string;
  studentName: string;
  type: PointType;
  amount: number;
  reason: string;
  grantedAt: string;
  grantedBy: string | null;
};

export default async function PointsHistoryPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const studentId = pick(searchParams, "studentId")?.trim();
  const typeParam = pick(searchParams, "type")?.trim();
  const from = pick(searchParams, "from")?.trim();
  const to = pick(searchParams, "to")?.trim();
  const page = Math.max(1, parseInt(pick(searchParams, "page") ?? "1", 10));
  const pageSize = 20;

  const validTypes = Object.values(PointType) as string[];
  const type = typeParam && validTypes.includes(typeParam) ? (typeParam as PointType) : undefined;

  const where = {
    ...(studentId ? { examNumber: studentId } : {}),
    ...(type ? { type } : {}),
    ...(from || to
      ? {
          grantedAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const [total, logs] = await Promise.all([
    prisma.pointLog.count({ where }),
    prisma.pointLog.findMany({
      where,
      orderBy: { grantedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { student: { select: { name: true } } },
    }),
  ]);

  const rows: HistoryLogRow[] = logs.map((log) => ({
    id: log.id,
    examNumber: log.examNumber,
    studentName: log.student.name,
    type: log.type,
    amount: log.amount,
    reason: log.reason,
    grantedAt: log.grantedAt.toISOString(),
    grantedBy: log.grantedBy,
  }));

  const pageCount = Math.ceil(total / pageSize);

  return (
    <div className="p-8 sm:p-10">
      <nav className="mb-6 flex items-center gap-2 text-xs text-slate">
        <Link href="/admin/points" className="hover:text-forest transition-colors">
          포인트 현황
        </Link>
        <span>/</span>
        <span className="text-ink">전체 이력</span>
      </nav>

      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        Points History
      </div>
      <h1 className="mt-5 text-3xl font-semibold">포인트 전체 이력</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        전체 포인트 지급·차감 이력을 검색하고 조회합니다.
      </p>

      <PointsHistory
        initialLogs={rows}
        total={total}
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        filters={{ studentId: studentId ?? "", type: typeParam ?? "", from: from ?? "", to: to ?? "" }}
        pointTypeLabelMap={POINT_TYPE_LABEL}
      />
    </div>
  );
}
