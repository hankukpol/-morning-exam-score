"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

type StudentInfo = {
  id: string;
  name: string;
  examNumber: string;
  mobile: string;
};

type PointLogEntry = {
  id: number;
  type: string;
  amount: number;
  reason: string;
  grantedBy: string;
  createdAt: string;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "요청에 실패했습니다.");
  return data as T;
}

type StudentData = {
  student: StudentInfo;
  balance: number;
  logs: PointLogEntry[];
};

const TYPE_LABEL: Record<string, string> = {
  ATTENDANCE: "출석",
  MANUAL: "수동",
  EXAM_SCORE: "성적",
  REFERRAL: "추천",
  EVENT: "이벤트",
  DEDUCTION: "차감",
  EXPIRE: "만료",
  SPEND: "사용",
};

export function PointAdjustManager() {
  const [searchInput, setSearchInput] = useState("");
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();

  const [mode, setMode] = useState<"grant" | "deduct">("grant");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [isAdjusting, startAdjust] = useTransition();

  function handleSearch() {
    const q = searchInput.trim();
    if (!q) return;
    setSearchError(null);
    setStudentData(null);
    setAdjustError(null);

    startSearch(async () => {
      try {
        const data = await requestJson<StudentData>(`/api/points/student/${encodeURIComponent(q)}`);
        setStudentData(data);
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : "조회 실패");
      }
    });
  }

  function handleAdjust() {
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setAdjustError("금액은 양수 숫자여야 합니다.");
      return;
    }
    if (!reason.trim()) {
      setAdjustError("사유를 입력하세요.");
      return;
    }
    if (!studentData) return;

    setAdjustError(null);

    const finalAmount = mode === "deduct" ? -numAmount : numAmount;

    startAdjust(async () => {
      try {
        await requestJson("/api/points/adjust", {
          method: "POST",
          body: JSON.stringify({
            examNumber: studentData.student.examNumber,
            amount: finalAmount,
            reason: reason.trim(),
          }),
        });

        // Refresh student data
        const refreshed = await requestJson<StudentData>(
          `/api/points/student/${encodeURIComponent(studentData.student.examNumber)}`,
        );
        setStudentData(refreshed);
        setAmount("");
        setReason("");
        toast.success(`${mode === "grant" ? "지급" : "차감"} 완료: ${Math.abs(finalAmount).toLocaleString()}P`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* 학생 검색 */}
      <div className="bg-white border border-[#E5E7EB] rounded-[28px] p-6">
        <h2 className="text-sm font-semibold text-[#111827] mb-3">학생 검색</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="학번 또는 이름 입력"
            className="flex-1 border border-[#D1D5DB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
          />
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="px-4 py-2 bg-[#C55A11] text-white text-sm rounded-xl hover:bg-[#A04810] disabled:opacity-50 transition-colors"
          >
            {isSearching ? "조회 중…" : "조회"}
          </button>
        </div>
        {searchError && <p className="mt-2 text-sm text-red-600">{searchError}</p>}
      </div>

      {/* 학생 정보 + 잔액 */}
      {studentData && (
        <>
          <div className="bg-[#F7F4EF] border border-[#E5E7EB] rounded-[28px] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-[#111827]">
                  {studentData.student.name}
                  <span className="text-sm font-normal text-[#4B5563] ml-2">
                    ({studentData.student.examNumber})
                  </span>
                </p>
                <p className="text-sm text-[#4B5563]">{studentData.student.mobile}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[#4B5563]">현재 잔액</p>
                <p className="text-2xl font-bold text-[#1F4D3A]">
                  {studentData.balance.toLocaleString()}P
                </p>
              </div>
            </div>
          </div>

          {/* 조정 폼 */}
          <div className="bg-white border border-[#E5E7EB] rounded-[28px] p-6">
            <h2 className="text-sm font-semibold text-[#111827] mb-4">포인트 조정</h2>

            {/* 지급/차감 탭 */}
            <div className="flex rounded-xl overflow-hidden border border-[#E5E7EB] mb-4 w-fit">
              <button
                onClick={() => { setMode("grant"); setAdjustError(null); }}
                className={`px-5 py-2 text-sm font-medium transition-colors ${
                  mode === "grant"
                    ? "bg-[#1F4D3A] text-white"
                    : "bg-white text-[#4B5563] hover:bg-[#F7F4EF]"
                }`}
              >
                지급
              </button>
              <button
                onClick={() => { setMode("deduct"); setAdjustError(null); }}
                className={`px-5 py-2 text-sm font-medium transition-colors ${
                  mode === "deduct"
                    ? "bg-red-600 text-white"
                    : "bg-white text-[#4B5563] hover:bg-[#F7F4EF]"
                }`}
              >
                차감
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[#4B5563] mb-1 block">금액 (P)</label>
                <input
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="예: 100"
                  className="w-full border border-[#D1D5DB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#4B5563] mb-1 block">사유</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="포인트 조정 사유를 입력하세요"
                  className="w-full border border-[#D1D5DB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
                />
              </div>

              {adjustError && <p className="text-sm text-red-600">{adjustError}</p>}

              {mode === "deduct" && Number(amount) > 0 && studentData.balance < Number(amount) && (
                <p className="text-xs text-amber-600">
                  잔액({studentData.balance.toLocaleString()}P)이 차감 금액보다 적습니다.
                </p>
              )}

              <button
                onClick={handleAdjust}
                disabled={isAdjusting || !amount || !reason.trim()}
                className={`w-full py-2.5 text-sm font-medium rounded-xl text-white transition-colors disabled:opacity-50 ${
                  mode === "deduct"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-[#C55A11] hover:bg-[#A04810]"
                }`}
              >
                {isAdjusting
                  ? "처리 중…"
                  : mode === "grant"
                  ? `${amount ? Number(amount).toLocaleString() : "0"}P 지급`
                  : `${amount ? Number(amount).toLocaleString() : "0"}P 차감`}
              </button>
            </div>
          </div>

          {/* 최근 이력 */}
          <div className="bg-white border border-[#E5E7EB] rounded-[28px] p-6">
            <h2 className="text-sm font-semibold text-[#111827] mb-4">
              최근 이력 ({studentData.logs.length}건)
            </h2>
            {studentData.logs.length === 0 ? (
              <p className="text-sm text-[#4B5563]">포인트 이력이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {studentData.logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between py-2 border-b border-[#F3F4F6] last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#111827] truncate">{log.reason}</p>
                      <p className="text-xs text-[#9CA3AF]">
                        {TYPE_LABEL[log.type] ?? log.type} · {log.grantedBy} ·{" "}
                        {new Date(log.createdAt).toLocaleDateString("ko-KR", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-semibold ml-3 ${
                        log.amount >= 0 ? "text-[#1F4D3A]" : "text-red-600"
                      }`}
                    >
                      {log.amount >= 0 ? "+" : ""}
                      {log.amount.toLocaleString()}P
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
