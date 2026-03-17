"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

export type ContractItem = { label: string; amount: number };

export type ContractData = {
  id: string;
  enrollmentId: string;
  items: ContractItem[];
  note: string | null;
  issuedAt: string;
  printedAt: string | null;
};

/** Props used by page.tsx */
type Props = {
  enrollmentId: string;
  initial: ContractData;
};

/** Alternate explicit props shape (for external use) */
export type ContractEditorProps = {
  enrollmentId: string;
  initialItems: ContractItem[];
  initialNote: string | null;
  printedAt: string | null;
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

/** Build the inner HTML for the fee rows, injected into the static fee table before print */
function buildFeeRowsHtml(items: ContractItem[]): string {
  const rows = items
    .map(
      (item) =>
        `<tr>
          <td style="border:1px solid #E5E7EB;padding:6px 12px">${item.label}</td>
          <td style="border:1px solid #E5E7EB;padding:6px 12px;text-align:right">${item.amount.toLocaleString()}원</td>
        </tr>`,
    )
    .join("");
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const totalRow = `<tr style="background:#F9FAFB;font-weight:600">
    <td style="border:1px solid #E5E7EB;padding:6px 12px">합계</td>
    <td style="border:1px solid #E5E7EB;padding:6px 12px;text-align:right">${total.toLocaleString()}원</td>
  </tr>`;
  return rows + totalRow;
}

export function ContractEditor({ enrollmentId, initial }: Props) {
  const [items, setItems] = useState<ContractItem[]>(initial.items);
  const [note, setNote] = useState(initial.note ?? "");
  const [printedAt, setPrintedAt] = useState<string | null>(initial.printedAt);
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
  }

  function addItem() {
    setItems((prev) => [...prev, { label: "", amount: 0 }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    startSave(async () => {
      try {
        await requestJson(`${apiBase}`, {
          method: "PATCH",
          body: JSON.stringify({ items, note: note.trim() }),
        });
        toast.success("저장되었습니다.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  function handlePrint() {
    startPrint(async () => {
      // 1. 인쇄 기록 API 호출
      try {
        const res = await requestJson<{ data: { printedAt: string } }>(`${apiBase}/print`, {
          method: "POST",
        });
        setPrintedAt(res.data.printedAt);
      } catch {
        // 출력 기록 실패해도 인쇄는 계속
      }

      // 2. 서버 렌더링된 수강료 테이블 tbody 를 현재 items 로 교체
      const tbody = document.getElementById("contract-fee-tbody");
      let originalHtml: string | null = null;
      if (tbody) {
        originalHtml = tbody.innerHTML;
        tbody.innerHTML = buildFeeRowsHtml(items);
      }

      // 3. 특약사항 섹션 동기화
      const noteSection = document.getElementById("contract-note-section");
      let originalNoteDisplay: string | null = null;
      if (noteSection) {
        originalNoteDisplay = noteSection.style.display;
        const noteParagraph = noteSection.querySelector<HTMLParagraphElement>("#contract-note-text");
        if (note.trim()) {
          noteSection.style.display = "";
          if (noteParagraph) noteParagraph.textContent = note.trim();
        } else {
          noteSection.style.display = "none";
        }
      }

      // 4. 인쇄
      window.print();

      // 5. DOM 복원 (인쇄 후)
      if (tbody && originalHtml !== null) {
        tbody.innerHTML = originalHtml;
      }
      if (noteSection && originalNoteDisplay !== null) {
        noteSection.style.display = originalNoteDisplay;
      }
    });
  }

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    /* 편집 패널: 화면에서는 표시, 인쇄 시 숨김 */
    <div className="print:hidden border-b bg-white px-6 py-5">
      <div className="max-w-2xl mx-auto">
        <div className="rounded-[28px] shadow-sm border border-gray-100 bg-white p-6 space-y-4">
          {/* 헤더 */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#111827]">수강 항목 편집</h2>
            {printedAt && (
              <span className="text-xs text-[#1F4D3A] font-medium bg-[#1F4D3A]/10 px-2.5 py-1 rounded-full">
                출력완료 {new Date(printedAt).toLocaleDateString("ko-KR")}
              </span>
            )}
          </div>

          {/* 컬럼 헤더 */}
          <div className="flex items-center gap-2 text-xs font-semibold text-[#4B5563] px-1">
            <span className="flex-1">항목명</span>
            <span className="w-36 text-right">금액(원)</span>
            <span className="w-7" />
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
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="w-7 text-red-400 hover:text-red-600 text-lg leading-none flex items-center justify-center"
                  title="삭제"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* 항목 추가 + 합계 */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={addItem}
              className="text-sm text-[#C55A11] hover:text-[#A04810] font-medium transition-colors"
            >
              + 항목 추가
            </button>
            <span className="text-sm font-semibold text-[#111827]">
              합계: {total.toLocaleString()}원
            </span>
          </div>

          {/* 특약사항 */}
          <div>
            <label className="text-xs font-semibold text-[#4B5563] mb-1.5 block">
              특약사항{" "}
              <span className="font-normal text-[#9CA3AF]">(선택)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
              }}
              rows={2}
              placeholder="특약사항이 있으면 입력하세요"
              className="w-full border border-[#D1D5DB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40 resize-none"
            />
          </div>

          {/* 버튼 */}
          <div className="flex gap-3 pt-1">
            {/* 저장: forest 색상 */}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 bg-[#1F4D3A] text-white text-sm rounded-xl hover:bg-[#173d2e] disabled:opacity-50 transition-colors font-medium"
            >
              {isSaving ? "저장 중…" : "저장"}
            </button>
            {/* 인쇄: ember 색상 (주 액션) */}
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="px-5 py-2 bg-[#C55A11] text-white text-sm rounded-xl hover:bg-[#A04810] disabled:opacity-50 transition-colors font-medium"
            >
              {isPrinting ? "처리 중…" : "인쇄 (B5)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
