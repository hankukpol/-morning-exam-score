import Link from "next/link";
import { StudentPushSubscriptionCard } from "@/components/student-portal/student-push-subscription-card";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { listStudentNotices } from "@/lib/notices/service";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

function isRecent(value: Date | null) {
  if (!value) {
    return false;
  }

  const diff = Date.now() - value.getTime();
  return diff <= 1000 * 60 * 60 * 24 * 7;
}

export default async function StudentNoticesPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Student Notices Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              공지사항 보드는 DB 연결이 필요합니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에서는 학생과 공지 데이터가 연결되지 않아 공지사항을 불러올 수 없습니다.
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
        </div>
      </main>
    );
  }

  const student = await getStudentPortalViewer();

  if (!student) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Student Notices Login
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              공지사항은 로그인 후 확인할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              학생 포털에서 로그인한 뒤 본인 직렬에 맞는 공지사항을 다시 불러와 주세요.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/student/login?redirectTo=/student/notices"
                className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
              >
                로그인
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const notices = await listStudentNotices(student.examType);

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            F-19 Student Notices
          </div>
          <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold leading-tight sm:text-5xl">공지사항</h1>
              <p className="mt-5 max-w-3xl text-sm leading-8 text-slate sm:text-base">
                공개된 전체 공지와 {student.name}님의 직렬 공지를 함께 보여줍니다.
              </p>
            </div>
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              포털 홈으로 돌아가기
            </Link>
          </div>
        </section>

        <StudentPushSubscriptionCard studentName={student.name} />

        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">{student.name}님 공지 보드</h2>
              <p className="mt-3 text-sm leading-7 text-slate">
                {notices.length}개의 공지가 공개되어 있습니다.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {notices.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
                현재 공개된 공지사항이 없습니다.
              </div>
            ) : null}

            {notices.map((notice) => (
              <article key={notice.id} className="rounded-[24px] border border-ink/10 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                        {notice.targetType === "ALL" ? "전체" : "직렬"}
                      </span>
                      {isRecent(notice.publishedAt) ? (
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                          NEW
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <h3 className="text-2xl font-semibold">{notice.title}</h3>
                      <Link
                        href={`/student/notices/${notice.id}`}
                        className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                      >
                        자세히 보기
                      </Link>
                    </div>
                    <p className="mt-2 text-sm text-slate">
                      공개일 {formatDateTime(notice.publishedAt ?? notice.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-[20px] bg-mist px-4 py-4">
                  <RichTextViewer html={notice.content} />
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
