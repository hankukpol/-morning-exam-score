import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

const SEND_CHANNELS = [
  {
    id: "kakao",
    name: "카카오 알림톡",
    description: "카카오 비즈니스 채널 연동을 통해 발송됩니다.",
    status: "active" as const,
    detail: "채널 연동됨",
  },
  {
    id: "sms",
    name: "SMS (문자)",
    description: "알리고(Aligo) 또는 NHN 클라우드 SMS API가 필요합니다.",
    status: "inactive" as const,
    detail: "추후 설정 예정",
  },
];

const STATUS_STYLES = {
  active: {
    badge: "border-forest/20 bg-forest/10 text-forest",
    label: "활성",
  },
  partial: {
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    label: "부분 설정",
  },
  inactive: {
    badge: "border-ink/10 bg-mist text-slate",
    label: "미설정",
  },
};

export default async function SmsSettingsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  return (
    <div className="p-8 sm:p-10">
      {/* 헤더 */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">SMS·알림 설정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        카카오 알림톡 및 문자(SMS) 발송 설정을 관리합니다.
      </p>

      {/* 현재 발송 수단 */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold text-ink">현재 발송 수단</h2>
        <p className="mt-1 text-sm text-slate">
          시스템에 연동된 알림 발송 채널 현황입니다.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {SEND_CHANNELS.map((channel) => {
            const style = STATUS_STYLES[channel.status];
            return (
              <div
                key={channel.id}
                className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel"
              >
                <div className="border-b border-ink/5 bg-mist/40 px-6 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-ink">{channel.name}</h3>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}
                    >
                      {style.label}
                    </span>
                  </div>
                </div>
                <div className="space-y-2 px-6 py-5">
                  <p className="text-sm text-slate">{channel.description}</p>
                  <p className="text-xs text-slate/70">{channel.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 발송 설정 안내 */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold text-ink">발송 설정 안내</h2>

        <div className="mt-5 rounded-[28px] border border-ink/10 bg-white p-6 sm:p-8 shadow-panel">
          <ul className="space-y-3 text-sm text-slate">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>
                카카오 알림톡은 카카오 비즈니스 채널 연동을 통해 발송됩니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>
                SMS 발송을 위해서는 알리고(Aligo) 또는 NHN 클라우드 SMS API
                설정이 필요합니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>현재 SMS 자동 발송 기능은 준비 중입니다.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* 바로가기 */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold text-ink">바로가기</h2>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/admin/settings/notification-templates"
            className="inline-flex items-center gap-2 rounded-2xl border border-forest/20 bg-forest/10 px-5 py-2.5 text-sm font-semibold text-forest transition hover:bg-forest/20"
          >
            알림 템플릿 바로가기
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 11L11 3M11 3H6M11 3v5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <Link
            href="/admin/settings/notifications"
            className="inline-flex items-center gap-2 rounded-2xl border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-mist shadow-panel"
          >
            발송 이력 확인
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 11L11 3M11 3H6M11 3v5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
