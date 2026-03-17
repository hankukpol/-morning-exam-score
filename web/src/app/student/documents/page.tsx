import Link from "next/link";
import { AttendType, CourseType } from "@prisma/client";
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
              학번과 이름으로 로그인하면 수강확인서와 출결확인서를 출력할 수 있습니다.
            </p>
          </section>

          <StudentLookupForm redirectPath="/student/documents" />
        </div>
      </main>
    );
  }

  const prisma = getPrisma();

  // 현재 수강 중인 등록 조회 (ACTIVE 또는 SUSPENDED)
  const enrollment = await prisma.courseEnrollment.findFirst({
    where: {
      examNumber: viewer.examNumber,
      status: { in: ["ACTIVE", "SUSPENDED", "COMPLETED"] },
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

  // 강좌명 계산
  function getCourseName(): string {
    if (!enrollment) return "-";
    if (enrollment.courseType === CourseType.SPECIAL_LECTURE) {
      return enrollment.specialLecture?.name ?? "특강";
    }
    return enrollment.cohort?.name ?? enrollment.product?.name ?? "종합반";
  }

  // 수강 기간 계산
  function getCoursePeriod(): string {
    if (!enrollment) return "-";
    const start = enrollment.startDate ?? enrollment.cohort?.startDate ?? enrollment.specialLecture?.startDate;
    const end = enrollment.endDate ?? enrollment.cohort?.endDate ?? enrollment.specialLecture?.endDate;
    return formatKoreanDateRange(start, end);
  }

  // 출결 집계 (ClassroomAttendanceLog 우선, fallback: LectureAttendance)
  type AttendSummary = {
    normal: number;
    late: number;
    excused: number;
    absent: number;
  };

  let attendSummary: AttendSummary = { normal: 0, late: 0, excused: 0, absent: 0 };

  // ClassroomAttendanceLog 집계
  const classroomLogs = await prisma.classroomAttendanceLog
    .groupBy({
      by: ["attendType"],
      where: { examNumber: viewer.examNumber },
      _count: { attendType: true },
    })
    .catch(() => [] as never[]);

  if (classroomLogs.length > 0) {
    for (const row of classroomLogs) {
      const count = row._count.attendType;
      if (row.attendType === AttendType.NORMAL || row.attendType === AttendType.LIVE) {
        attendSummary.normal += count;
      } else if (row.attendType === AttendType.EXCUSED) {
        attendSummary.excused += count;
      } else if (row.attendType === AttendType.ABSENT) {
        attendSummary.absent += count;
      }
    }
  } else {
    // Fallback: LectureAttendance
    const lectureAtts = await prisma.lectureAttendance
      .groupBy({
        by: ["status"],
        where: { studentId: viewer.examNumber },
        _count: { status: true },
      })
      .catch(() => [] as never[]);

    for (const row of lectureAtts) {
      const count = row._count.status;
      if (row.status === "PRESENT") {
        attendSummary.normal += count;
      } else if (row.status === "LATE") {
        attendSummary.late += count;
      } else if (row.status === "EXCUSED") {
        attendSummary.excused += count;
      } else if (row.status === "ABSENT") {
        attendSummary.absent += count;
      }
    }
  }

  const courseName = getCourseName();
  const coursePeriod = getCoursePeriod();
  const today = formatKoreanDate(new Date());

  const hasEnrollment = !!enrollment;

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
              <p className="mt-1 text-sm text-slate">수강 및 출결 증명서를 출력할 수 있습니다.</p>
            </div>
          </div>

          {/* 수강 없는 경우 */}
          {!hasEnrollment ? (
            <section className="rounded-[28px] border border-ink/10 bg-white p-6 no-print">
              <div className="rounded-[20px] border border-dashed border-ink/10 px-5 py-8 text-center text-sm text-slate">
                현재 수강 중인 강좌가 없습니다.
              </div>
            </section>
          ) : (
            <>
              {/* ── 수강확인서 ── */}
              <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
                {/* 화면 표시용 헤더 */}
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4 no-print">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                      Enrollment Certificate
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">수강확인서</h2>
                  </div>
                  <PrintCertButton certClass="enrollment-cert" />
                </div>

                {/* 인쇄 영역 — enrollment-cert */}
                <div className="printable-cert enrollment-cert">
                  {/* 인쇄 시 보이는 학원 정보 헤더 */}
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

                {/* 화면에서 보이는 데이터 테이블 (no-print) */}
                <div className="no-print space-y-3">
                  <Row label="학번" value={viewer.examNumber} />
                  <Row label="이름" value={viewer.name} />
                  <Row label="강좌명" value={courseName} />
                  <Row label="수강기간" value={coursePeriod} />
                  <Row label="수강료 (납부완료)" value={formatAmount(enrollment.finalFee)} highlight />
                </div>
              </section>

              {/* ── 출결확인서 ── */}
              <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
                {/* 화면 표시용 헤더 */}
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4 no-print">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                      Attendance Certificate
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">출결확인서</h2>
                  </div>
                  <PrintCertButton certClass="attendance-cert" />
                </div>

                {/* 인쇄 영역 — attendance-cert */}
                <div className="printable-cert attendance-cert">
                  <div className="mb-8 text-center">
                    <p className="text-xs text-slate">한국경찰학원</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-widest">출 결 확 인 서</h1>
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
                          출석
                        </th>
                        <td className="px-4 py-3 text-ink">{attendSummary.normal}일</td>
                      </tr>
                      <tr className="border border-ink/20">
                        <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                          지각
                        </th>
                        <td className="px-4 py-3 text-ink">{attendSummary.late}일</td>
                      </tr>
                      <tr className="border border-ink/20">
                        <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                          공결
                        </th>
                        <td className="px-4 py-3 text-ink">{attendSummary.excused}일</td>
                      </tr>
                      <tr className="border border-ink/20">
                        <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                          결석
                        </th>
                        <td className="px-4 py-3 text-ink">{attendSummary.absent}일</td>
                      </tr>
                    </tbody>
                  </table>

                  <p className="mt-8 text-center text-sm text-slate">
                    위와 같이 출결하였음을 확인합니다.
                  </p>
                  <p className="mt-6 text-center text-sm font-semibold text-ink">
                    한국경찰학원
                  </p>
                  <p className="mt-1 text-center text-xs text-slate">
                    대구광역시 중구 중앙대로 390 센트럴엠빌딩 · 053-241-0112
                  </p>
                </div>

                {/* 화면에서 보이는 데이터 테이블 (no-print) */}
                <div className="no-print space-y-3">
                  <Row label="학번" value={viewer.examNumber} />
                  <Row label="이름" value={viewer.name} />
                  <Row label="강좌명" value={courseName} />
                  <Row label="수강기간" value={coursePeriod} />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <AttendBadge label="출석" count={attendSummary.normal} color="text-forest bg-forest/10" />
                    <AttendBadge label="지각" count={attendSummary.late} color="text-amber-700 bg-amber-50" />
                    <AttendBadge label="공결" count={attendSummary.excused} color="text-sky-700 bg-sky-50" />
                    <AttendBadge label="결석" count={attendSummary.absent} color="text-red-700 bg-red-50" />
                  </div>
                </div>
              </section>
            </>
          )}

          {/* 안내 */}
          <p className="pb-24 text-center text-xs text-slate no-print">
            증명서 출력 시 브라우저 인쇄 기능을 사용합니다. 이 페이지는 개인 정보 보호를 위해 세션이 유지된 경우에만 발급됩니다.
          </p>
        </div>
      </main>
    </>
  );
}

// ─── 서브 컴포넌트 ─────────────────────────────────────────────────────────────

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

function AttendBadge({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-1 rounded-[16px] px-3 py-3 ${color}`}>
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-xl font-bold">{count}</span>
      <span className="text-xs">일</span>
    </div>
  );
}
