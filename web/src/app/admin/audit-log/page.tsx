import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { formatDateTime, todayDateInputValue } from "@/lib/format";
import { listAuditLogs } from "@/lib/audit-log/service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(
  searchParams: PageProps["searchParams"],
  key: string,
) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function stringifyAuditValue(value: unknown) {
  if (value === null || value === undefined) {
    return "-";
  }

  return JSON.stringify(value, null, 2);
}

export default async function AdminAuditLogPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.SUPER_ADMIN);
  const admin = readParam(searchParams, "admin") ?? "";
  const action = readParam(searchParams, "action") ?? "";
  const date = readParam(searchParams, "date") ?? todayDateInputValue();
  const examNumber = readParam(searchParams, "examNumber") ?? "";
  const rows = await listAuditLogs({
    admin,
    action,
    date,
    examNumber,
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-16 Audit Log
      </div>
      <h1 className="mt-5 text-3xl font-semibold">감사 로그</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        관리자 작업 이력과 변경 전후 값을 추적합니다. 수정이나 삭제는 허용하지 않고 조회만
        제공합니다.
      </p>

      <form className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-4">
        <div>
          <label className="mb-2 block text-sm font-medium">관리자</label>
          <input
            type="text"
            name="admin"
            defaultValue={admin}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            placeholder="이름 또는 이메일"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">작업 유형</label>
          <input
            type="text"
            name="action"
            defaultValue={action}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            placeholder="예: SCORE_UPDATE"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">날짜</label>
          <input
            type="date"
            name="date"
            defaultValue={date}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">수험번호</label>
          <input
            type="text"
            name="examNumber"
            defaultValue={examNumber}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            placeholder="targetId 또는 JSON 내 examNumber 검색"
          />
        </div>
        <div className="md:col-span-4 flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
        </div>
      </form>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">조회 결과</h2>
          <p className="text-sm text-slate">{rows.length}건</p>
        </div>

        <div className="mt-6 space-y-4">
          {rows.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
              조건에 맞는 감사 로그가 없습니다.
            </div>
          ) : null}
          {rows.map((row) => (
            <article key={row.id} className="rounded-[28px] border border-ink/10 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold">{row.action}</h3>
                    <span className="inline-flex rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-slate">
                      {row.targetType} · {row.targetId}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate">
                    {row.admin.name} ({row.admin.email}) · {formatDateTime(row.createdAt)}
                  </p>
                  <p className="mt-1 text-xs text-slate">
                    IP: {row.ipAddress ?? "-"}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <details className="rounded-[24px] border border-ink/10 bg-mist p-4">
                  <summary className="cursor-pointer text-sm font-semibold">변경 전</summary>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate">
                    {stringifyAuditValue(row.before)}
                  </pre>
                </details>
                <details className="rounded-[24px] border border-ink/10 bg-mist p-4">
                  <summary className="cursor-pointer text-sm font-semibold">변경 후</summary>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate">
                    {stringifyAuditValue(row.after)}
                  </pre>
                </details>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
