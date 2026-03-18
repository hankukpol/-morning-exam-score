import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

type RuleStatus = "auto" | "manual" | "admin";

type NotificationRule = {
  type: string;
  label: string;
  trigger: string;
  channel: string;
  status: RuleStatus;
  note?: string;
};

const AUTO_RULES: NotificationRule[] = [
  {
    type: "ENROLLMENT_COMPLETE",
    label: "수강 등록 완료",
    trigger: "수강 등록 처리 시 (수납 등록 API 호출 후 자동 발송)",
    channel: "카카오 알림톡",
    status: "auto",
  },
  {
    type: "PAYMENT_COMPLETE",
    label: "수납 완료",
    trigger: "결제 처리 완료 시 (/api/payments POST 성공 후 자동 발송)",
    channel: "카카오 알림톡",
    status: "auto",
  },
  {
    type: "REFUND_COMPLETE",
    label: "환불 처리 완료",
    trigger: "환불 승인 시 (/api/payments/[id]/refund POST 성공 후 자동 발송)",
    channel: "카카오 알림톡",
    status: "auto",
  },
];

const MANUAL_RULES: NotificationRule[] = [
  {
    type: "WARNING_1",
    label: "1차 경고",
    trigger: "경고·탈락 판정 화면에서 수동 발송",
    channel: "카카오 알림톡",
    status: "manual",
    note: "주간 무단 결시 1회 기준",
  },
  {
    type: "WARNING_2",
    label: "2차 경고",
    trigger: "경고·탈락 판정 화면에서 수동 발송",
    channel: "카카오 알림톡",
    status: "manual",
    note: "주간 무단 결시 2회 기준",
  },
  {
    type: "DROPOUT",
    label: "탈락",
    trigger: "경고·탈락 판정 화면에서 수동 발송",
    channel: "카카오 알림톡",
    status: "manual",
    note: "주간 3회 또는 월간 8회 초과 기준",
  },
  {
    type: "ABSENCE_NOTE",
    label: "사유서 처리 결과",
    trigger: "사유서 관리 화면에서 승인/반려 처리 후 수동 발송",
    channel: "카카오 알림톡",
    status: "manual",
  },
  {
    type: "POINT",
    label: "포인트 지급",
    trigger: "포인트 직접 관리 화면에서 지급 시 수동 발송",
    channel: "카카오 알림톡",
    status: "manual",
  },
  {
    type: "NOTICE",
    label: "일반 공지",
    trigger: "알림 수동 발송 화면에서 개별·기수·전체 대상 발송",
    channel: "카카오 알림톡",
    status: "manual",
  },
];

const ADMIN_RULES: NotificationRule[] = [
  {
    type: "SCORE_DEADLINE",
    label: "성적 입력 마감 알림",
    trigger: "성적 미입력 건 발생 시 관리자 대상 수동 발송",
    channel: "카카오 알림톡",
    status: "admin",
    note: "담당 교사/관리자 수신",
  },
];

const STATUS_STYLES: Record<RuleStatus, { badge: string; label: string }> = {
  auto: {
    badge: "border-forest/20 bg-forest/10 text-forest",
    label: "자동",
  },
  manual: {
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    label: "수동",
  },
  admin: {
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    label: "관리자",
  },
};

function RulesTable({ rules }: { rules: NotificationRule[] }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink/5 bg-mist/40">
            <th className="px-5 py-3.5 text-left font-semibold text-ink">알림 유형</th>
            <th className="px-5 py-3.5 text-left font-semibold text-ink">발송 시점</th>
            <th className="hidden px-5 py-3.5 text-left font-semibold text-ink sm:table-cell">채널</th>
            <th className="px-5 py-3.5 text-left font-semibold text-ink">상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">
          {rules.map((rule) => {
            const style = STATUS_STYLES[rule.status];
            return (
              <tr key={rule.type} className="transition hover:bg-mist/30">
                <td className="px-5 py-4">
                  <div className="font-medium text-ink">{rule.label}</div>
                  {rule.note && (
                    <div className="mt-0.5 text-xs text-slate/70">{rule.note}</div>
                  )}
                </td>
                <td className="px-5 py-4 text-slate">{rule.trigger}</td>
                <td className="hidden px-5 py-4 text-slate sm:table-cell">{rule.channel}</td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}
                  >
                    {style.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function NotificationRulesPage() {
  await requireAdminContext(AdminRole.MANAGER);

  return (
    <div className="p-8 sm:p-10">
      {/* 헤더 */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">알림 발송 규칙</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        각 이벤트별 자동 알림 발송 조건을 확인합니다. 알림 발송에는 학생의 수신 동의가 필요합니다.
      </p>

      {/* 자동 발송 규칙 */}
      <div className="mt-10">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-ink">자동 발송 규칙</h2>
          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
            {AUTO_RULES.length}건
          </span>
        </div>
        <p className="mt-1 text-sm text-slate">
          시스템이 이벤트 발생 시 자동으로 발송합니다. Solapi 설정이 완료되어 있어야 합니다.
        </p>
        <div className="mt-5">
          <RulesTable rules={AUTO_RULES} />
        </div>
      </div>

      {/* 수동 발송 규칙 */}
      <div className="mt-10">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-ink">수동 발송 규칙</h2>
          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            {MANUAL_RULES.length}건
          </span>
        </div>
        <p className="mt-1 text-sm text-slate">
          담당자가 직접 발송 버튼을 눌러야 발송됩니다.
        </p>
        <div className="mt-5">
          <RulesTable rules={MANUAL_RULES} />
        </div>
      </div>

      {/* 관리자 알림 */}
      <div className="mt-10">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-ink">관리자 알림</h2>
          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
            {ADMIN_RULES.length}건
          </span>
        </div>
        <p className="mt-1 text-sm text-slate">
          학생이 아닌 관리자·담당 교사에게 발송되는 내부 알림입니다.
        </p>
        <div className="mt-5">
          <RulesTable rules={ADMIN_RULES} />
        </div>
      </div>

      {/* 발송 조건 안내 */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold text-ink">발송 공통 조건</h2>
        <div className="mt-5 rounded-[28px] border border-ink/10 bg-white p-6 sm:p-8 shadow-panel">
          <ul className="space-y-3 text-sm text-slate">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>
                학생이 <strong className="font-semibold text-ink">수신 동의</strong>를 한 경우에만 자동 발송됩니다. 미동의 학생에게는 발송되지 않습니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>
                카카오 알림톡 템플릿 ID(Solapi Template ID)가 설정된 경우 알림톡으로 발송되며, 미설정 시 SMS로 대체 발송됩니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>
                자동 발송은 <strong className="font-semibold text-ink">fire-and-forget</strong> 방식으로 처리되며, 발송 실패는 로그에만 기록되고 처리 응답에 영향을 주지 않습니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>
                모든 발송 내역은 <strong className="font-semibold text-ink">알림 발송 이력</strong>에서 확인할 수 있습니다.
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* 향후 지원 예정 */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold text-ink">향후 지원 예정</h2>
        <div className="mt-5 rounded-[28px] border border-amber-200 bg-amber-50 p-6 sm:p-8">
          <ul className="space-y-3 text-sm text-amber-800">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">·</span>
              <span>자동 발송 규칙 ON/OFF 설정 — 업데이트 예정</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">·</span>
              <span>발송 시간대 제한 설정 (예: 야간 발송 차단) — 업데이트 예정</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">·</span>
              <span>수신 대상 필터 설정 (기수·수험 유형별 조건 설정) — 업데이트 예정</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">·</span>
              <span>중복 발송 방지 기준 설정 (dedupe window 조정) — 업데이트 예정</span>
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
          <Link
            href="/admin/settings/sms"
            className="inline-flex items-center gap-2 rounded-2xl border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-mist shadow-panel"
          >
            SMS·알림 설정
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
