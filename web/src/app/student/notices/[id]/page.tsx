import Link from "next/link";
import { notFound } from "next/navigation";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { listStudentNotices } from "@/lib/notices/service";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: {
    id: string;
  };
};

export default async function StudentNoticeDetailPage({ params }: PageProps) {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Student Notice Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              공지 상세는 DB 연결이 있어야 사용할 수 있습니다.
            </h1>
          </section>
        </div>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Student Notice Login
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              공지 상세를 보려면 로그인해 주세요.
            </h1>
          </section>

          <StudentLookupForm redirectPath={`/student/notices/${params.id}`} />
        </div>
      </main>
    );
  }

  const noticeId = Number(params.id);

  if (!Number.isInteger(noticeId) || noticeId <= 0) {
    notFound();
  }

  const notices = await listStudentNotices(viewer.examType);
  const notice = notices.find((item) => item.id === noticeId);

  if (!notice) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Student Notice Detail
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                {notice.title}
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                게시 시간 {formatDateTime(notice.publishedAt ?? notice.createdAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student/notices"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                목록으로
              </Link>
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                홈으로
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <RichTextViewer html={notice.content} />
        </section>
      </div>
    </main>
  );
}
