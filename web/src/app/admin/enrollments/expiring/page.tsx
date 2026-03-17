"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

export const dynamic = "force-dynamic";

type ExpiringEnrollment = {
  id: string;
  endDate: string | null;
  status: string;
  courseType: string;
  student: {
    name: string;
    examNumber: string;
    phone: string | null;
  };
  cohort: {
    name: string;
    examCategory: string;
  } | null;
  product: {
    name: string;
  } | null;
  specialLecture: {
    name: string;
  } | null;
};

type Counts = {
  within7days: number;
  within14days: number;
  within30days: number;
};

function getDDayBadge(endDateStr: string | null): { label: string; className: string } {
  if (!endDateStr) {
    return {
      label: "만료일 없음",
      className:
        "rounded-full px-2 py-0.5 text-xs font-semibold bg-ink/5 text-slate border border-ink/10",
    };
  }
  const endDate = new Date(endDateStr);
  const now = new Date();
  const diff = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) {
    return {
      label: "D+0",
      className:
        "rounded-full px-2 py-0.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-200",
    };
  }
  if (diff <= 7) {
    return {
      label: `D-${diff}`,
      className:
        "rounded-full px-2 py-0.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-200",
    };
  }
  if (diff <= 14) {
    return {
      label: `D-${diff}`,
      className:
        "rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200",
    };
  }
  return {
    label: `D-${diff}`,
    className:
      "rounded-full px-2 py-0.5 text-xs font-semibold bg-ink/5 text-slate border border-ink/10",
  };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d
    .toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
    .replace(/\. /g, "-")
    .replace(/\.$/, "");
}

function getCourseName(enrollment: ExpiringEnrollment): string {
  if (enrollment.specialLecture) return enrollment.specialLecture.name;
  if (enrollment.product) return enrollment.product.name;
  if (enrollment.cohort) return enrollment.cohort.name;
  return "-";
}

function getCohortLabel(enrollment: ExpiringEnrollment): string | null {
  if (enrollment.cohort) return enrollment.cohort.name;
  return null;
}

function ExpiringPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawDays = parseInt(searchParams.get("days") ?? "14", 10);
  const days = [7, 14, 30].includes(rawDays) ? rawDays : 14;

  const [enrollments, setEnrollments] = useState<ExpiringEnrollment[]>([]);
  const [counts, setCounts] = useState<Counts>({ within7days: 0, within14days: 0, within30days: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/enrollments/expiring?days=${days}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setEnrollments(json.data.enrollments);
        setCounts(json.data.counts);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  }, [days]);

  const kpiCards = [
    {
      label: "7일 이내 만료",
      count: counts.within7days,
      color: "text-red-700",
      bgColor: "bg-red-50",
      borderColor: "border-red-100",
      dotColor: "bg-red-500",
    },
    {
      label: "14일 이내 만료",
      count: counts.within14days,
      color: "text-amber-700",
      bgColor: "bg-amber-50",
      borderColor: "border-amber-100",
      dotColor: "bg-amber-500",
    },
    {
      label: "30일 이내 만료",
      count: counts.within30days,
      color: "text-slate",
      bgColor: "bg-mist",
      borderColor: "border-ink/10",
      dotColor: "bg-slate",
    },
  ];

  function handleDaysChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`/admin/enrollments/expiring?days=${e.target.value}`);
  }

  function handleNotifyAll() {
    alert("준비 중입니다.");
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        수강 관리
      </div>
      <div className="mt-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">수강 만료 예정</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            곧 수강 기간이 만료되는 학생 목록입니다. 재등록 안내를 진행하세요.
          </p>
        </div>
        <button
          type="button"
          onClick={handleNotifyAll}
          className="shrink-0 rounded-xl border border-ember/30 bg-ember/10 px-4 py-2.5 text-sm font-semibold text-ember hover:bg-ember/20 transition-colors"
        >
          전체 알림 발송
        </button>
      </div>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-2xl border ${card.borderColor} ${card.bgColor} p-6`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${card.dotColor}`} />
              <span className="text-sm font-medium text-slate">{card.label}</span>
            </div>
            <p className={`mt-3 text-4xl font-bold ${card.color}`}>
              {card.count.toLocaleString()}
              <span className="ml-1 text-base font-medium">명</span>
            </p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="mt-8 flex items-center gap-3">
        <label htmlFor="days-select" className="text-sm font-medium text-slate">
          조회 기간
        </label>
        <select
          id="days-select"
          value={days}
          onChange={handleDaysChange}
          className="rounded-xl border border-ink/20 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-forest/30"
        >
          <option value="7">7일 이내</option>
          <option value="14">14일 이내</option>
          <option value="30">30일 이내</option>
        </select>
      </div>

      {/* Table */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate">
            <svg className="mr-3 h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">조회 중...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-20 text-red-600">
            <p className="text-sm font-medium">{error}</p>
          </div>
        ) : enrollments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate">
            <svg
              className="mb-4 h-12 w-12 opacity-30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm font-medium">{days}일 이내 만료 예정 수강 내역이 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    학번
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    이름
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    연락처
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    강좌 / 기수
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    만료일
                  </th>
                  <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate">
                    D-day
                  </th>
                  <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate">
                    상태
                  </th>
                  <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate">
                    갱신
                  </th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enrollment, idx) => {
                  const dday = getDDayBadge(enrollment.endDate);
                  const courseName = getCourseName(enrollment);
                  const cohortLabel = getCohortLabel(enrollment);
                  const isAlt = idx % 2 === 1;
                  return (
                    <tr
                      key={enrollment.id}
                      className={`border-b border-ink/5 transition-colors hover:bg-forest/5 ${
                        isAlt ? "bg-mist/50" : "bg-white"
                      }`}
                    >
                      <td className="px-5 py-4 font-mono text-xs text-slate">
                        {enrollment.student.examNumber}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/students/${enrollment.student.examNumber}`}
                          className="font-semibold text-ink hover:text-ember hover:underline"
                        >
                          {enrollment.student.name}
                        </Link>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-slate">
                        {enrollment.student.phone ?? "-"}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/enrollments/${enrollment.id}`}
                          className="text-ink hover:text-ember hover:underline"
                        >
                          <span className="font-medium">{courseName}</span>
                          {cohortLabel && (
                            <span className="ml-1.5 text-xs text-slate">({cohortLabel})</span>
                          )}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate">
                        {formatDate(enrollment.endDate)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={dday.className}>{dday.label}</span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="rounded-full border border-forest/30 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                          수강 중
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <Link
                          href={`/admin/enrollments/new?examNumber=${enrollment.student.examNumber}&renew=${enrollment.id}`}
                          className="text-sm font-semibold text-ember hover:text-ember/80"
                        >
                          갱신 등록
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {!loading && !error && enrollments.length > 0 && (
          <div className="border-t border-ink/10 px-5 py-3 text-xs text-slate bg-mist/30">
            총 <span className="font-semibold text-ink">{enrollments.length}</span>건 표시 중
            &nbsp;·&nbsp; {days}일 이내 만료 예정
          </div>
        )}
      </div>
    </div>
  );
}

export default function EnrollmentsExpiringPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20 text-slate">
          <span className="text-sm">로딩 중...</span>
        </div>
      }
    >
      <ExpiringPageContent />
    </Suspense>
  );
}
