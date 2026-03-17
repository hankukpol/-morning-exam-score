"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { AcademySettingsRow } from "./page";

type Props = {
  initialSettings: AcademySettingsRow;
};

const FIELD_LABELS: Record<keyof AcademySettingsRow, string> = {
  name: "학원명 *",
  directorName: "원장명",
  businessRegNo: "사업자등록번호",
  academyRegNo: "학원등록번호",
  address: "주소",
  phone: "대표 전화",
  bankName: "은행명",
  bankAccount: "계좌번호",
  bankHolder: "예금주",
  websiteUrl: "홈페이지 URL",
};

const FIELD_PLACEHOLDERS: Record<keyof AcademySettingsRow, string> = {
  name: "예: 한국경찰학원",
  directorName: "예: 홍길동",
  businessRegNo: "예: 123-45-67890",
  academyRegNo: "예: 제2024-대구중구-001호",
  address: "예: 대구광역시 중구 중앙대로 390",
  phone: "예: 053-241-0112",
  bankName: "예: 농협은행",
  bankAccount: "예: 123-4567-8901-23",
  bankHolder: "예: 한국경찰학원",
  websiteUrl: "예: https://www.example.com",
};

export function AcademySettingsForm({ initialSettings }: Props) {
  const [form, setForm] = useState<AcademySettingsRow>(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("학원명을 입력해주세요.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/settings/academy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "저장 실패");
        return;
      }
      toast.success("저장되었습니다.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-[28px] border border-ink/10">
        <div className="divide-y divide-ink/10">
          {(Object.keys(FIELD_LABELS) as (keyof AcademySettingsRow)[]).map((key) => (
            <div key={key} className="flex items-center gap-4 px-6 py-4">
              <label className="w-36 shrink-0 text-xs font-semibold text-slate">
                {FIELD_LABELS[key]}
              </label>
              <input
                type="text"
                value={form[key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder={FIELD_PLACEHOLDERS[key]}
                className="flex-1 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-forest disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
  );
}
