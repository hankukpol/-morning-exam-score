import Link from "next/link";
import { NoticeTargetType } from "@prisma/client";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { listStudentNotices } from "@/lib/notices/service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readStringParam(
  searchParams: PageProps["searchParams"],
  key: string,
) {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function parseExamType(value?: string) {
  if (value === NoticeTargetType.GYEONGCHAE) {
    return NoticeTargetType.GYEONGCHAE;
  }

  return NoticeTargetType.GONGCHAE;
}

function examTypeLabel(value: NoticeTargetType) {
  return value === NoticeTargetType.GYEONGCHAE ? "경채" : "공채";
}

function isRecent(value: Date | null) {
  if (!value) {
    return false;
  }

  const diff = Date.now() - value.getTime();
  return diff <= 1000 * 60 * 60 * 24 * 7;
}

export default async function StudentNoticesPage({ searchParams }: PageProps) {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Student Notices Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              공지사항 피드는 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에는 학생/공지 데이터를 읽어올 데이터베이스 연결이 없습니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                학생 포털로 이동
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const examType = parseExamType(readStringParam(searchParams, "examType"));
  const notices = await listStudentNotices(examType);

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            F-19 Student Notices
          </div>
          <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold leading-tight sm:text-5xl">
                공지사항
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-8 text-slate sm:text-base">
                전체 학생 공지와 본인 직렬 공지를 함께 보여줍니다.
              </p>
            </div>
            <Link
              href={`/student?examType=${examType}`}
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              포털로 돌아가기
            </Link>
          </div>

          <form className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-5 sm:grid-cols-[220px_180px] sm:p-6">
            <div>
              <label className="mb-2 block text-sm font-medium">직렬</label>
              <select
                name="examType"
                defaultValue={examType}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              >
                <option value={NoticeTargetType.GONGCHAE}>공채</option>
                <option value={NoticeTargetType.GYEONGCHAE}>경채</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
              >
                공지 불러오기
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">{examTypeLabel(examType)} 공지 피드</h2>
              <p className="mt-3 text-sm leading-7 text-slate">
                {notices.length}개의 공지가 공개되어 있습니다.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {notices.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
                현재 공개된 공지가 없습니다.
              </div>
            ) : null}

            {notices.map((notice) => (
              <article key={notice.id} className="rounded-[24px] border border-ink/10 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                        {notice.targetType === NoticeTargetType.ALL
                          ? "전체"
                          : examTypeLabel(notice.targetType)}
                      </span>
                      {isRecent(notice.publishedAt) ? (
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                          NEW
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-4 text-2xl font-semibold">{notice.title}</h3>
                    <p className="mt-2 text-sm text-slate">
                      공개일 {formatDateTime(notice.publishedAt ?? notice.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 whitespace-pre-wrap rounded-[20px] bg-mist px-4 py-4 text-sm leading-7 text-ink">
                  {notice.content}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
