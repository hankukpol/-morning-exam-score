import { AdminRole, ExamType } from "@prisma/client";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import { listNotificationCenterData } from "@/lib/notifications/service";
import { listPeriods } from "@/lib/periods/service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(searchParams: PageProps["searchParams"], key: string) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminNotificationsPage({ searchParams }: PageProps) {
  const examType =
    readParam(searchParams, "examType") === ExamType.GYEONGCHAE
      ? ExamType.GYEONGCHAE
      : ExamType.GONGCHAE;
  const search = readParam(searchParams, "search") ?? "";
  const [, data, periods] = await Promise.all([
    requireAdminContext(AdminRole.TEACHER),
    listNotificationCenterData({ examType, search }),
    listPeriods(),
  ]);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-09 Notifications
      </div>
      <h1 className="mt-5 text-3xl font-semibold">알림 발송</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        Solapi 기반 알림톡과 SMS 발송을 관리하고, 공지 Web Push 전달 이력까지 함께 점검합니다.
        발송 전 대상자를 미리 확인하고, 수신 동의와 발송 이력을 함께 볼 수 있습니다.
      </p>

      <form className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-[160px_minmax(0,1fr)_140px]">
        <div>
          <label className="mb-2 block text-sm font-medium">직렬</label>
          <select
            name="examType"
            defaultValue={examType}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value={ExamType.GONGCHAE}>{EXAM_TYPE_LABEL.GONGCHAE}</option>
            <option value={ExamType.GYEONGCHAE}>{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">수험번호 / 이름</label>
          <input
            type="text"
            name="search"
            defaultValue={search}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            placeholder="수험번호 또는 이름 검색"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
        </div>
      </form>

      <div className="mt-8">
        <NotificationCenter
          filters={{ examType, search }}
          setup={{
            notificationReady: data.setup.notificationReady,
            missingNotificationKeys: data.setup.missingNotificationKeys,
          }}
          summary={data.summary}
          students={data.students.map((student) => ({
            ...student,
            consentedAt: student.consentedAt ? student.consentedAt.toISOString() : null,
          }))}
          pendingLogs={data.pendingLogs.map((log) => ({
            ...log,
            sentAt: log.sentAt.toISOString(),
          }))}
          historyLogs={data.historyLogs.map((log) => ({
            ...log,
            sentAt: log.sentAt.toISOString(),
          }))}
          periods={periods.map((period) => ({
            id: period.id,
            name: period.name,
            isActive: period.isActive,
            sessions: period.sessions.map((session) => ({
              id: session.id,
              examType: session.examType,
              week: session.week,
              subject: session.subject,
              examDate: session.examDate.toISOString(),
              isCancelled: session.isCancelled,
            })),
          }))}
        />
      </div>
    </div>
  );
}
