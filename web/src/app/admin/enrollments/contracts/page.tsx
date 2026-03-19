import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

const COURSE_TYPE_LABEL: Record<string, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "단과 특강",
};

function formatDate(iso: Date | string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type SearchParams = {
  status?: string;
  courseType?: string;
  from?: string;
  to?: string;
  q?: string;
};

export default async function EnrollmentContractsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdminContext(AdminRole.COUNSELOR);
  const sp = await searchParams;

  const prisma = getPrisma();

  // Build dynamic filter
  const where: Record<string, unknown> = {};

  if (sp.status === "printed") {
    where.printedAt = { not: null };
  } else if (sp.status === "unprinted") {
    where.printedAt = null;
  }

  if (sp.from || sp.to) {
    where.issuedAt = {
      ...(sp.from ? { gte: new Date(sp.from) } : {}),
      ...(sp.to ? { lte: new Date(sp.to + "T23:59:59Z") } : {}),
    };
  }

  // Enrollment courseType filter needs a nested where
  const enrollmentWhere: Record<string, unknown> = {};
  if (sp.courseType) {
    enrollmentWhere.courseType = sp.courseType;
  }

  // Student search
  let examNumbers: string[] | null = null;
  if (sp.q) {
    const query = sp.q.trim();
    const students = await prisma.student.findMany({
      where: {
        OR: [
          { name: { contains: query } },
          { examNumber: { contains: query } },
        ],
      },
      select: { examNumber: true },
      take: 200,
    });
    examNumbers = students.map((s) => s.examNumber);
    enrollmentWhere.examNumber = { in: examNumbers };
  }

  if (Object.keys(enrollmentWhere).length > 0) {
    where.enrollment = enrollmentWhere;
  }

  const contracts = await prisma.courseContract.findMany({
    where,
    include: {
      enrollment: {
        include: {
          student: { select: { examNumber: true, name: true, phone: true } },
          cohort: { select: { name: true } },
          product: { select: { name: true } },
          specialLecture: { select: { name: true } },
        },
      },
      staff: { select: { name: true } },
    },
    orderBy: { issuedAt: "desc" },
    take: 500,
  });

  // KPI
  const thisMonthStart = new Date();
  thisMonthStart.setDate(1);
  thisMonthStart.setHours(0, 0, 0, 0);

  const totalCount = contracts.length;
  const printedCount = contracts.filter((c) => c.printedAt != null).length;
  const unprintedCount = totalCount - printedCount;
  const thisMonthCount = contracts.filter((c) => new Date(c.issuedAt) >= thisMonthStart).length;

  return (
    <div className="min-h-screen bg-[#F7F4EF] p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "수강 관리", href: "/admin/enrollments" },
          { label: "수강 계약서 허브" },
        ]}
      />

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="inline-flex rounded-full border border-[#1F4D3A]/20 bg-[#1F4D3A]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#1F4D3A]">
            수강 계약서
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-[#111827]">계약서 허브</h1>
          <p className="mt-1 text-sm text-[#4B5563]">
            발급된 모든 수강 계약서를 조회하고 출력 상태를 관리합니다.
          </p>
        </div>

        {/* CSV Export */}
        <a
          href={`/api/enrollments/contracts/export?${new URLSearchParams(
            Object.entries(sp).filter(([, v]) => v != null) as [string, string][],
          ).toString()}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
        >
          CSV 내보내기
        </a>
      </div>

      {/* KPI Cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "전체 계약서", value: totalCount, unit: "건", color: "text-[#111827]" },
          { label: "출력 완료", value: printedCount, unit: "건", color: "text-[#1F4D3A]" },
          { label: "미출력", value: unprintedCount, unit: "건", color: "text-amber-600" },
          { label: "이번달 신규", value: thisMonthCount, unit: "건", color: "text-[#C55A11]" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-[28px] border border-[#111827]/10 bg-white p-6 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-[#4B5563]">
              {kpi.label}
            </p>
            <p className={`mt-2 text-2xl font-bold ${kpi.color}`}>
              {kpi.value.toLocaleString()}
              <span className="ml-1 text-base font-normal text-[#4B5563]">{kpi.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <form method="GET" className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <input
            type="text"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="학생명 또는 학번 검색"
            className="w-56 rounded-2xl border border-[#111827]/10 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
          />

          {/* Status filter */}
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="rounded-2xl border border-[#111827]/10 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
          >
            <option value="">전체 상태</option>
            <option value="unprinted">미출력</option>
            <option value="printed">출력완료</option>
          </select>

          {/* Course type filter */}
          <select
            name="courseType"
            defaultValue={sp.courseType ?? ""}
            className="rounded-2xl border border-[#111827]/10 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
          >
            <option value="">전체 강좌유형</option>
            <option value="COMPREHENSIVE">종합반</option>
            <option value="SPECIAL_LECTURE">단과 특강</option>
          </select>

          {/* Date range */}
          <input
            type="date"
            name="from"
            defaultValue={sp.from ?? ""}
            className="rounded-2xl border border-[#111827]/10 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
          />
          <span className="text-sm text-[#4B5563]">~</span>
          <input
            type="date"
            name="to"
            defaultValue={sp.to ?? ""}
            className="rounded-2xl border border-[#111827]/10 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
          />

          <button
            type="submit"
            className="rounded-2xl bg-[#C55A11] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#C55A11]/90"
          >
            검색
          </button>

          {(sp.q || sp.status || sp.courseType || sp.from || sp.to) && (
            <Link
              href="/admin/enrollments/contracts"
              className="rounded-2xl border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
            >
              초기화
            </Link>
          )}
        </div>
      </form>

      {/* Contracts Table */}
      <section className="rounded-[28px] border border-[#111827]/10 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#111827]">
            계약서 목록{" "}
            <span className="text-base font-normal text-[#4B5563]">({totalCount}건)</span>
          </h2>
        </div>

        {contracts.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[#111827]/10 py-12 text-center text-sm text-[#4B5563]">
            <p className="font-medium">조회된 계약서가 없습니다.</p>
            <p className="mt-1 text-xs opacity-70">필터 조건을 조정해 보세요.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[20px] border border-[#111827]/10">
            <table className="min-w-full divide-y divide-[#111827]/10 text-sm">
              <thead className="bg-[#F7F4EF]/80 text-left">
                <tr>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">학생명</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">학번</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">강좌명</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">강좌유형</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">발급일</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">출력일</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">담당자</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#111827]/10 bg-white">
                {contracts.map((contract) => {
                  const { enrollment } = contract;
                  const courseName =
                    enrollment.cohort?.name ??
                    enrollment.product?.name ??
                    enrollment.specialLecture?.name ??
                    "-";
                  const isPrinted = contract.printedAt != null;

                  return (
                    <tr
                      key={contract.id}
                      className="cursor-pointer transition-colors hover:bg-[#F7F4EF]/60"
                    >
                      <td className="px-5 py-3.5 font-medium text-[#111827]">
                        <Link
                          href={`/admin/students/${enrollment.student.examNumber}`}
                          className="hover:text-[#C55A11] transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {enrollment.student.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">
                        {enrollment.student.examNumber}
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">{courseName}</td>
                      <td className="px-5 py-3.5 text-[#4B5563]">
                        {COURSE_TYPE_LABEL[enrollment.courseType] ?? enrollment.courseType}
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">
                        {formatDate(contract.issuedAt)}
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">
                        {formatDate(contract.printedAt)}
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">
                        {contract.staff.name}
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/enrollments/${enrollment.id}/contract`}
                          className="inline-flex"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isPrinted ? (
                            <span className="inline-flex rounded-full border border-[#1F4D3A]/20 bg-[#1F4D3A]/10 px-2.5 py-0.5 text-xs font-semibold text-[#1F4D3A] hover:bg-[#1F4D3A]/20 transition-colors">
                              출력완료
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors">
                              미출력
                            </span>
                          )}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
