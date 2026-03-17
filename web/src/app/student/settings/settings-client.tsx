"use client";

import { useState, useTransition } from "react";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import type { ExamType } from "@prisma/client";

type StudentSettings = {
  examNumber: string;
  name: string;
  mobile: string | null;
  notificationConsent: boolean;
  consentedAt: Date | null;
  registeredAt: Date | null;
  examType: ExamType;
  className: string | null;
  generation: number | null;
};

type Props = {
  student: StudentSettings;
};

function formatDate(date: Date | null | string): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatMobile(raw: string | null): string {
  if (!raw) return "-";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

export function SettingsClient({ student }: Props) {
  const [notificationConsent, setNotificationConsent] = useState(
    student.notificationConsent,
  );
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();

  const handleNotificationToggle = () => {
    const next = !notificationConsent;
    setNotificationConsent(next);
    setSaveStatus("saving");

    startTransition(async () => {
      try {
        const res = await fetch("/api/student/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationConsent: next }),
        });

        if (!res.ok) {
          setNotificationConsent(!next);
          setSaveStatus("error");
        } else {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        }
      } catch {
        setNotificationConsent(!next);
        setSaveStatus("error");
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* ── 내 정보 ── */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-forest/10 text-forest">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold">내 정보</h2>
        </div>

        <dl className="divide-y divide-ink/10 overflow-hidden rounded-[24px] border border-ink/10 text-sm">
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <dt className="min-w-[100px] font-medium text-slate">이름</dt>
            <dd className="font-semibold">{student.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <dt className="min-w-[100px] font-medium text-slate">학번</dt>
            <dd className="font-semibold text-ember">{student.examNumber}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <dt className="min-w-[100px] font-medium text-slate">연락처</dt>
            <dd className="flex items-center gap-3">
              <span className="font-semibold">
                {formatMobile(student.mobile)}
              </span>
              <span className="rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs text-slate">
                변경은 창구 문의
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <dt className="min-w-[100px] font-medium text-slate">직렬</dt>
            <dd className="font-semibold">
              {EXAM_TYPE_LABEL[student.examType]}
            </dd>
          </div>
          {student.className && (
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <dt className="min-w-[100px] font-medium text-slate">반</dt>
              <dd className="font-semibold">{student.className}</dd>
            </div>
          )}
          {student.generation && (
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <dt className="min-w-[100px] font-medium text-slate">기수</dt>
              <dd className="font-semibold">{student.generation}기</dd>
            </div>
          )}
          {student.registeredAt && (
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <dt className="min-w-[100px] font-medium text-slate">등록일</dt>
              <dd className="font-semibold">{formatDate(student.registeredAt)}</dd>
            </div>
          )}
        </dl>

        <div className="mt-4 rounded-[20px] border border-amber-100 bg-amber-50/60 px-4 py-3 text-xs leading-6 text-amber-700">
          연락처 변경이 필요하시면 학원 창구(053-241-0112)로 문의해 주세요.
        </div>
      </section>

      {/* ── 알림 설정 ── */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ember/10 text-ember">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M4 8a6 6 0 1 1 12 0v3.528l1.64 2.46A1 1 0 0 1 16.8 15.6H14a4 4 0 0 1-8 0H3.2a1 1 0 0 1-.84-1.61L4 11.528V8Zm4 9.4a2 2 0 0 0 4 0H8Z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold">알림 설정</h2>
            <p className="text-sm text-slate">
              카카오 알림톡 및 문자 수신 동의
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-ink/10">
          <button
            type="button"
            onClick={handleNotificationToggle}
            disabled={isPending}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 transition hover:bg-mist/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="text-left">
              <p className="text-sm font-semibold">전체 알림 수신 동의</p>
              <p className="mt-0.5 text-xs text-slate">
                수납 안내, 성적 공지, 학원 공지사항, 합격 축하 메시지
              </p>
            </div>
            <div
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                notificationConsent ? "bg-ember" : "bg-ink/20"
              }`}
              role="switch"
              aria-checked={notificationConsent}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  notificationConsent ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </div>
          </button>

          <div className="border-t border-ink/10 px-5 py-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className={`flex items-center gap-2 ${notificationConsent ? "text-ink" : "text-ink/30"}`}>
                <span className={`inline-block h-2 w-2 rounded-full ${notificationConsent ? "bg-forest" : "bg-ink/20"}`} />
                수납 알림
              </div>
              <div className={`flex items-center gap-2 ${notificationConsent ? "text-ink" : "text-ink/30"}`}>
                <span className={`inline-block h-2 w-2 rounded-full ${notificationConsent ? "bg-forest" : "bg-ink/20"}`} />
                성적 공지
              </div>
              <div className={`flex items-center gap-2 ${notificationConsent ? "text-ink" : "text-ink/30"}`}>
                <span className={`inline-block h-2 w-2 rounded-full ${notificationConsent ? "bg-forest" : "bg-ink/20"}`} />
                공지사항 알림
              </div>
              <div className={`flex items-center gap-2 ${notificationConsent ? "text-ink" : "text-ink/30"}`}>
                <span className={`inline-block h-2 w-2 rounded-full ${notificationConsent ? "bg-forest" : "bg-ink/20"}`} />
                합격 축하 메시지
              </div>
            </div>
          </div>
        </div>

        {student.consentedAt && notificationConsent && (
          <p className="mt-3 text-xs text-slate">
            동의일: {formatDate(student.consentedAt)}
          </p>
        )}

        {saveStatus === "saving" && (
          <p className="mt-3 text-xs text-slate">저장 중...</p>
        )}
        {saveStatus === "saved" && (
          <p className="mt-3 text-xs text-forest">저장되었습니다.</p>
        )}
        {saveStatus === "error" && (
          <p className="mt-3 text-xs text-red-600">저장에 실패했습니다. 다시 시도해 주세요.</p>
        )}
      </section>

      {/* ── 로그인 안내 ── */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate/10 text-slate">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold">로그인 안내</h2>
            <p className="text-sm text-slate">학생 포털 인증 방식</p>
          </div>
        </div>

        <div className="rounded-[24px] border border-ink/10 bg-mist/50 p-4 text-sm leading-7 text-slate">
          <p>학생 포털은 <strong className="text-ink">수험번호(학번)와 이름</strong>으로 로그인합니다.</p>
          <p className="mt-2">
            별도의 비밀번호가 없으므로 안전하게 이용하시려면 본인 기기에서만 로그인해 주세요.
          </p>
          <p className="mt-2">
            학번이나 이름 변경이 필요한 경우 학원 창구{" "}
            <a href="tel:053-241-0112" className="font-semibold text-ember hover:underline">
              053-241-0112
            </a>
            로 문의해 주세요.
          </p>
        </div>
      </section>
    </div>
  );
}
