import { AdminRole, EnrollmentStatus } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { LedgerPrintButton } from "./ledger-print-button";

export const dynamic = "force-dynamic";

// ─── 상태 레이블 ───────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  PENDING: "대기",
  ACTIVE: "수강중",
  WAITING: "대기번호",
  SUSPENDED: "휴원",
  COMPLETED: "수료",
  WITHDRAWN: "퇴원",
  CANCELLED: "취소",
};

// ─── 유틸 ──────────────────────────────────────────────────────────────────────
function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function formatKorDate(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatMoney(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default async function EnrollmentLedgerPage({
  searchParams,
}: {
  searchParams: { cohortId?: string; status?: string; from?: string; to?: string };
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  // 기수 목록 (필터 드롭다운용)
  const cohorts = await prisma.cohort.findMany({
    where: { isActive: true },
    orderBy: { startDate: "desc" },
    take: 20,
  });

  // 필터 파싱
  const cohortId = searchParams.cohortId || "";
  const statusParam = searchParams.status as EnrollmentStatus | "" || "";
  const fromParam = searchParams.from || "";
  const toParam = searchParams.to || "";

  const fromDate = fromParam ? new Date(fromParam + "T00:00:00") : undefined;
  const toDate = toParam ? new Date(toParam + "T23:59:59") : undefined;

  // 수강 등록 조회
  const enrollments = await prisma.courseEnrollment.findMany({
    where: {
      ...(cohortId ? { cohortId } : {}),
      ...(statusParam ? { status: statusParam } : {}),
      ...((fromDate || toDate)
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    },
    include: {
      student: { select: { name: true, phone: true, examNumber: true } },
      cohort: { select: { name: true, startDate: true, endDate: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
      staff: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  // 필터 설명문 (인쇄용)
  const selectedCohort = cohorts.find((c) => c.id === cohortId);
  const filterDesc = [
    selectedCohort ? `기수: ${selectedCohort.name}` : "",
    statusParam ? `상태: ${STATUS_LABEL[statusParam]}` : "",
    fromParam || toParam
      ? `기간: ${fromParam || "~"} ~ ${toParam || "현재"}`
      : "",
  ]
    .filter(Boolean)
    .join("  |  ");

  const today = new Date();
  const printDate = formatKorDate(today);

  return (
    <div className="min-h-screen bg-[#F7F4EF]">
      {/* ── 인쇄 CSS ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          .ledger-page {
            width: 100% !important;
            margin: 0 !important;
            padding: 8mm !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          .ledger-table th,
          .ledger-table td {
            font-size: 9pt !important;
            padding: 3px 5px !important;
          }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>

      {/* ── 필터 바 (화면 전용) ── */}
      <div className="no-print border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <a
            href="/admin/enrollments"
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-gray-400"
          >
            ← 수강 목록
          </a>
          <span className="text-base font-semibold text-gray-800">수강대장</span>
          <LedgerPrintButton />
        </div>
      </div>

      <div className="no-print mx-auto max-w-7xl px-6 py-6">
        <form method="GET" className="flex flex-wrap items-end gap-4 rounded-[28px] bg-white p-6 shadow-sm">
          {/* 기수 선택 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">기수</label>
            <select
              name="cohortId"
              defaultValue={cohortId}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
            >
              <option value="">전체 기수</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* 상태 선택 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">수강 상태</label>
            <select
              name="status"
              defaultValue={statusParam}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
            >
              <option value="">전체 상태</option>
              {(Object.entries(STATUS_LABEL) as [EnrollmentStatus, string][]).map(
                ([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                )
              )}
            </select>
          </div>

          {/* 등록일 범위 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">등록일 (시작)</label>
            <input
              type="date"
              name="from"
              defaultValue={fromParam}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">등록일 (종료)</label>
            <input
              type="date"
              name="to"
              defaultValue={toParam}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
            />
          </div>

          <button
            type="submit"
            className="rounded-full bg-[#1F4D3A] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#173a2b]"
          >
            조회
          </button>
          {(cohortId || statusParam || fromParam || toParam) && (
            <a
              href="/admin/enrollments/ledger"
              className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-600 transition hover:border-gray-500"
            >
              초기화
            </a>
          )}
        </form>

        <p className="mt-3 text-right text-sm text-gray-500">
          조회 결과: <strong>{enrollments.length}건</strong>
          {enrollments.length === 500 && (
            <span className="ml-2 text-amber-600">(최대 500건 표시)</span>
          )}
        </p>
      </div>

      {/* ── 인쇄 영역 ── */}
      <div
        className="ledger-page mx-auto max-w-7xl px-6 pb-16"
        style={{
          fontFamily:
            "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
        }}
      >
        {/* 인쇄 헤더 */}
        <div className="mb-6 text-center">
          <div className="text-sm text-gray-500">한국경찰학원</div>
          <div
            className="mt-1 border-y border-gray-900 py-3 text-2xl font-bold tracking-[0.4em]"
          >
            수 강 대 장
          </div>
          <div className="mt-2 flex items-center justify-between text-sm text-gray-600">
            <span>{filterDesc || "전체 수강 등록 현황"}</span>
            <span>총 {enrollments.length}건</span>
            <span>출력일: {printDate}</span>
          </div>
        </div>

        {/* 수강대장 테이블 */}
        {enrollments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-20 text-center text-gray-400">
            조회된 수강 등록 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="ledger-table w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#1F4D3A] text-white">
                  <th className="whitespace-nowrap border border-[#1F4D3A] px-3 py-2.5 text-center font-semibold">
                    번호
                  </th>
                  <th className="whitespace-nowrap border border-[#1F4D3A] px-3 py-2.5 text-center font-semibold">
                    학번
                  </th>
                  <th className="whitespace-nowrap border border-[#1F4D3A] px-3 py-2.5 text-center font-semibold">
                    성명
                  </th>
                  <th className="whitespace-nowrap border border-[#1F4D3A] px-3 py-2.5 text-center font-semibold">
                    연락처
                  </th>
                  <th className="whitespace-nowrap border border-[#1F4D3A] px-3 py-2.5 text-center font-semibold">
                    강좌명
                  </th>
                  <th className="whitespace-nowrap border border-[#1F4D3A] px-3 py-2.5 text-center font-semibold">
                    수강시작
                  </th>
                  <th className="whitespace-nowrap border border-[#1F4D3A] px-3 py-2.5 text-center font-semibold">
                    수강종료
                  </th>
                  <th className="whitespace-nowrap border border-[#1F4D3A] px-3 py-2.5 text-center font-semibold">
                    수강료
                  </th>
                  <th className="whitespace-nowrap border border-[#1F4D3A] px-3 py-2.5 text-center font-semibold">
                    상태
                  </th>
                  <th className="whitespace-nowrap border border-[#1F4D3A] px-3 py-2.5 text-center font-semibold">
                    담당자
                  </th>
                  <th className="whitespace-nowrap border border-[#1F4D3A] px-3 py-2.5 text-center font-semibold">
                    비고
                  </th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enr, idx) => {
                  const courseName =
                    enr.cohort?.name ??
                    enr.specialLecture?.name ??
                    enr.product?.name ??
                    "-";
                  const isEven = idx % 2 === 0;
                  return (
                    <tr
                      key={enr.id}
                      className={isEven ? "bg-white" : "bg-gray-50"}
                    >
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-500">
                        {idx + 1}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center font-mono">
                        <a
                          href={`/admin/students/${enr.student.examNumber}`}
                          className="text-[#1F4D3A] underline underline-offset-2 hover:text-[#C55A11] no-print:cursor-pointer print:no-underline"
                        >
                          {enr.student.examNumber}
                        </a>
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center font-semibold">
                        <a
                          href={`/admin/students/${enr.student.examNumber}`}
                          className="text-gray-900 hover:text-[#C55A11] no-print:cursor-pointer"
                        >
                          {enr.student.name}
                        </a>
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center font-mono text-gray-600">
                        {enr.student.phone ?? "-"}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-gray-800">
                        {courseName}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-700">
                        {formatDate(enr.startDate)}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-700">
                        {enr.endDate ? formatDate(enr.endDate) : "-"}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-right text-gray-800">
                        {formatMoney(enr.finalFee)}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                            enr.status === "ACTIVE"
                              ? "bg-green-100 text-green-800"
                              : enr.status === "PENDING"
                              ? "bg-amber-100 text-amber-800"
                              : enr.status === "WAITING"
                              ? "bg-sky-100 text-sky-800"
                              : enr.status === "SUSPENDED"
                              ? "bg-purple-100 text-purple-800"
                              : enr.status === "COMPLETED"
                              ? "bg-gray-100 text-gray-700"
                              : enr.status === "WITHDRAWN"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {STATUS_LABEL[enr.status]}
                        </span>
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-600">
                        {enr.staff?.name ?? "-"}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-400">
                        {enr.isRe ? "재수강" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 서명란 (인쇄용) */}
        <div className="mt-10 border-t border-gray-300 pt-8">
          <p className="text-center text-sm text-gray-600">
            위 내용이 사실임을 확인합니다.
          </p>
          <p className="mt-1 text-center text-sm text-gray-500">{printDate}</p>
          <div className="mt-8 flex items-end justify-center gap-16">
            <div className="flex flex-col items-center gap-1">
              <div className="h-14 w-28 border-b border-gray-400" />
              <span className="text-sm text-gray-500">학원장 (인)</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="h-14 w-28 border-b border-gray-400" />
              <span className="text-sm text-gray-500">담당자 (인)</span>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-gray-400">
            한국경찰학원 · 대구광역시 중구 중앙대로 390 센트럴엠빌딩 · 053-241-0112
          </p>
        </div>
      </div>
    </div>
  );
}
