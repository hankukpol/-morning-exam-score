"use client";

import { useState } from "react";

type ExtendDuration = "1" | "3" | "6";

const DURATION_OPTIONS: { value: ExtendDuration; label: string }[] = [
  { value: "1", label: "1개월" },
  { value: "3", label: "3개월" },
  { value: "6", label: "6개월" },
];

const MONTHLY_FEE = 10000; // 월 10,000원 기준 (실제 금액은 학원 정책에 따라 조정)

interface LockerExtendFormProps {
  lockerNumber: string;
  zone: string;
  currentEndDate: Date | null;
}

export function LockerExtendForm({ lockerNumber, zone, currentEndDate }: LockerExtendFormProps) {
  const [selected, setSelected] = useState<ExtendDuration>("1");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const estimatedCost = parseInt(selected, 10) * MONTHLY_FEE;

  const estimatedNewEndDate = (() => {
    const base = currentEndDate ? new Date(currentEndDate) : new Date();
    base.setMonth(base.getMonth() + parseInt(selected, 10));
    const y = base.getFullYear();
    const m = String(base.getMonth() + 1).padStart(2, "0");
    const d = String(base.getDate()).padStart(2, "0");
    return `${y}년 ${m}월 ${d}일`;
  })();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Simulate a brief processing delay, then show success
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 600);
  }

  if (submitted) {
    return (
      <div className="mt-4 rounded-[24px] border border-forest/20 bg-forest/5 p-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-forest/10">
          <svg className="h-6 w-6 text-forest" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="mt-3 text-base font-semibold text-forest">연장 신청이 접수되었습니다</p>
        <p className="mt-2 text-sm text-slate">
          {lockerNumber}번 사물함 ({zone}) · {selected}개월 연장 요청
        </p>
        <p className="mt-1 text-sm text-slate">
          직원이 확인 후 처리해 드립니다. 문의: 053-241-0112
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-4 inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold text-slate transition hover:border-ember/30 hover:text-ember"
        >
          다시 신청하기
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      {/* Duration selection */}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate">연장 기간 선택</p>
        <div className="grid grid-cols-3 gap-2">
          {DURATION_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelected(option.value)}
              className={`rounded-[16px] border py-3 text-sm font-semibold transition ${
                selected === option.value
                  ? "border-ember bg-ember text-white shadow-sm"
                  : "border-ink/10 bg-mist text-ink hover:border-ember/30 hover:text-ember"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cost estimate */}
      <div className="rounded-[20px] border border-ink/10 bg-mist px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate">예상 비용</p>
          <p className="text-base font-bold text-ember">
            {estimatedCost.toLocaleString("ko-KR")}원
          </p>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-sm text-slate">연장 후 만료 예정일</p>
          <p className="text-sm font-semibold text-ink">{estimatedNewEndDate}</p>
        </div>
        <p className="mt-2 text-[10px] text-slate">
          * 실제 비용은 학원 정책에 따라 다를 수 있습니다.
        </p>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-ember px-4 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "신청 중..." : "연장 신청하기"}
      </button>
    </form>
  );
}
