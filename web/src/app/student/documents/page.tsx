import Link from "next/link";
import { CourseType, EnrollmentStatus, PaymentStatus } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { PrintCertButton } from "./print-cert-button";

export const dynamic = "force-dynamic";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatKoreanDate(date: Date | null | undefined): string {
  if (!date) return "-";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}년 ${m}월 ${d}일`;
}

function formatKoreanDateRange(
  start: Date | null | undefined,
  end: Date | null | undefined,
): string {
  if (!start) return "-";
  return end
    ? `${formatKoreanDate(start)} ~ ${formatKoreanDate(end)}`
    : `${formatKoreanDate(start)} ~`;
}

const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  PENDING: "대기 중",
  ACTIVE: "수강 중",
  WAITING: "대기자",
  SUSPENDED: "휴원",
  COMPLETED: "수강 완료",
  WITHDRAWN: "자퇴",
  CANCELLED: "취소",
};

const ENROLLMENT_STATUS_COLOR: Record<EnrollmentStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  ACTIVE: "border-forest/20 bg-forest/10 text-forest",
  WAITING: "border-sky-200 bg-sky-50 text-sky-700",
  SUSPENDED: "border-orange-200 bg-orange-50 text-orange-700",
  COMPLETED: "border-ink/10 bg-mist text-slate",
  WITHDRAWN: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-ink/10 bg-mist text-slate",
};

const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강",
};

// ─── Sub-components ─────────────────────────────────────────────────────────

function Row({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-[16px] border border-ink/10 bg-mist/60 px-4 py-3">
      <span className="text-sm text-slate">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? "text-ember" : "text-ink"}`}>
        {value}
      </span>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function StudentDocumentsPage() {
  // DB 없는 환경 처리
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              증명서 발급 준비 중
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              증명서 발급은 DB 연결 후 사용할 수 있습니다.
            </h1>
          </section>
        </div>
      </main>
    );
  }

  // 로그인 확인
  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              증명서 발급
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              증명서 발급은 로그인 후 이용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              학번과 이름으로 로그인하면 수강확인서와 납부확인서를 출력할 수 있습니다.
            </p>
          </section>

          <StudentLookupForm redirectPath="/student/documents" />
        </div>
      </main>
    );
  }

  const prisma = getPrisma();
  const today = formatKoreanDate(new Date());

  // 수강 내역 조회 (ACTIVE, COMPLETED)
  const enrollments = await prisma.courseEnrollment.findMany({
    where: {
      examNumber: viewer.examNumber,
      status: { in: ["ACTIVE", "COMPLETED"] },
    },
    orderBy: { createdAt: "desc" },
    include: {
      cohort: {
        select: { name: true, startDate: true, endDate: true },
      },
      specialLecture: {
        select: { name: true, startDate: true, endDate: true },
      },
      product: {
        select: { name: true },
      },
    },
  });

  // 각 수강별 수납 내역 조회
  type PaymentRow = {
    id: string;
    netAmount: number;
    status: PaymentStatus;
    processedAt: Date;
  };
  type EnrollmentPayments = Record<string, PaymentRow[]>;

  let enrollmentPayments: EnrollmentPayments = {};

  if (enrollments.length > 0) {
    const enrollmentIds = enrollments.map((e) => e.id);
    const payments = await prisma.payment.findMany({
      where: {
        enrollmentId: { in: enrollmentIds },
        status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
      },
      select: {
        id: true,
        enrollmentId: true,
        netAmount: true,
        status: true,
        processedAt: true,
      },
      orderBy: { processedAt: "asc" },
    });

    for (const p of payments) {
      if (!p.enrollmentId) continue;
      if (!enrollmentPayments[p.enrollmentId]) {
        enrollmentPayments[p.enrollmentId] = [];
      }
      enrollmentPayments[p.enrollmentId].push({
        id: p.id,
        netAmount: p.netAmount,
        status: p.status,
        processedAt: p.processedAt,
      });
    }
  }

  // 수강명 계산 헬퍼
  function getCourseName(
    enrollment: (typeof enrollments)[number],
  ): string {
    if (enrollment.courseType === CourseType.SPECIAL_LECTURE) {
      return enrollment.specialLecture?.name ?? "특강";
    }
    return enrollment.cohort?.name ?? enrollment.product?.name ?? "종합반";
  }

  // 수강기간 계산 헬퍼
  function getCoursePeriod(
    enrollment: (typeof enrollments)[number],
  ): string {
    const start =
      enrollment.startDate ??
      enrollment.cohort?.startDate ??
      enrollment.specialLecture?.startDate;
    const end =
      enrollment.endDate ??
      enrollment.cohort?.endDate ??
      enrollment.specialLecture?.endDate;
    return formatKoreanDateRange(start, end);
  }

  return (
    <>
      {/* 인쇄 전용 CSS */}
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              .no-print { display: none !important; }
              .printable-cert { display: none !important; }
              .print-show { display: block !important; }
              body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
              @page { size: A4 portrait; margin: 15mm; }
            }
          `,
        }}
      />

      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-6">

          {/* 뒤로 가기 + 헤더 */}
          <div className="no-print">
            <Link
              href="/student"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate transition hover:text-ink"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
                  clipRule="evenodd"
                />
              </svg>
              학생 포털 홈
            </Link>

            <div className="mt-4">
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                증명서 발급
              </div>
              <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">증명서 발급</h1>
              <p className="mt-1 text-sm text-slate">
                수강확인서 및 납부확인서를 출력할 수 있습니다.
              </p>
            </div>
          </div>

          {/* 수강 없는 경우 */}
          {enrollments.length === 0 ? (
            <section className="rounded-[28px] border border-ink/10 bg-white p-8 no-print text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-mist">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="h-7 w-7 text-slate"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
              </div>
              <p className="text-base font-semibold text-ink">발급 가능한 증명서가 없습니다</p>
              <p className="mt-2 text-sm text-slate">
                수강 이력이 없거나 아직 등록이 완료되지 않았습니다.
              </p>
              <p className="mt-1 text-sm text-slate">
                문의: <a href="tel:053-241-0112" className="font-semibold text-ember">053-241-0112</a>
              </p>
            </section>
          ) : (
            <>
              {enrollments.map((enrollment, idx) => {
                const courseName = getCourseName(enrollment);
                const coursePeriod = getCoursePeriod(enrollment);
                const payments = enrollmentPayments[enrollment.id] ?? [];
                const totalPaid = payments.reduce((sum, p) => sum + p.netAmount, 0);
                const enrollCertClass = `enrollment-cert-${idx}`;
                const paymentCertClass = `payment-cert-${idx}`;

                return (
                  <div key={enrollment.id} className="space-y-4">
                    {/* 강좌 구분선 (두 번째부터) */}
                    {idx > 0 && (
                      <div className="flex items-center gap-3 no-print">
                        <div className="h-px flex-1 bg-ink/10" />
                        <span className="text-xs font-semibold text-slate">
                          이전 수강 내역
                        </span>
                        <div className="h-px flex-1 bg-ink/10" />
                      </div>
                    )}

                    {/* ── 수강확인서 ── */}
                    <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm sm:p-8">
                      {/* 화면 표시용 헤더 */}
                      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 no-print">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                            Enrollment Certificate
                          </p>
                          <h2 className="mt-1 text-xl font-semibold">수강확인서</h2>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ENROLLMENT_STATUS_COLOR[enrollment.status]}`}
                          >
                            {ENROLLMENT_STATUS_LABEL[enrollment.status]}
                          </span>
                          <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-slate">
                            {COURSE_TYPE_LABEL[enrollment.courseType]}
                          </span>
                        </div>
                      </div>

                      {/* 화면에서 보이는 데이터 (no-print) */}
                      <div className="no-print space-y-3">
                        <Row label="학번" value={viewer.examNumber} />
                        <Row label="이름" value={viewer.name} />
                        <Row label="강좌명" value={courseName} />
                        <Row label="수강기간" value={coursePeriod} />
                        <Row
                          label="수강료 (확정)"
                          value={formatAmount(enrollment.finalFee)}
                          highlight
                        />
                        <Row
                          label="등록일"
                          value={formatKoreanDate(enrollment.createdAt)}
                        />
                      </div>

                      {/* 인쇄 버튼 */}
                      <div className="mt-5 no-print">
                        <PrintCertButton certClass={enrollCertClass} label="수강확인서 인쇄" />
                      </div>

                      {/* 인쇄 영역 */}
                      <div className={`printable-cert ${enrollCertClass}`}>
                        <div className="mb-8 text-center">
                          <p className="text-xs text-slate">한국경찰학원</p>
                          <h1 className="mt-2 text-2xl font-bold tracking-widest">수 강 확 인 서</h1>
                          <p className="mt-1 text-xs text-slate">발급일 {today}</p>
                        </div>

                        <table className="w-full border-collapse text-sm">
                          <tbody>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                학번
                              </th>
                              <td className="px-4 py-3 text-ink">{viewer.examNumber}</td>
                            </tr>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                이름
                              </th>
                              <td className="px-4 py-3 text-ink">{viewer.name}</td>
                            </tr>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                강좌명
                              </th>
                              <td className="px-4 py-3 text-ink">{courseName}</td>
                            </tr>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                수강기간
                              </th>
                              <td className="px-4 py-3 text-ink">{coursePeriod}</td>
                            </tr>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                등록일
                              </th>
                              <td className="px-4 py-3 text-ink">
                                {formatKoreanDate(enrollment.createdAt)}
                              </td>
                            </tr>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                수강료 (납부완료)
                              </th>
                              <td className="px-4 py-3 font-semibold text-ink">
                                {formatAmount(enrollment.finalFee)}
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        <p className="mt-8 text-center text-sm text-slate">
                          위와 같이 수강하였음을 확인합니다.
                        </p>
                        <p className="mt-6 text-center text-sm font-semibold text-ink">
                          한국경찰학원
                        </p>
                        <p className="mt-1 text-center text-xs text-slate">
                          대구광역시 중구 중앙대로 390 센트럴엠빌딩 · 053-241-0112
                        </p>
                      </div>
                    </section>

                    {/* ── 납부확인서 ── */}
                    <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm sm:p-8">
                      {/* 화면 표시용 헤더 */}
                      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 no-print">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                            Payment Confirmation
                          </p>
                          <h2 className="mt-1 text-xl font-semibold">납부확인서</h2>
                        </div>
                      </div>

                      {/* 화면에서 보이는 데이터 (no-print) */}
                      <div className="no-print space-y-3">
                        <Row label="강좌명" value={courseName} />
                        {payments.length === 0 ? (
                          <div className="rounded-[16px] border border-dashed border-ink/10 px-4 py-5 text-center text-sm text-slate">
                            등록된 납부 내역이 없습니다.
                          </div>
                        ) : (
                          <>
                            {payments.map((payment, pIdx) => (
                              <div
                                key={payment.id}
                                className="flex items-center justify-between rounded-[16px] border border-ink/10 bg-mist/60 px-4 py-3"
                              >
                                <span className="text-sm text-slate">
                                  {pIdx + 1}차 납부{" "}
                                  <span className="ml-1 text-xs text-slate/70">
                                    ({formatKoreanDate(payment.processedAt)})
                                  </span>
                                </span>
                                <span className="text-sm font-semibold text-ink">
                                  {formatAmount(payment.netAmount)}
                                </span>
                              </div>
                            ))}
                            <div className="flex items-center justify-between rounded-[16px] border border-forest/20 bg-forest/5 px-4 py-3">
                              <span className="text-sm font-semibold text-forest">합계 납부액</span>
                              <span className="text-sm font-bold text-forest">
                                {formatAmount(totalPaid)}
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* 인쇄 버튼 */}
                      {payments.length > 0 && (
                        <div className="mt-5 no-print">
                          <PrintCertButton certClass={paymentCertClass} label="납부확인서 인쇄" />
                        </div>
                      )}

                      {/* 인쇄 영역 */}
                      <div className={`printable-cert ${paymentCertClass}`}>
                        <div className="mb-8 text-center">
                          <p className="text-xs text-slate">한국경찰학원</p>
                          <h1 className="mt-2 text-2xl font-bold tracking-widest">납 부 확 인 서</h1>
                          <p className="mt-1 text-xs text-slate">발급일 {today}</p>
                        </div>

                        <table className="w-full border-collapse text-sm">
                          <tbody>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                학번
                              </th>
                              <td className="px-4 py-3 text-ink">{viewer.examNumber}</td>
                            </tr>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                이름
                              </th>
                              <td className="px-4 py-3 text-ink">{viewer.name}</td>
                            </tr>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                강좌명
                              </th>
                              <td className="px-4 py-3 text-ink">{courseName}</td>
                            </tr>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                수강기간
                              </th>
                              <td className="px-4 py-3 text-ink">{coursePeriod}</td>
                            </tr>
                            {payments.map((payment, pIdx) => (
                              <tr key={payment.id} className="border border-ink/20">
                                <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                  {pIdx + 1}차 납부
                                  <span className="block text-[10px] font-normal text-slate">
                                    {formatKoreanDate(payment.processedAt)}
                                  </span>
                                </th>
                                <td className="px-4 py-3 text-ink">
                                  {formatAmount(payment.netAmount)}
                                </td>
                              </tr>
                            ))}
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                합계 납부액
                              </th>
                              <td className="px-4 py-3 font-bold text-ink">
                                {formatAmount(totalPaid)}
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        <p className="mt-8 text-center text-sm text-slate">
                          위와 같이 수강료를 납부하였음을 확인합니다.
                        </p>
                        <p className="mt-6 text-center text-sm font-semibold text-ink">
                          한국경찰학원
                        </p>
                        <p className="mt-1 text-center text-xs text-slate">
                          대구광역시 중구 중앙대로 390 센트럴엠빌딩 · 053-241-0112
                        </p>
                      </div>
                    </section>
                  </div>
                );
              })}
            </>
          )}

          {/* ── 재학증명서 요청 안내 ── */}
          <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm sm:p-8 no-print">
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                Enrollment Verification
              </p>
              <h2 className="mt-1 text-xl font-semibold">재학증명서 요청</h2>
            </div>

            <p className="text-sm leading-7 text-slate">
              재학증명서가 필요하신 경우 학원 방문 또는 전화로 문의하세요.
            </p>

            <div className="mt-4 rounded-[20px] border border-ink/10 bg-mist/60 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest/10">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4 text-forest"
                  >
                    <path
                      fillRule="evenodd"
                      d="M2 3.5A1.5 1.5 0 0 1 3.5 2h1.148a1.5 1.5 0 0 1 1.465 1.175l.716 3.223a1.5 1.5 0 0 1-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 0 0 6.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 0 1 1.767-1.052l3.223.716A1.5 1.5 0 0 1 18 15.352V16.5a1.5 1.5 0 0 1-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 0 1 2.43 8.326 13.019 13.019 0 0 1 2 5V3.5Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate">전화 문의</p>
                  <a
                    href="tel:053-241-0112"
                    className="text-sm font-bold text-ember hover:underline"
                  >
                    053-241-0112
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest/10">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4 text-forest"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate">영업시간</p>
                  <p className="text-sm font-medium text-ink">
                    평일 09:00 - 21:00
                  </p>
                  <p className="text-sm font-medium text-ink">
                    주말 09:00 - 18:00
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest/10">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4 text-forest"
                  >
                    <path
                      fillRule="evenodd"
                      d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 0 0 .281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 15.57 17 13.162 17 10a7 7 0 1 0-14 0c0 3.162 1.698 5.57 3.354 7.085a13.353 13.353 0 0 0 3.032 2.198l.018.008.006.003ZM10 11.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate">위치</p>
                  <p className="text-sm font-medium text-ink leading-relaxed">
                    대구광역시 중구 중앙대로 390<br />
                    센트럴엠빌딩
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 안내 */}
          <p className="pb-24 text-center text-xs text-slate no-print">
            증명서 출력 시 브라우저 인쇄 기능을 사용합니다. 이 페이지는 개인 정보 보호를 위해 세션이 유지된 경우에만 발급됩니다.
          </p>
        </div>
      </main>
    </>
  );
}
