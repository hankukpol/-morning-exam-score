import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";
import { getPrisma } from "@/lib/prisma";
import { PrintRosterButton } from "./print-roster-button";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "-";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function formatKorDate(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "재학",
  WAITING: "대기",
  SUSPENDED: "휴원",
  PENDING: "대기",
  COMPLETED: "수료",
  WITHDRAWN: "퇴원",
  CANCELLED: "취소",
};

export default async function CohortRosterPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { id } = await params;

  const cohort = await getPrisma().cohort.findUnique({
    where: { id },
    include: {
      enrollments: {
        where: {
          status: { in: ["ACTIVE", "WAITING", "SUSPENDED"] },
        },
        include: {
          student: {
            select: {
              examNumber: true,
              name: true,
              phone: true,
              generation: true,
            },
          },
        },
        orderBy: { examNumber: "asc" },
      },
    },
  });

  if (!cohort) notFound();

  const activeEnrollments = cohort.enrollments.filter(
    (e) => e.status === "ACTIVE" || e.status === "SUSPENDED",
  );
  const waitingEnrollments = cohort.enrollments.filter(
    (e) => e.status === "WAITING",
  );

  const examCategoryLabel =
    EXAM_CATEGORY_LABEL[cohort.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ??
    cohort.examCategory;

  const today = new Date();
  const printDate = formatKorDate(today);

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4 portrait; margin: 10mm; }
          body { background: white; }
          .print-area { padding: 0; }
        }
      `}</style>

      {/* No-print header */}
      <div className="no-print flex items-center justify-between border-b border-ink/10 bg-white px-6 py-3">
        <Link
          href={`/admin/settings/cohorts/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate transition hover:text-ink"
        >
          <span>&larr;</span>
          <span>기수 상세로</span>
        </Link>
        <PrintRosterButton />
      </div>

      {/* Print area */}
      <div className="print-area mx-auto max-w-[210mm] bg-white p-8">
        {/* Academy name */}
        <div className="text-center text-base font-semibold text-ink">
          한국경찰학원
        </div>

        {/* Title */}
        <h1 className="mt-1 text-center text-xl font-bold text-ink">
          {cohort.name} 수강생 명단
        </h1>

        {/* Info row */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-sm text-slate">
          <span>
            기간:{" "}
            <span className="font-medium text-ink">
              {formatDate(cohort.startDate)} ~ {formatDate(cohort.endDate)}
            </span>
          </span>
          <span className="text-slate/40">|</span>
          <span>
            시험:{" "}
            <span className="font-medium text-ink">{examCategoryLabel}</span>
          </span>
          {cohort.maxCapacity != null && (
            <>
              <span className="text-slate/40">|</span>
              <span>
                정원:{" "}
                <span className="font-medium text-ink">
                  {cohort.maxCapacity}명
                </span>
              </span>
            </>
          )}
          <span className="text-slate/40">|</span>
          <span>
            재적:{" "}
            <span className="font-medium text-ink">
              {activeEnrollments.length}명
            </span>
          </span>
        </div>

        {/* Print date */}
        <div className="mt-2 text-right text-xs text-slate">
          출력일: {printDate}
        </div>

        {/* Main roster table */}
        <table
          className="mt-4 w-full border-collapse text-sm"
          style={{ border: "1px solid black" }}
        >
          <thead>
            <tr className="bg-gray-100">
              <th
                className="px-2 py-1.5 text-center font-semibold"
                style={{ border: "1px solid black", width: "5%" }}
              >
                번호
              </th>
              <th
                className="px-2 py-1.5 text-center font-semibold"
                style={{ border: "1px solid black", width: "12%" }}
              >
                학번
              </th>
              <th
                className="px-2 py-1.5 text-center font-semibold"
                style={{ border: "1px solid black", width: "12%" }}
              >
                이름
              </th>
              <th
                className="px-2 py-1.5 text-center font-semibold"
                style={{ border: "1px solid black", width: "18%" }}
              >
                연락처
              </th>
              <th
                className="px-2 py-1.5 text-center font-semibold"
                style={{ border: "1px solid black", width: "8%" }}
              >
                상태
              </th>
              <th
                className="px-2 py-1.5 text-center font-semibold"
                style={{ border: "1px solid black" }}
              >
                비고 (서명란)
              </th>
            </tr>
          </thead>
          <tbody>
            {cohort.enrollments.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-slate"
                  style={{ border: "1px solid black" }}
                >
                  수강생이 없습니다.
                </td>
              </tr>
            ) : (
              cohort.enrollments.map((enrollment, idx) => (
                <tr key={enrollment.id} className={idx % 2 === 0 ? "" : "bg-gray-50"}>
                  <td
                    className="px-2 py-1 text-center"
                    style={{ border: "1px solid black" }}
                  >
                    {idx + 1}
                  </td>
                  <td
                    className="px-2 py-1 text-center font-mono text-xs"
                    style={{ border: "1px solid black" }}
                  >
                    {enrollment.student?.examNumber ?? enrollment.examNumber}
                  </td>
                  <td
                    className="px-2 py-1 text-center"
                    style={{ border: "1px solid black" }}
                  >
                    {enrollment.student?.name ?? "-"}
                  </td>
                  <td
                    className="px-2 py-1 text-center"
                    style={{ border: "1px solid black" }}
                  >
                    {formatPhone(enrollment.student?.phone)}
                  </td>
                  <td
                    className="px-2 py-1 text-center"
                    style={{ border: "1px solid black" }}
                  >
                    {STATUS_LABEL[enrollment.status] ?? enrollment.status}
                  </td>
                  <td
                    className="px-2 py-1"
                    style={{ border: "1px solid black", minWidth: "80px" }}
                  >
                    &nbsp;
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Waiting list (if any) */}
        {waitingEnrollments.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-ink">
              대기자 명단 ({waitingEnrollments.length}명)
            </h2>
            <table
              className="mt-2 w-full border-collapse text-sm"
              style={{ border: "1px solid black" }}
            >
              <thead>
                <tr className="bg-gray-100">
                  <th
                    className="px-2 py-1.5 text-center font-semibold"
                    style={{ border: "1px solid black", width: "8%" }}
                  >
                    순번
                  </th>
                  <th
                    className="px-2 py-1.5 text-center font-semibold"
                    style={{ border: "1px solid black", width: "12%" }}
                  >
                    학번
                  </th>
                  <th
                    className="px-2 py-1.5 text-center font-semibold"
                    style={{ border: "1px solid black", width: "12%" }}
                  >
                    이름
                  </th>
                  <th
                    className="px-2 py-1.5 text-center font-semibold"
                    style={{ border: "1px solid black", width: "18%" }}
                  >
                    연락처
                  </th>
                  <th
                    className="px-2 py-1.5 text-center font-semibold"
                    style={{ border: "1px solid black" }}
                  >
                    비고
                  </th>
                </tr>
              </thead>
              <tbody>
                {waitingEnrollments.map((enrollment, idx) => (
                  <tr key={enrollment.id}>
                    <td
                      className="px-2 py-1 text-center"
                      style={{ border: "1px solid black" }}
                    >
                      {enrollment.waitlistOrder ?? idx + 1}
                    </td>
                    <td
                      className="px-2 py-1 text-center font-mono text-xs"
                      style={{ border: "1px solid black" }}
                    >
                      {enrollment.student?.examNumber ?? enrollment.examNumber}
                    </td>
                    <td
                      className="px-2 py-1 text-center"
                      style={{ border: "1px solid black" }}
                    >
                      {enrollment.student?.name ?? "-"}
                    </td>
                    <td
                      className="px-2 py-1 text-center"
                      style={{ border: "1px solid black" }}
                    >
                      {formatPhone(enrollment.student?.phone)}
                    </td>
                    <td
                      className="px-2 py-1"
                      style={{ border: "1px solid black" }}
                    >
                      &nbsp;
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer signature line */}
        <div className="mt-8 flex items-end justify-end gap-4">
          <span className="text-sm">
            확인: _______________ (인)
          </span>
        </div>
      </div>
    </>
  );
}
