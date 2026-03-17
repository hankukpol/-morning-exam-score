import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SUBJECT_LABELS: Record<string, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINOLOGY: "범죄학",
  CRIMINAL_PROCEDURE: "형사소송법",
  CRIMINAL_LAW: "형법",
  POLICE_SCIENCE: "경찰학",
  CUMULATIVE: "종합",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function TextbookDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;
  const textbookId = Number(id);
  if (!Number.isInteger(textbookId) || textbookId <= 0) notFound();

  const prisma = getPrisma();

  const textbook = await prisma.textbook.findUnique({ where: { id: textbookId } });
  if (!textbook) notFound();

  const [totalAgg, recentSales] = await prisma.$transaction([
    prisma.textbookSale.aggregate({
      where: { textbookId },
      _count: { id: true },
      _sum: { quantity: true, totalPrice: true },
    }),
    prisma.textbookSale.findMany({
      where: { textbookId },
      include: {
        staff: { select: { name: true } },
      },
      orderBy: { soldAt: "desc" },
      take: 20,
    }),
  ]);

  // Fetch student names for exam numbers present in recent sales
  const examNumbers = recentSales
    .map((s) => s.examNumber)
    .filter((n): n is string => n !== null);

  const uniqueExamNumbers = [...new Set(examNumbers)];

  const students =
    uniqueExamNumbers.length > 0
      ? await prisma.student.findMany({
          where: { examNumber: { in: uniqueExamNumbers } },
          select: { examNumber: true, name: true },
        })
      : [];

  const studentNameMap = new Map(students.map((s) => [s.examNumber, s.name]));

  const totalSaleCount = totalAgg._count.id;
  const totalSaleQty = totalAgg._sum.quantity ?? 0;
  const totalSaleAmount = totalAgg._sum.totalPrice ?? 0;

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate">
        <Link
          href="/admin/textbooks"
          className="transition hover:text-ink"
        >
          교재 관리
        </Link>
        <span>/</span>
        <span className="text-ink">{textbook.title}</span>
      </nav>

      {/* Header */}
      <div className="mt-6 flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            교재 상세
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-ink">{textbook.title}</h1>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate">
            {textbook.author && <span>저자: {textbook.author}</span>}
            {textbook.publisher && <span>출판사: {textbook.publisher}</span>}
            {textbook.subject && (
              <span>과목: {SUBJECT_LABELS[textbook.subject] ?? textbook.subject}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/admin/textbooks/${textbookId}/edit`}
            className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
          >
            수정
          </Link>
          <Link
            href="/admin/textbooks"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            ← 목록으로
          </Link>
        </div>
      </div>

      {/* Info card */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white shadow-panel p-6">
        <h2 className="text-base font-semibold text-ink">교재 정보</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-slate">과목</dt>
            <dd className="mt-1 text-sm text-ink">
              {textbook.subject
                ? (SUBJECT_LABELS[textbook.subject] ?? textbook.subject)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate">출판사</dt>
            <dd className="mt-1 text-sm text-ink">{textbook.publisher ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate">저자</dt>
            <dd className="mt-1 text-sm text-ink">{textbook.author ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate">판매가</dt>
            <dd className="mt-1 text-sm font-semibold text-ember">
              {textbook.price.toLocaleString()}원
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate">재고</dt>
            <dd className="mt-1 text-sm font-semibold">
              {textbook.stock === 0 ? (
                <span className="text-red-600">품절 (0개)</span>
              ) : textbook.stock <= 5 ? (
                <span className="text-amber-600">{textbook.stock}개 (부족)</span>
              ) : (
                <span className="text-ink">{textbook.stock}개</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate">활성 여부</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  textbook.isActive
                    ? "bg-forest/10 text-forest"
                    : "bg-ink/5 text-slate"
                }`}
              >
                {textbook.isActive ? "판매 중" : "판매 중단"}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {/* Sales summary card */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel p-6">
          <p className="text-xs font-medium text-slate">총 판매 건수</p>
          <p className="mt-2 text-3xl font-bold text-ink">{totalSaleCount}건</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel p-6">
          <p className="text-xs font-medium text-slate">총 판매 수량</p>
          <p className="mt-2 text-3xl font-bold text-ink">{totalSaleQty}권</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel p-6">
          <p className="text-xs font-medium text-slate">총 판매 금액</p>
          <p className="mt-2 text-3xl font-bold text-ember">
            {totalSaleAmount.toLocaleString()}원
          </p>
        </div>
      </div>

      {/* Recent sales table */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">최근 판매 내역</h2>
          <Link
            href={`/admin/textbooks/${textbookId}/sales`}
            className="text-sm font-medium text-ember transition hover:text-ember/80"
          >
            전체 판매 이력 보기 →
          </Link>
        </div>
        <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <table className="min-w-full divide-y divide-ink/8 text-sm">
            <thead>
              <tr className="bg-mist/50">
                {["판매일", "학번", "이름", "수량", "금액", "판매자"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {recentSales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-slate">
                    판매 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                recentSales.map((s) => (
                  <tr key={s.id} className="transition hover:bg-mist/30">
                    <td className="px-4 py-3 tabular-nums text-slate">
                      {new Date(s.soldAt).toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {s.examNumber ? (
                        <Link
                          href={`/admin/students/${s.examNumber}`}
                          className="font-medium text-ember hover:underline"
                        >
                          {s.examNumber}
                        </Link>
                      ) : (
                        <span className="text-slate/60">외부</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {s.examNumber
                        ? (studentNameMap.get(s.examNumber) ?? "—")
                        : <span className="text-slate/60">외부 구매</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink">
                      {s.quantity}권
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-ink">
                      {s.totalPrice.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3 text-slate">{s.staff.name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
