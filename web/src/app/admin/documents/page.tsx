import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

const DOC_TYPE_LABEL: Record<string, string> = {
  ENROLLMENT_CERT: "수강확인서",
  TAX_CERT: "교육비납입증명서",
  SCORE_REPORT: "성적확인서",
  ATTENDANCE_CERT: "출결확인서",
  CUSTOM: "기타 서류",
};

export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKorDate(date: Date): string {
  return `${date.getFullYear()}년 ${(date.getMonth() + 1).toString().padStart(2, "0")}월 ${date
    .getDate()
    .toString()
    .padStart(2, "0")}일`;
}

function formatDateShort(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DocumentsHubPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  // Fetch recent issuance history (last 20)
  const recentIssuances = await prisma.documentIssuance.findMany({
    orderBy: { issuedAt: "desc" },
    take: 20,
    include: {
      student: { select: { name: true } },
      issuedByUser: { select: { name: true } },
    },
  });

  // Fetch recent enrollments that have had certificates/documents accessed
  // We approximate recent certificate-eligible enrollments (ACTIVE, COMPLETED, SUSPENDED)
  const recentEnrollments = await prisma.courseEnrollment.findMany({
    where: {
      status: { in: ["ACTIVE", "COMPLETED", "SUSPENDED"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      examNumber: true,
      status: true,
      startDate: true,
      endDate: true,
      courseType: true,
      createdAt: true,
      updatedAt: true,
      student: { select: { name: true, phone: true } },
      cohort: { select: { name: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
  });

  // Aggregate counts
  const [totalActive, totalCompleted, totalStudents] = await Promise.all([
    prisma.courseEnrollment.count({ where: { status: "ACTIVE" } }),
    prisma.courseEnrollment.count({ where: { status: "COMPLETED" } }),
    prisma.student.count({ where: { isActive: true } }),
  ]);

  const today = formatKorDate(new Date());

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 mb-6">
        <a
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          대시보드
        </a>
        <span className="text-ink/20">/</span>
        <span className="text-sm text-ink font-medium">서류 발급</span>
      </div>

      {/* Header */}
      <div className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
        서류 발급 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">서류 발급 허브</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수강확인서, 출결확인서, 수강등록확인서, 교육비납입증명서 등 공식 서류를 학생별로 발급합니다.
      </p>

      {/* KPI Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-[20px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">수강 중 학생</p>
          <p className="mt-2 text-3xl font-bold text-ink">{totalActive.toLocaleString("ko-KR")}</p>
          <p className="mt-1 text-xs text-slate">서류 발급 가능</p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">수료 학생</p>
          <p className="mt-2 text-3xl font-bold text-ink">{totalCompleted.toLocaleString("ko-KR")}</p>
          <p className="mt-1 text-xs text-slate">수료증 발급 가능</p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">전체 재학생</p>
          <p className="mt-2 text-3xl font-bold text-ink">{totalStudents.toLocaleString("ko-KR")}</p>
          <p className="mt-1 text-xs text-slate">활성 계정 기준</p>
        </div>
      </div>

      {/* Document Types */}
      <div className="mt-10">
        <h2 className="text-base font-semibold text-ink mb-4">발급 가능 서류 유형</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* 수강확인서 */}
          <div className="rounded-[20px] border border-ink/10 bg-white p-6 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-full bg-forest/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-forest" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-ink text-sm">수강확인서</p>
              <p className="mt-1 text-xs text-slate leading-relaxed">
                현재 수강 중인 강좌와 기간을 공식 확인하는 서류입니다.
              </p>
            </div>
            <a
              href="/admin/students"
              className="mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-forest hover:text-forest/80 transition"
            >
              학생 검색 후 발급
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          {/* 출결확인서 */}
          <div className="rounded-[20px] border border-ink/10 bg-white p-6 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-full bg-ember/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-ember" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-ink text-sm">출결확인서</p>
              <p className="mt-1 text-xs text-slate leading-relaxed">
                총 수업일, 출석일, 결석일 등 출결 현황을 기재한 서류입니다.
              </p>
            </div>
            <a
              href="/admin/students"
              className="mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-ember hover:text-ember/80 transition"
            >
              학생 검색 후 발급
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          {/* 수강등록확인서 */}
          <div className="rounded-[20px] border border-ink/10 bg-white p-6 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-full bg-sky-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-ink text-sm">수강등록확인서</p>
              <p className="mt-1 text-xs text-slate leading-relaxed">
                수납 정보를 포함한 수강 등록 사실을 확인하는 공식 문서입니다.
              </p>
            </div>
            <a
              href="/admin/enrollments"
              className="mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-sky-600 hover:text-sky-700 transition"
            >
              수강 목록에서 발급
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          {/* 교육비납입증명서 */}
          <div className="rounded-[20px] border border-ink/10 bg-white p-6 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-full bg-violet-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-ink text-sm">교육비납입증명서</p>
              <p className="mt-1 text-xs text-slate leading-relaxed">
                연말정산 등 교육비 납입 사실을 증명하는 서류입니다.
              </p>
            </div>
            <a
              href="/admin/students"
              className="mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-700 transition"
            >
              학생 검색 후 발급
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* Quick Issue — Student Search */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink">빠른 발급 — 학번으로 이동</h2>
        </div>
        <QuickIssueForm />
      </div>

      {/* How-to guide */}
      <div className="mt-6 rounded-[20px] border border-forest/20 bg-forest/5 p-6">
        <h3 className="text-sm font-semibold text-forest mb-3">발급 방법 안내</h3>
        <ol className="space-y-2 text-sm text-slate list-decimal list-inside leading-relaxed">
          <li>
            <span className="font-medium text-ink">수강확인서 · 출결확인서 · 교육비납입증명서</span>
            — 학생 상세 페이지 → 상단 &quot;서류 발급&quot; 버튼 클릭
          </li>
          <li>
            <span className="font-medium text-ink">수강등록확인서</span>
            — 수강 목록 → 해당 수강 클릭 → &quot;수강등록확인서&quot; 버튼 클릭
          </li>
          <li>
            인쇄 대화상자에서 용지 크기를 <span className="font-medium text-ink">A4</span>로 선택하세요.
            PDF 저장도 가능합니다.
          </li>
        </ol>
      </div>

      {/* Recent Enrollments List */}
      <div className="mt-10">
        <h2 className="text-base font-semibold text-ink mb-4">최근 수강 내역 (서류 발급 가능)</h2>
        <p className="text-xs text-slate mb-4">
          최근 수정된 수강 내역 20건입니다. 수강 상태가 활성·수료·휴원인 학생에게 서류를 발급할 수 있습니다.
        </p>

        {recentEnrollments.length === 0 ? (
          <div className="rounded-[20px] border border-ink/10 bg-white px-6 py-10 text-center text-sm text-slate">
            수강 내역이 없습니다.
          </div>
        ) : (
          <div className="rounded-[20px] border border-ink/10 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist/60">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate">학생</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate">강좌</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate hidden sm:table-cell">상태</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate hidden md:table-cell">수강기간</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate hidden lg:table-cell">최종변경</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate">서류 발급</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {recentEnrollments.map((enr) => {
                  const courseName =
                    enr.cohort?.name ??
                    enr.specialLecture?.name ??
                    enr.product?.name ??
                    "강좌 미지정";

                  const statusLabel: Record<string, string> = {
                    ACTIVE: "수강 중",
                    COMPLETED: "수료",
                    SUSPENDED: "휴원",
                    WAITING: "대기",
                    PENDING: "대기",
                    WITHDRAWN: "퇴원",
                    CANCELLED: "취소",
                  };

                  const statusColor: Record<string, string> = {
                    ACTIVE: "bg-forest/10 text-forest border-forest/20",
                    COMPLETED: "bg-sky-50 text-sky-700 border-sky-200",
                    SUSPENDED: "bg-amber-50 text-amber-700 border-amber-200",
                    WAITING: "bg-ink/5 text-slate border-ink/10",
                    PENDING: "bg-ink/5 text-slate border-ink/10",
                    WITHDRAWN: "bg-red-50 text-red-600 border-red-200",
                    CANCELLED: "bg-ink/5 text-slate border-ink/10",
                  };

                  return (
                    <tr key={enr.id} className="hover:bg-mist/30 transition">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/students/${enr.examNumber}`}
                          className="font-medium text-ink hover:text-forest transition"
                        >
                          {enr.student?.name ?? enr.examNumber}
                        </Link>
                        <p className="text-xs text-slate">{enr.examNumber}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-ink">{courseName}</p>
                        <p className="text-xs text-slate">
                          {enr.courseType === "COMPREHENSIVE" ? "종합반" : "특강·단과"}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            statusColor[enr.status] ?? "bg-ink/5 text-slate border-ink/10"
                          }`}
                        >
                          {statusLabel[enr.status] ?? enr.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell text-xs text-slate">
                        {enr.startDate.toLocaleDateString("ko-KR")}
                        {enr.endDate ? ` ~ ${enr.endDate.toLocaleDateString("ko-KR")}` : ""}
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell text-xs text-slate">
                        {formatDateShort(enr.updatedAt)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                          <Link
                            href={`/admin/students/${enr.examNumber}/documents?type=enrollment`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-forest/20 bg-forest/5 px-3 py-1 text-xs font-medium text-forest hover:bg-forest/10 transition"
                          >
                            수강확인서
                          </Link>
                          <Link
                            href={`/admin/enrollments/${enr.id}/certificate`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 transition"
                          >
                            등록확인서
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Issuance History */}
      <div className="mt-10">
        <h2 className="text-base font-semibold text-ink mb-4">최근 발급 이력</h2>
        <p className="text-xs text-slate mb-4">
          직원이 발급 기록 버튼을 통해 기록한 최근 20건의 서류 발급 이력입니다.
        </p>

        {recentIssuances.length === 0 ? (
          <div className="rounded-[20px] border border-ink/10 bg-white px-6 py-10 text-center text-sm text-slate">
            발급 이력이 없습니다. 학생 문서 페이지에서 &quot;발급 기록&quot; 버튼을 눌러 기록하세요.
          </div>
        ) : (
          <div className="rounded-[20px] border border-ink/10 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist/60">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate">학생</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate">문서 유형</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate hidden sm:table-cell">발급자</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate hidden md:table-cell">발급일시</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate hidden lg:table-cell">메모</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {recentIssuances.map((iss) => (
                  <tr key={iss.id} className="hover:bg-mist/30 transition">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/admin/students/${iss.examNumber}`}
                        className="font-medium text-ink hover:text-forest transition"
                      >
                        {iss.student?.name ?? iss.examNumber}
                      </Link>
                      <p className="text-xs text-slate">{iss.examNumber}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex rounded-full border border-forest/20 bg-forest/5 px-2.5 py-0.5 text-xs font-semibold text-forest">
                        {DOC_TYPE_LABEL[iss.docType] ?? iss.docType}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell text-xs text-slate">
                      {iss.issuedByUser?.name ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell text-xs text-slate">
                      {formatDateShort(iss.issuedAt)}
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell text-xs text-slate">
                      {iss.note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer note */}
      <p className="mt-6 text-xs text-slate/60">
        발급 기준일: {today} · 서류는 인쇄 또는 PDF로 저장하세요.
      </p>
    </div>
  );
}

// ─── Quick Issue Form (Client Component) ─────────────────────────────────────

function QuickIssueForm() {
  return (
    <div className="rounded-[20px] border border-ink/10 bg-white p-6">
      <p className="text-sm text-slate mb-4">
        학번을 입력하면 해당 학생의 서류 발급 페이지로 바로 이동합니다.
      </p>
      <QuickIssueFormClient />
    </div>
  );
}

// We need a minimal client island for the form interaction
import { QuickIssueFormClient } from "./quick-issue-form-client";
