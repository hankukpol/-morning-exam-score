"use client";

import { useState, useTransition } from "react";

export type ContractItem = { label: string; amount: number };

export type ContractData = {
  id: string;
  enrollmentId: string;
  items: ContractItem[];
  note: string | null;
  issuedAt: string;
  printedAt: string | null;
};

type Props = {
  enrollmentId: string;
  initial: ContractData;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "요청 실패");
  return data as T;
}

export function ContractEditor({ enrollmentId, initial }: Props) {
  const [items, setItems] = useState<ContractItem[]>(initial.items);
  const [note, setNote] = useState(initial.note ?? "");
  const [printedAt, setPrintedAt] = useState<string | null>(initial.printedAt);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, startSave] = useTransition();
  const [isPrinting, startPrint] = useTransition();

  const apiBase = `/api/contracts/enrollment/${enrollmentId}`;

  function updateItem(index: number, field: keyof ContractItem, value: string) {
    setItems((prev) => {
      const next = [...prev];
      if (field === "amount") {
        next[index] = { ...next[index], amount: Number(value) || 0 };
      } else {
        next[index] = { ...next[index], label: value };
      }
      return next;
    });
    setSaveSuccess(false);
  }

  function addItem() {
    setItems((prev) => [...prev, { label: "", amount: 0 }]);
    setSaveSuccess(false);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setSaveSuccess(false);
  }

  function handleSave() {
    setSaveError(null);
    setSaveSuccess(false);
    startSave(async () => {
      try {
        await requestJson(`${apiBase}`, {
          method: "PATCH",
          body: JSON.stringify({ items, note: note.trim() }),
        });
        setSaveSuccess(true);
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  function handlePrint() {
    startPrint(async () => {
      try {
        const res = await requestJson<{ printedAt: string }>(`${apiBase}/print`, {
          method: "POST",
        });
        setPrintedAt(res.printedAt);
      } catch {
        // 출력 기록 실패해도 인쇄는 계속
      }
      window.print();
    });
  }

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <>
      {/* 편집 패널 (인쇄 시 숨김) */}
      <div className="no-print border-b bg-white px-6 py-5">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#111827]">수강 항목 편집</h2>
            {printedAt && (
              <span className="text-xs text-[#1F4D3A] font-medium bg-[#1F4D3A]/10 px-2 py-1 rounded-full">
                출력완료 {new Date(printedAt).toLocaleDateString("ko-KR")}
              </span>
            )}
          </div>

          {/* 항목 목록 */}
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={item.label}
                  onChange={(e) => updateItem(i, "label", e.target.value)}
                  placeholder="항목명 (예: 공채 종합반 52기)"
                  className="flex-1 border border-[#D1D5DB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
                />
                <input
                  type="number"
                  value={item.amount || ""}
                  onChange={(e) => updateItem(i, "amount", e.target.value)}
                  placeholder="금액"
                  className="w-36 border border-[#D1D5DB] rounded-xl px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
                />
                <span className="text-xs text-[#4B5563] w-6 text-center">원</span>
                <button
                  onClick={() => removeItem(i)}
                  className="text-red-400 hover:text-red-600 text-lg leading-none px-1"
                  title="삭제"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={addItem}
              className="text-sm text-[#C55A11] hover:text-[#A04810] font-medium"
            >
              + 항목 추가
            </button>
            <span className="text-sm font-semibold text-[#111827]">
              합계: {total.toLocaleString()}원
            </span>
          </div>

          {/* 특약사항 */}
          <div>
            <label className="text-xs font-medium text-[#4B5563] mb-1 block">특약사항 (선택)</label>
            <textarea
              value={note}
              onChange={(e) => { setNote(e.target.value); setSaveSuccess(false); }}
              rows={2}
              placeholder="특약사항이 있으면 입력하세요"
              className="w-full border border-[#D1D5DB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40 resize-none"
            />
          </div>

          {/* 피드백 */}
          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
          {saveSuccess && <p className="text-sm text-[#1F4D3A] font-medium">저장되었습니다.</p>}

          {/* 버튼 */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 bg-[#1F4D3A] text-white text-sm rounded-xl hover:bg-[#173d2e] disabled:opacity-50 transition-colors font-medium"
            >
              {isSaving ? "저장 중…" : "저장"}
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="px-5 py-2 bg-[#111827] text-white text-sm rounded-xl hover:bg-[#374151] disabled:opacity-50 transition-colors font-medium"
            >
              {isPrinting ? "처리 중…" : "🖨 인쇄 (B5)"}
            </button>
          </div>
        </div>
      </div>

      {/* 계약서 항목 데이터 — 인쇄 레이아웃에서 사용하기 위해 hidden div로 export */}
      <div id="contract-items-data" className="hidden">
        {JSON.stringify({ items, note: note.trim(), total })}
      </div>
    </>
  );
}
