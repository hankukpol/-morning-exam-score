"use client";

import { useState, useTransition } from "react";

interface PolicyValues {
  refundBeforeStart: number;
  refundBefore1Third: number;
  refundBefore1Half: number;
  refundAfter1Half: number;
}

interface StageInfo {
  id: number;
  stage: string;
  condition: string;
}

interface Props {
  initialValues: PolicyValues;
  legalMinimums: PolicyValues;
  currentPolicies: { id: number; refund: number }[];
  stages: StageInfo[];
}

const FIELD_KEYS: (keyof PolicyValues)[] = [
  "refundBeforeStart",
  "refundBefore1Third",
  "refundBefore1Half",
  "refundAfter1Half",
];

export function RefundPolicyEditor({ initialValues, legalMinimums, stages }: Props) {
  const [values, setValues] = useState<PolicyValues>(initialValues);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  function showToast(type: "ok" | "err", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  function handleChange(field: keyof PolicyValues, raw: string) {
    const n = parseInt(raw, 10);
    const clamped = isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
    setValues((prev) => ({ ...prev, [field]: clamped }));
    setIsDirty(true);
  }

  function handleReset() {
    setValues({
      refundBeforeStart: 100,
      refundBefore1Third: 67,
      refundBefore1Half: 50,
      refundAfter1Half: 0,
    });
    setIsDirty(true);
  }

  function validate(): string | null {
    if (values.refundBeforeStart < legalMinimums.refundBeforeStart) {
      return `수업 시작 전 환불 비율은 법정 최저 ${legalMinimums.refundBeforeStart}% 이상이어야 합니다.`;
    }
    if (values.refundBefore1Third < legalMinimums.refundBefore1Third) {
      return `1/3 미만 수강 시 환불 비율은 법정 최저 ${legalMinimums.refundBefore1Third}% 이상이어야 합니다.`;
    }
    if (values.refundBefore1Half < legalMinimums.refundBefore1Half) {
      return `1/3 ~ 1/2 수강 시 환불 비율은 법정 최저 ${legalMinimums.refundBefore1Half}% 이상이어야 합니다.`;
    }
    if (values.refundAfter1Half < legalMinimums.refundAfter1Half) {
      return `1/2 이후 수강 환불 비율은 법정 최저 ${legalMinimums.refundAfter1Half}% 이상이어야 합니다.`;
    }
    return null;
  }

  function handleSave() {
    const err = validate();
    if (err) {
      showToast("err", err);
      return;
    }

    startTransition(async () => {
      try {
        // Merge into the full SystemConfig via PATCH /api/settings/system
        const res = await fetch("/api/settings/system", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: values }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "저장 실패");
        showToast("ok", "환불 정책이 저장되었습니다.");
        setIsDirty(false);
      } catch (e) {
        showToast("err", e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  const legalMinMap: Record<keyof PolicyValues, number> = legalMinimums;

  return (
    <div className="space-y-5">
      {/* 토스트 알림 */}
      {toast && (
        <div
          className={[
            "rounded-2xl border px-4 py-3 text-sm",
            toast.type === "ok"
              ? "border-forest/20 bg-forest/10 text-forest"
              : "border-red-200 bg-red-50 text-red-700",
          ].join(" ")}
        >
          {toast.msg}
        </div>
      )}

      {/* 편집 테이블 */}
      <div className="overflow-hidden rounded-[28px] border border-ink/10 shadow-panel">
        <table className="min-w-full divide-y divide-ink/10 text-sm">
          <thead className="bg-mist/80 text-left">
            <tr>
              <th className="px-5 py-3.5 font-semibold">환불 구간</th>
              <th className="px-5 py-3.5 font-semibold">수강 진행 조건</th>
              <th className="px-5 py-3.5 text-center font-semibold">법정 최저</th>
              <th className="px-5 py-3.5 text-center font-semibold">학원 적용 비율</th>
              <th className="px-5 py-3.5 text-center font-semibold">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10 bg-white">
            {FIELD_KEYS.map((field, idx) => {
              const stage = stages[idx];
              const legal = legalMinMap[field];
              const current = values[field];
              const isAboveLegal = current >= legal;
              const isBetter = current > legal;

              return (
                <tr key={field} className="transition hover:bg-mist/30">
                  <td className="px-5 py-4 font-semibold text-ink">{stage?.stage}</td>
                  <td className="px-5 py-4 text-slate text-xs">{stage?.condition}</td>
                  <td className="px-5 py-4 text-center">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        legal === 100
                          ? "bg-forest/10 text-forest"
                          : legal === 0
                            ? "bg-red-100 text-red-600"
                            : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {legal}%
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <div className="inline-flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={current}
                        onChange={(e) => handleChange(field, e.target.value)}
                        className={[
                          "w-20 rounded-xl border px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2",
                          isAboveLegal
                            ? "border-ink/10 bg-white focus:ring-forest/30"
                            : "border-red-300 bg-red-50 focus:ring-red-200",
                        ].join(" ")}
                      />
                      <span className="text-sm text-slate">%</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-center">
                    {isAboveLegal ? (
                      isBetter ? (
                        <span className="inline-flex rounded-full bg-sky-50 border border-sky-200 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                          학원 우대
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-forest/10 border border-forest/20 px-2.5 py-0.5 text-xs font-semibold text-forest">
                          법정 기준
                        </span>
                      )
                    ) : (
                      <span className="inline-flex rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-semibold text-red-600">
                        법정 위반
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 경고: 법정 기준 위반 시 */}
      {FIELD_KEYS.some((f) => values[f] < legalMinMap[f]) && (
        <div className="rounded-[20px] border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-semibold text-red-700">법정 기준 위반 경고</p>
          <p className="mt-1 text-sm text-red-600">
            일부 항목이 법정 최저 환불 비율보다 낮습니다. 저장 전에 수정하세요.
          </p>
        </div>
      )}

      {/* 하단 버튼 */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={handleReset}
          className="rounded-xl border border-ink/15 px-4 py-2 text-sm text-slate hover:border-ink/30 hover:text-ink"
        >
          법정 기준으로 초기화
        </button>
        <button
          onClick={handleSave}
          disabled={isPending || !isDirty}
          className="rounded-xl bg-ember px-6 py-2 text-sm font-medium text-white hover:bg-ember/90 disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
      </div>

      {/* 안내 */}
      <div className="rounded-[20px] border border-ink/5 bg-mist/60 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate">설정 안내</p>
        <ul className="mt-3 space-y-1.5 text-sm text-slate">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-ember">·</span>
            <span>
              여기서 저장한 환불 비율은 <strong className="text-ink">수납 환불 처리 화면</strong>에서
              자동으로 적용됩니다.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-ember">·</span>
            <span>
              법정 기준보다 <strong className="text-ink">유리한 비율</strong>을 설정하면
              &lsquo;학원 우대&rsquo;로 표시됩니다.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-ember">·</span>
            <span>
              동일한 설정은 <strong className="text-ink">시스템 설정 &gt; 수납 설정</strong>
              탭에서도 관리할 수 있습니다.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
