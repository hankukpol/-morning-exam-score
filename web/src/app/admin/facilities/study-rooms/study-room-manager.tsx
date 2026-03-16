"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookingStatus } from "@prisma/client";
import { ActionModal } from "@/components/ui/action-modal";
import { BOOKING_STATUS_LABEL } from "@/lib/constants";
import type { StudyRoomRow, BookingRow } from "./page";

const STATUS_COLOR: Record<string, string> = {
  CONFIRMED: "bg-forest/10 text-forest border-forest/20",
  CANCELLED: "bg-ink/5 text-slate border-ink/10",
  NOSHOW: "bg-red-50 text-red-600 border-red-200",
};

interface Props {
  initialRooms: StudyRoomRow[];
  initialBookings: BookingRow[];
  todayDate: string;
}

interface BookingForm {
  roomId: string;
  examNumber: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  note: string;
}

const EMPTY_BOOKING: BookingForm = {
  roomId: "",
  examNumber: "",
  bookingDate: new Date().toISOString().slice(0, 10),
  startTime: "09:00",
  endTime: "11:00",
  note: "",
};

export function StudyRoomManager({ initialRooms, initialBookings, todayDate }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [tab, setTab] = useState<"bookings" | "rooms">("bookings");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [roomEditTarget, setRoomEditTarget] = useState<StudyRoomRow | null>(null);
  const [roomCreateOpen, setRoomCreateOpen] = useState(false);
  const [form, setForm] = useState<BookingForm>(EMPTY_BOOKING);
  const [roomForm, setRoomForm] = useState({ name: "", capacity: "1", description: "" });
  const [error, setError] = useState<string | null>(null);

  const todayStr = todayDate.slice(0, 10);

  function handleCreateBooking() {
    if (!form.roomId || !form.examNumber || !form.bookingDate || !form.startTime || !form.endTime) {
      setError("필수 항목을 모두 입력하세요."); return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/study-room-bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "예약 실패");
        setBookingOpen(false);
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "예약 실패"); }
    });
  }

  function handleCancel() {
    if (!cancelTarget) return;
    startTransition(async () => {
      const res = await fetch(`/api/study-room-bookings/${cancelTarget.id}`, { method: "DELETE" });
      if (res.ok) { setCancelTarget(null); router.refresh(); }
    });
  }

  function handleRoomCreate() {
    if (!roomForm.name.trim()) { setError("스터디룸 이름을 입력하세요."); return; }
    startTransition(async () => {
      try {
        const res = await fetch("/api/study-rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: roomForm.name.trim(), capacity: Number(roomForm.capacity), description: roomForm.description.trim() || null }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "생성 실패");
        setRoomCreateOpen(false);
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "생성 실패"); }
    });
  }

  function handleRoomEdit() {
    if (!roomEditTarget || !roomForm.name.trim()) { setError("이름을 입력하세요."); return; }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/study-rooms/${roomEditTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: roomForm.name.trim(), capacity: Number(roomForm.capacity), description: roomForm.description.trim() || null }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "수정 실패");
        setRoomEditTarget(null);
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "수정 실패"); }
    });
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["bookings", "rooms"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === t ? "bg-ink text-white" : "border border-ink/20 text-slate hover:border-ink/40"}`}
          >
            {t === "bookings" ? "예약 현황" : "스터디룸 관리"}
          </button>
        ))}
      </div>

      {/* Bookings tab */}
      {tab === "bookings" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              오늘 예약 현황
              <span className="ml-2 text-sm font-normal text-slate">
                ({new Date(todayDate).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })})
              </span>
            </h2>
            <button
              onClick={() => { setForm({ ...EMPTY_BOOKING, bookingDate: todayStr }); setError(null); setBookingOpen(true); }}
              className="rounded-[28px] bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-forest"
            >
              + 예약 배정
            </button>
          </div>

          {initialBookings.length === 0 ? (
            <div className="rounded-[20px] border border-ink/10 bg-mist/50 py-12 text-center text-slate text-sm">
              오늘 예약이 없습니다.
            </div>
          ) : (
            <div className="rounded-[20px] border border-ink/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-mist border-b border-ink/10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate">스터디룸</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate">학생</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate">시간</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate">상태</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {initialBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-mist/40">
                      <td className="px-4 py-3 font-medium">{b.room.name}</td>
                      <td className="px-4 py-3">
                        {b.student.name}
                        {b.student.generation && <span className="ml-1 text-xs text-slate">{b.student.generation}기</span>}
                      </td>
                      <td className="px-4 py-3 text-slate">{b.startTime} ~ {b.endTime}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[b.status] ?? ""}`}>
                          {BOOKING_STATUS_LABEL[b.status as BookingStatus]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {b.status === "CONFIRMED" && (
                          <button onClick={() => setCancelTarget(b)} className="text-xs text-red-400 hover:text-red-600">취소</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Rooms management tab */}
      {tab === "rooms" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">스터디룸 목록</h2>
            <button
              onClick={() => { setRoomForm({ name: "", capacity: "1", description: "" }); setError(null); setRoomCreateOpen(true); }}
              className="rounded-[28px] bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-forest"
            >
              + 스터디룸 추가
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {initialRooms.map((r) => (
              <div key={r.id} className="rounded-[20px] border border-ink/10 bg-white p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-ink">{r.name}</p>
                    <p className="text-xs text-slate mt-0.5">수용 {r.capacity}명</p>
                  </div>
                  <button
                    onClick={() => { setRoomForm({ name: r.name, capacity: String(r.capacity), description: r.description ?? "" }); setError(null); setRoomEditTarget(r); }}
                    className="text-xs text-slate hover:text-ink"
                  >
                    수정
                  </button>
                </div>
                {r.description && <p className="mt-2 text-xs text-slate">{r.description}</p>}
              </div>
            ))}
            {initialRooms.length === 0 && (
              <div className="col-span-3 rounded-[20px] border border-ink/10 py-12 text-center text-sm text-slate">
                등록된 스터디룸이 없습니다.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Booking Modal */}
      <ActionModal open={bookingOpen} badgeLabel="스터디룸 예약" title="예약 배정" description="스터디룸 예약을 직접 배정합니다." confirmLabel="배정" cancelLabel="취소" isPending={isPending} onClose={() => setBookingOpen(false)} onConfirm={handleCreateBooking} panelClassName="max-w-md">
        <div className="space-y-3 pt-2">
          {error && <p className="rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">스터디룸 *</label>
            <select value={form.roomId} onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))} className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest">
              <option value="">선택</option>
              {initialRooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">학생 수험번호 *</label>
            <input type="text" value={form.examNumber} onChange={(e) => setForm((f) => ({ ...f, examNumber: e.target.value }))} placeholder="예: 202600001" className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">날짜 *</label>
            <input type="date" value={form.bookingDate} onChange={(e) => setForm((f) => ({ ...f, bookingDate: e.target.value }))} className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate">시작 시간 *</label>
              <input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate">종료 시간 *</label>
              <input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">메모 (선택)</label>
            <input type="text" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest" />
          </div>
        </div>
      </ActionModal>

      {/* Cancel Booking Modal */}
      <ActionModal open={!!cancelTarget} badgeLabel="예약 취소" badgeTone="warning" title="예약 취소" description={`${cancelTarget?.room.name} · ${cancelTarget?.student.name} 예약을 취소합니다.`} confirmLabel="취소 처리" confirmTone="danger" cancelLabel="닫기" isPending={isPending} onClose={() => setCancelTarget(null)} onConfirm={handleCancel} />

      {/* Create Room Modal */}
      <ActionModal open={roomCreateOpen} badgeLabel="스터디룸" title="스터디룸 추가" description="새 스터디룸을 등록합니다." confirmLabel="추가" cancelLabel="취소" isPending={isPending} onClose={() => setRoomCreateOpen(false)} onConfirm={handleRoomCreate} panelClassName="max-w-sm">
        <RoomForm form={roomForm} onChange={setRoomForm} error={error} />
      </ActionModal>

      {/* Edit Room Modal */}
      <ActionModal open={!!roomEditTarget} badgeLabel="스터디룸" title="스터디룸 수정" description={`"${roomEditTarget?.name}" 정보를 수정합니다.`} confirmLabel="저장" cancelLabel="취소" isPending={isPending} onClose={() => setRoomEditTarget(null)} onConfirm={handleRoomEdit} panelClassName="max-w-sm">
        <RoomForm form={roomForm} onChange={setRoomForm} error={error} />
      </ActionModal>
    </div>
  );
}

function RoomForm({ form, onChange, error }: { form: { name: string; capacity: string; description: string }; onChange: (f: typeof form) => void; error: string | null }) {
  return (
    <div className="space-y-3 pt-2">
      {error && <p className="rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate">스터디룸 이름 *</label>
        <input type="text" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="예: 스터디룸 1" className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate">최대 수용 인원</label>
        <input type="number" min="1" value={form.capacity} onChange={(e) => onChange({ ...form, capacity: e.target.value })} className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate">설명 (선택)</label>
        <input type="text" value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} placeholder="예: 4층, 화이트보드 있음" className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest" />
      </div>
    </div>
  );
}
