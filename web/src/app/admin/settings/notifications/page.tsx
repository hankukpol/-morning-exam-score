import { AdminRole } from "@/generated/prisma";
import { requireAdminContext } from "@/lib/auth";
import { getSetupState } from "@/lib/env";

const REQUIRED_KEYS = [
  "SOLAPI_API_KEY",
  "SOLAPI_API_SECRET",
  "SOLAPI_SENDER",
  "SOLAPI_PF_ID",
  "SOLAPI_TEMPLATE_WARNING_1",
  "SOLAPI_TEMPLATE_WARNING_2",
  "SOLAPI_TEMPLATE_DROPOUT",
 ] as const;

const OPTIONAL_KEYS = ["SOLAPI_TEMPLATE_POINT", "SOLAPI_TEMPLATE_NOTICE"] as const;

export const dynamic = "force-dynamic";

export default async function AdminNotificationSettingsPage() {
  await requireAdminContext(AdminRole.SUPER_ADMIN);
  const setup = getSetupState();

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-09 Settings
      </div>
      <h1 className="mt-5 text-3xl font-semibold">알림 설정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        Solapi 키와 알림톡 템플릿 준비 상태를 확인합니다. 값 자체는 표시하지 않고 연결
        여부만 안내합니다.
      </p>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
              setup.notificationReady
                ? "border-forest/20 bg-forest/10 text-forest"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {setup.notificationReady ? "Ready" : "Needs Setup"}
          </span>
          <p className="text-sm text-slate">
            누락 키: {setup.missingNotificationKeys.join(", ") || "없음"}
          </p>
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold">필수 키</h2>
          <div className="mt-4 space-y-3">
            {REQUIRED_KEYS.map((key) => {
              const present = !setup.missingNotificationKeys.includes(key);

              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-2xl border border-ink/10 px-4 py-3 text-sm"
                >
                  <span className="font-medium">{key}</span>
                  <span className={present ? "text-forest" : "text-red-600"}>
                    {present ? "configured" : "missing"}
                  </span>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold">선택 템플릿</h2>
          <p className="mt-3 text-sm leading-7 text-slate">
            일반 공지와 포인트 지급 알림은 템플릿이 없어도 SMS로 발송할 수 있습니다.
          </p>
          <div className="mt-4 space-y-3">
            {OPTIONAL_KEYS.map((key) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-2xl border border-ink/10 px-4 py-3 text-sm"
              >
                <span className="font-medium">{key}</span>
                <span className={process.env[key] ? "text-forest" : "text-slate-500"}>
                  {process.env[key] ? "configured" : "optional"}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
