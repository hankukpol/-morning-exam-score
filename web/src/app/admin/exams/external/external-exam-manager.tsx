"use client";

import Link from "next/link";
import { useState } from "react";
import type { ExamEventRow } from "./page";

export function ExternalExamManager({ initialEvents }: { initialEvents: ExamEventRow[] }) {
  const [events, setEvents] = useState<ExamEventRow[]>(initialEvents);
  const [showNewModal, setShowNewModal] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">총 {events.length}개 외부시험</p>
        <button
          onClick={() => setShowNewModal(true)}
          className="rounded-2xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
        >
          + 외부시험 등록
        </button>
      </div>

      {events.length === 0 ? (
        <div className="rounded-[28px] border border-ink/10 bg-white p-8 text-center shadow-panel">
          <p className="text-sm text-slate">등록된 외부시험이 없습니다.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/5 text-left">
                <th className="px-6 py-3 text-xs font-medium text-slate">시험명</th>
                <th className="px-6 py-3 text-xs font-medium text-slate">시험일</th>
                <th className="px-6 py-3 text-xs font-medium text-slate">장소</th>
                <th className="px-6 py-3 text-xs font-medium text-slate">응시 등록</th>
                <th className="px-6 py-3 text-xs font-medium text-slate">상태</th>
                <th className="px-6 py-3 text-xs font-medium text-slate"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-mist/50">
                  <td className="px-6 py-3 font-medium text-ink">
                    <Link
                      href={`/admin/exams/external/${e.id}`}
                      className="text-forest hover:underline"
                    >
                      {e.title}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-slate">
                    {new Date(e.examDate).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-6 py-3 text-slate">{e.venue ?? "-"}</td>
                  <td className="px-6 py-3 text-slate">{e._count.registrations}명</td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        e.isActive
                          ? "bg-forest/10 text-forest"
                          : "bg-ink/5 text-slate"
                      }`}
                    >
                      {e.isActive ? "활성" : "비활성"}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <Link
                      href={`/admin/exams/external/${e.id}`}
                      className="inline-flex items-center rounded-full border border-purple-200 px-3 py-1 text-xs font-semibold text-purple-700 transition hover:bg-purple-50"
                    >
                      상세보기
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNewModal && (
        <NewEventModal
          onClose={() => setShowNewModal(false)}
          onCreated={(event) => {
            setEvents((prev) => [event, ...prev]);
            setShowNewModal(false);
          }}
        />
      )}
    </div>
  );
}

function NewEventModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (event: ExamEventRow) => void;
}) {
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [venue, setVenue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/exams/external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, examDate, venue: venue || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "생성 실패");
      onCreated({
        ...data.event,
        examDate: data.event.examDate,
        registrationDeadline: null,
        _count: { registrations: 0 },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-xl">
        <h2 className="text-lg font-semibold text-ink">외부시험 등록</h2>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate">시험명 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="예: 2026 경찰청 순경 공개채용 필기"
              className="mt-1 block w-full rounded-2xl border border-ink/20 bg-mist/30 px-4 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate">시험일 *</label>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              required
              className="mt-1 block w-full rounded-2xl border border-ink/20 bg-mist/30 px-4 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate">시험장소</label>
            <input
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="선택 입력"
              className="mt-1 block w-full rounded-2xl border border-ink/20 bg-mist/30 px-4 py-2.5 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-ink/20 py-2.5 text-sm hover:bg-mist"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-2xl bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? "등록 중..." : "등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
