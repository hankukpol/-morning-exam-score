import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { TextbookSalesManagerFull } from "./textbook-sales-manager";

export const dynamic = "force-dynamic";

export type TextbookWithStats = {
  id: number;
  title: string;
  author: string | null;
  publisher: string | null;
  price: number;
  stock: number;
  subject: string | null;
  isActive: boolean;
  monthSaleCount: number;
  monthSaleQty: number;
  monthSaleAmount: number;
  totalSaleQty: number;
  totalSaleAmount: number;
};

export default async function TextbookSalesPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [textbooks, monthlySales, allTimeSales] = await prisma.$transaction([
    prisma.textbook.findMany({
      orderBy: [{ subject: "asc" }, { title: "asc" }],
    }),
    prisma.textbookSale.groupBy({
      by: ["textbookId"],
      where: { soldAt: { gte: monthStart, lte: monthEnd } },
      _count: { _all: true },
      _sum: { quantity: true, totalPrice: true },
      orderBy: { textbookId: "asc" },
    }),
    prisma.textbookSale.groupBy({
      by: ["textbookId"],
      _sum: { quantity: true, totalPrice: true },
      orderBy: { textbookId: "asc" },
    }),
  ]);

  const monthlyMap = new Map(
    monthlySales.map((s) => [
      s.textbookId,
      {
        count: (s._count as { _all?: number } | undefined)?._all ?? 0,
        qty: s._sum?.quantity ?? 0,
        amount: s._sum?.totalPrice ?? 0,
      },
    ]),
  );

  const allTimeMap = new Map(
    allTimeSales.map((s) => [
      s.textbookId,
      {
        qty: s._sum?.quantity ?? 0,
        amount: s._sum?.totalPrice ?? 0,
      },
    ]),
  );

  const textbooksWithStats: TextbookWithStats[] = textbooks.map((t) => {
    const monthly = monthlyMap.get(t.id);
    const allTime = allTimeMap.get(t.id);
    return {
      id: t.id,
      title: t.title,
      author: t.author,
      publisher: t.publisher,
      price: t.price,
      stock: t.stock,
      subject: t.subject,
      isActive: t.isActive,
      monthSaleCount: monthly?.count ?? 0,
      monthSaleQty: monthly?.qty ?? 0,
      monthSaleAmount: monthly?.amount ?? 0,
      totalSaleQty: allTime?.qty ?? 0,
      totalSaleAmount: allTime?.amount ?? 0,
    };
  });

  // KPI
  const totalCount = textbooks.length;
  const activeCount = textbooks.filter((t) => t.isActive).length;
  const monthSaleTotal = monthlySales.reduce((s, r) => s + ((r._count as { _all?: number } | undefined)?._all ?? 0), 0);
  const monthAmountTotal = monthlySales.reduce((s, r) => s + (r._sum?.totalPrice ?? 0), 0);
  const lowStockCount = textbooks.filter((t) => t.stock <= 5 && t.isActive).length;

  const yearLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        교재 판매 관리
      </div>
      <h1 className="mt-4 text-3xl font-semibold text-ink">교재 판매 현황</h1>
      <p className="mt-2 text-sm text-slate">
        교재 재고·판매 통계를 확인하고 현장 판매를 등록합니다.
      </p>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-medium text-slate">총 교재 수</p>
          <p className="mt-2 text-3xl font-bold text-ink">{totalCount}종</p>
          <p className="mt-1 text-xs text-slate">활성 {activeCount}종</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-medium text-slate">{yearLabel} 판매 건수</p>
          <p className="mt-2 text-3xl font-bold text-ink">{monthSaleTotal}건</p>
          <p className="mt-1 text-xs text-slate">
            {monthlySales.reduce((s, r) => s + (r._sum?.quantity ?? 0), 0)}권
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-medium text-slate">{yearLabel} 판매액</p>
          <p className="mt-2 text-3xl font-bold text-ember">
            {monthAmountTotal.toLocaleString()}원
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-medium text-slate">재고 부족 (5권 이하)</p>
          <p className={`mt-2 text-3xl font-bold ${lowStockCount > 0 ? "text-red-600" : "text-forest"}`}>
            {lowStockCount}종
          </p>
          <p className="mt-1 text-xs text-slate">즉시 발주 필요</p>
        </div>
      </div>

      <div className="mt-8">
        <TextbookSalesManagerFull
          textbooks={textbooksWithStats}
          yearLabel={yearLabel}
        />
      </div>
    </div>
  );
}
