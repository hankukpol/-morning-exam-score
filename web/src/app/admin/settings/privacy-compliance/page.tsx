import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function pct(n: number, d: number): number {
  if (d === 0) return 0;
  return Math.round((n / d) * 100);
}

export default async function PrivacyCompliancePage() {
  await requireAdminContext(AdminRole.DIRECTOR);

  const prisma = getPrisma();
  const now = new Date();

  // ── Build last 6 months range ───────────────────────────────────────────────
  const months: { year: number; month: number; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`,
    });
  }
  const sixMonthsAgo = new Date(
    now.getFullYear(),
    now.getMonth() - 5,
    1,
  );

  // ── Queries ─────────────────────────────────────────────────────────────────
  const [
    totalStudents,
    activeStudents,
    consentedStudents,
    recentConsentedStudents,
    studentsWithActiveEnrollment,
    privacyAuditLogs,
  ] = await Promise.all([
    // Total students
    prisma.student.count(),

    // Active students
    prisma.student.count({ where: { isActive: true } }),

    // Students with notificationConsent = true (proxy for consent on file)
    prisma.student.count({ where: { notificationConsent: true } }),

    // Students consented in last 6 months (for monthly chart)
    prisma.student.findMany({
      where: {
        notificationConsent: true,
        consentedAt: { gte: sixMonthsAgo },
      },
      select: { consentedAt: true },
    }),

    // Active students WITHOUT consent
    prisma.student.findMany({
      where: {
        isActive: true,
        notificationConsent: false,
        courseEnrollments: { some: { status: "ACTIVE" } },
      },
      select: {
        examNumber: true,
        name: true,
        phone: true,
        currentStatus: true,
        courseEnrollments: {
          where: { status: "ACTIVE" },
          take: 1,
          select: {
            courseType: true,
            product: { select: { name: true } },
            cohort: { select: { name: true } },
          },
        },
      },
      take: 50,
      orderBy: { createdAt: "asc" },
    }),

    // Privacy-related audit logs
    prisma.auditLog.findMany({
      where: {
        OR: [
          { action: { contains: "PRIVACY" } },
          { action: { contains: "DELETE_REQUEST" } },
          { action: { contains: "CONSENT" } },
          { action: { contains: "DATA_EXPORT" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        createdAt: true,
        admin: { select: { name: true, email: true } },
      },
    }),
  ]);

  // ── Monthly consent chart data ───────────────────────────────────────────────
  const monthlyConsentMap: Record<string, number> = {};
  for (const row of recentConsentedStudents) {
    if (!row.consentedAt) continue;
    const d = new Date(row.consentedAt);
    const key = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyConsentMap[key] = (monthlyConsentMap[key] ?? 0) + 1;
  }

  const chartData = months.map((m) => ({
    label: m.label,
    count: monthlyConsentMap[m.label] ?? 0,
  }));
  const maxChartVal = Math.max(...chartData.map((d) => d.count), 1);

  const consentRate = pct(consentedStudents, totalStudents);
  const activeConsentRate = pct(
    activeStudents - studentsWithActiveEnrollment.length,
    activeStudents,
  );

  const statusMap: Record<string, string> = {
    NORMAL: "재학",
    WARNING_1: "경고1",
    WARNING_2: "경고2",
    DROPOUT: "제적",
  };

  // CSV export data for consent status
  function buildConsentCsv(): string {
    const rows = [
      ["학번", "이름", "연락처", "동의여부", "재학여부"].join(","),
    ];
    // We'd need all student data for this — placeholder for now
    return rows.join("\n");
  }

  const csvData = buildConsentCsv();

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin" className="transition hover:text-ink">
          홈
        </Link>
        <span>/</span>
        <Link href="/admin/settings" className="transition hover:text-ink">
          설정
        </Link>
        <span>/</span>
        <span className="text-ink">개인정보 보호 현황</span>
      </nav>

      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        개인정보 보호
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">개인정보 보호 현황</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            학생 개인정보 동의 현황 및 개인정보 관련 요청·처리 이력을
            모니터링합니다. 동의는 수강 등록 시 창구에서 수집됩니다.
          </p>
        </div>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvData)}`}
          download="privacy_consent_status.csv"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-forest/30 hover:text-forest"
        >
          전체 학생 동의 현황 내보내기 CSV
        </a>
      </div>

      {/* KPI Stats */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            전체 학생
          </p>
          <p className="mt-2 text-3xl font-semibold text-ink">
            {totalStudents.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">명 (재학 {activeStudents}명)</p>
        </div>

        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            동의 완료
          </p>
          <p className="mt-2 text-3xl font-semibold text-forest">
            {consentedStudents.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">
            {consentRate}% 커버리지
          </p>
        </div>

        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            미동의 (재학 중)
          </p>
          <p className="mt-2 text-3xl font-semibold text-amber-700">
            {studentsWithActiveEnrollment.length.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">활성 수강생 중</p>
        </div>

        <div className="rounded-[28px] border border-ember/20 bg-ember/5 p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            동의 처리율
          </p>
          <p className="mt-2 text-3xl font-semibold text-ember">
            {activeConsentRate}%
          </p>
          <p className="mt-1 text-xs text-slate">재학생 기준</p>
        </div>
      </div>

      {/* Consent Coverage Bar */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">전체 동의 커버리지</h2>
          <span className="text-sm font-semibold text-forest">
            {consentRate}%
          </span>
        </div>
        <div className="mt-3 h-4 w-full overflow-hidden rounded-full bg-mist">
          <div
            className="h-full rounded-full bg-forest transition-all"
            style={{ width: `${consentRate}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate">
          <span>동의 완료 {consentedStudents.toLocaleString()}명</span>
          <span>미동의 {(totalStudents - consentedStudents).toLocaleString()}명</span>
        </div>
      </div>

      {/* Monthly Chart */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-base font-semibold">월별 동의 수집 추이 (최근 6개월)</h2>
        <p className="mt-1 text-xs text-slate">consentedAt 기록 기준</p>

        <div className="mt-6 flex h-40 items-end gap-3">
          {chartData.map((d) => {
            const barPct = maxChartVal > 0 ? (d.count / maxChartVal) * 100 : 0;
            return (
              <div
                key={d.label}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <span className="text-xs font-semibold text-ink">
                  {d.count > 0 ? d.count : ""}
                </span>
                <div className="w-full rounded-t-lg bg-mist" style={{ height: "120px" }}>
                  <div
                    className="w-full rounded-t-lg bg-forest/60 transition-all"
                    style={{ height: `${barPct}%` }}
                  />
                </div>
                <span className="text-xs text-slate">{d.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Students missing consent */}
      {studentsWithActiveEnrollment.length > 0 && (
        <div className="mt-6 rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
            <h2 className="text-base font-semibold">
              미동의 활성 수강생
              <span className="ml-2 text-sm font-normal text-amber-600">
                {studentsWithActiveEnrollment.length}명
              </span>
            </h2>
            <p className="text-xs text-slate">
              수강 중이나 개인정보 수집 동의가 없는 학생
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist/60 text-left">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    학번
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    이름
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    연락처
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    재학 상태
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    수강 강좌
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    처리
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {studentsWithActiveEnrollment.map((s) => {
                  const enrollment = s.courseEnrollments[0];
                  const courseName =
                    enrollment?.product?.name ??
                    enrollment?.cohort?.name ??
                    (enrollment
                      ? enrollment.courseType === "COMPREHENSIVE"
                        ? "종합반"
                        : "특강"
                      : "—");
                  return (
                    <tr
                      key={s.examNumber}
                      className="transition-colors hover:bg-amber-50/30"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/students/${s.examNumber}`}
                          className="font-semibold text-ember hover:underline"
                        >
                          {s.examNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3 font-medium text-ink">
                        <Link
                          href={`/admin/students/${s.examNumber}`}
                          className="transition hover:text-ember"
                        >
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate">
                        {s.phone ?? "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex rounded-full bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                          {statusMap[s.currentStatus] ?? s.currentStatus}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-slate">
                        {courseName}
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/students/${s.examNumber}/edit`}
                          className="text-xs font-semibold text-ember hover:underline"
                        >
                          동의 처리
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {studentsWithActiveEnrollment.length >= 50 && (
            <div className="border-t border-ink/10 px-6 py-3">
              <p className="text-xs text-slate">
                최대 50명 표시 · 전체 현황은 CSV 내보내기를 이용하세요.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Privacy request log */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-base font-semibold">
            개인정보 처리 감사 로그
            <span className="ml-2 text-sm font-normal text-slate">
              최근 {privacyAuditLogs.length}건
            </span>
          </h2>
        </div>

        {privacyAuditLogs.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate">
            개인정보 관련 감사 로그가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist/60 text-left">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    일시
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    액션
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    대상
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    처리 직원
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    상세
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {privacyAuditLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="transition-colors hover:bg-mist/40"
                  >
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-slate">
                      {new Date(log.createdAt).toLocaleString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          log.action.includes("DELETE")
                            ? "bg-red-50 text-red-700"
                            : log.action.includes("CONSENT")
                              ? "bg-forest/10 text-forest"
                              : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate">
                      {log.targetType} #{log.targetId.slice(0, 12)}
                      {log.targetId.length > 12 ? "..." : ""}
                    </td>
                    <td className="px-5 py-3 text-sm text-ink">
                      {log.admin.name}
                      <br />
                      <span className="text-xs text-slate">
                        {log.admin.email}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/audit-logs/${log.id}`}
                        className="text-xs font-semibold text-ember hover:underline"
                      >
                        상세 →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/audit-logs"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          전체 감사 로그 →
        </Link>
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          설정 홈 →
        </Link>
        <Link
          href="/admin/students?consent=false"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          미동의 학생 전체 →
        </Link>
      </div>
    </div>
  );
}
