import type { Metadata } from "next";
import Link from "next/link";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { ScheduleClient } from "./schedule-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "강의 시간표",
};

export default async function StudentSchedulePage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Student Schedule Unavailable
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            시간표는 DB 연결 후 사용할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            현재 환경에는 강의 일정 데이터를 불러올 데이터베이스가 연결되어 있지 않습니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              학생 포털로 돌아가기
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            Student Schedule Login
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            시간표는 로그인 후 확인할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            학생 포털에 로그인하면 배정된 기수의 강의 일정을 확인할 수 있습니다.
          </p>
        </section>

        <StudentLookupForm redirectPath="/student/schedule" />
      </main>
    );
  }

  // Find the student's active course enrollment and its cohort
  const activeEnrollment = await getPrisma().courseEnrollment.findFirst({
    where: {
      examNumber: viewer.examNumber,
      status: "ACTIVE",
      cohortId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      cohortId: true,
      cohort: {
        select: {
          id: true,
          name: true,
          lectureSchedules: {
            where: { isActive: true },
            select: {
              id: true,
              subjectName: true,
              instructorName: true,
              dayOfWeek: true,
              startTime: true,
              endTime: true,
              isActive: true,
            },
            orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
          },
        },
      },
    },
  });

  const schedules = activeEnrollment?.cohort?.lectureSchedules ?? [];
  const cohortName = activeEnrollment?.cohort?.name ?? null;

  return (
    <main className="space-y-6 px-0 py-6">
      {/* Header */}
      <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Student Schedule
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              {viewer.name}의 강의 시간표
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 수강 중인 기수의 요일별 강의 일정을 확인할 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              포털로 돌아가기
            </Link>
          </div>
        </div>
      </section>

      {/* Schedule content */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        {activeEnrollment === null ? (
          <div className="rounded-[24px] border border-dashed border-ink/10 px-5 py-8 text-center">
            <p className="text-base font-semibold text-ink">현재 수강 중인 기수가 없습니다</p>
            <p className="mt-2 text-sm text-slate">
              활성 수강 등록이 있어야 시간표를 조회할 수 있습니다.
            </p>
            <a
              href="tel:053-241-0112"
              className="mt-4 inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              문의: 053-241-0112
            </a>
          </div>
        ) : (
          <ScheduleClient schedules={schedules} cohortName={cohortName} />
        )}
      </section>
    </main>
  );
}
