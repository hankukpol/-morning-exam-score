import { AdminRole, NoticeTargetType } from "@/generated/prisma";
import { NoticeManager } from "@/components/notices/notice-manager";
import { requireAdminContext } from "@/lib/auth";
import { listNotices } from "@/lib/notices/service";

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

function parseTargetType(value?: string) {
  if (!value) {
    return undefined;
  }

  return Object.values(NoticeTargetType).includes(value as NoticeTargetType)
    ? (value as NoticeTargetType)
    : undefined;
}

function parsePublished(value?: string) {
  if (value === "published") {
    return true;
  }

  if (value === "draft") {
    return false;
  }

  return undefined;
}

export default async function AdminNoticesPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const targetType = parseTargetType(readStringParam(searchParams, "targetType"));
  const published = parsePublished(readStringParam(searchParams, "published"));
  const notices = await listNotices({
    targetType,
    published,
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-19 Notices
      </div>
      <h1 className="mt-5 text-3xl font-semibold">Student notices</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        Draft, publish, and unpublish student-facing notices. Publishing can also
        trigger a notice notification through the existing Solapi workflow.
      </p>

      <form className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-[220px_220px_140px]">
        <div>
          <label className="mb-2 block text-sm font-medium">Target</label>
          <select
            name="targetType"
            defaultValue={targetType ?? ""}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="">All targets</option>
            <option value={NoticeTargetType.ALL}>All students</option>
            <option value={NoticeTargetType.GONGCHAE}>Gongchae</option>
            <option value={NoticeTargetType.GYEONGCHAE}>Gyeongchae</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">Status</label>
          <select
            name="published"
            defaultValue={
              published === true ? "published" : published === false ? "draft" : ""
            }
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            Apply filter
          </button>
        </div>
      </form>

      <div className="mt-8">
        <NoticeManager
          initialNotices={notices.map((notice) => ({
            id: notice.id,
            title: notice.title,
            content: notice.content,
            targetType: notice.targetType,
            isPublished: notice.isPublished,
            publishedAt: notice.publishedAt?.toISOString() ?? null,
            createdAt: notice.createdAt.toISOString(),
            updatedAt: notice.updatedAt.toISOString(),
          }))}
          filters={{ targetType, published }}
        />
      </div>
    </div>
  );
}
