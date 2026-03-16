"use client";

import { useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import type { StudyRoomRow } from "./page";

type Props = {
  initialRooms: StudyRoomRow[];
};

type RoomForm = {
  name: string;
  capacity: string;
  description: string;
  isActive: boolean;
  sortOrder: string;
};

const EMPTY_FORM: RoomForm = {
  name: "",
  capacity: "1",
  description: "",
  isActive: true,
  sortOrder: "0",
};

export function StudyRoomSettingsManager({ initialRooms }: Props) {
  const [rooms, setRooms] = useState(initialRooms);
  const [form, setForm] = useState<RoomForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const createModal = useActionModalState();
  const editModal = useActionModalState();
  const deleteModal = useActionModalState();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function openCreate() {
    const maxSort = rooms.length > 0 ? Math.max(...rooms.map((r) => r.sortOrder)) + 1 : 0;
    setForm({ ...EMPTY_FORM, sortOrder: String(maxSort) });
    setError(null);
    createModal.open();
  }

  function openEdit(room: StudyRoomRow) {
    setEditingId(room.id);
    setForm({
      name: room.name,
      capacity: String(room.capacity),
      description: room.description ?? "",
      isActive: room.isActive,
      sortOrder: String(room.sortOrder),
    });
    setError(null);
    editModal.open();
  }

  function openDelete(id: string) {
    setDeletingId(id);
    deleteModal.open();
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/study-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          capacity: Number(form.capacity),
          description: form.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "등록 실패");
        return;
      }
      setRooms((prev) => [...prev, { ...data.room, bookingCount: 0 }]);
      createModal.close();
    });
  }

  function handleEdit() {
    if (!editingId) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/study-rooms/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          capacity: Number(form.capacity),
          description: form.description,
          isActive: form.isActive,
          sortOrder: Number(form.sortOrder),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "수정 실패");
        return;
      }
      setRooms((prev) =>
        prev.map((r) =>
          r.id === editingId ? { ...r, ...data.room } : r,
        ),
      );
      editModal.close();
    });
  }

  function handleDelete() {
    if (!deletingId) return;
    const target = rooms.find((r) => r.id === deletingId);
    if (target && target.bookingCount > 0) {
      setError("예약 이력이 있는 스터디룸은 삭제할 수 없습니다. 비활성 처리를 사용하세요.");
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/study-rooms/${deletingId}`, { method: "DELETE" });
      if (!res.ok) return;
      setRooms((prev) => prev.filter((r) => r.id !== deletingId));
      deleteModal.close();
    });
  }

  const activeRooms = rooms.filter((r) => r.isActive);
  const inactiveRooms = rooms.filter((r) => !r.isActive);

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">
          총 {rooms.length}개 ({activeRooms.length}개 활성)
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
        >
          + 스터디룸 추가
        </button>
      </div>

      {rooms.length === 0 ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
          등록된 스터디룸이 없습니다. 스터디룸을 추가하면 예약 화면에 표시됩니다.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[28px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-5 py-3.5 font-semibold">순서</th>
                <th className="px-5 py-3.5 font-semibold">스터디룸명</th>
                <th className="px-5 py-3.5 font-semibold">정원</th>
                <th className="px-5 py-3.5 font-semibold">설명</th>
                <th className="px-5 py-3.5 font-semibold">예약 수</th>
                <th className="px-5 py-3.5 font-semibold">상태</th>
                <th className="px-5 py-3.5 font-semibold text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 bg-white">
              {[...activeRooms, ...inactiveRooms].map((room) => (
                <tr key={room.id} className={room.isActive ? "" : "opacity-50"}>
                  <td className="px-5 py-3.5 text-slate">{room.sortOrder}</td>
                  <td className="px-5 py-3.5 font-medium">{room.name}</td>
                  <td className="px-5 py-3.5">{room.capacity}명</td>
                  <td className="px-5 py-3.5 text-slate">{room.description ?? "-"}</td>
                  <td className="px-5 py-3.5 text-slate">{room.bookingCount}건</td>
                  <td className="px-5 py-3.5">
                    {room.isActive ? (
                      <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                        활성
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-slate">
                        비활성
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(room)}
                      className="mr-3 text-xs font-semibold text-slate transition hover:text-ink"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => openDelete(room.id)}
                      className="text-xs font-semibold text-ember transition hover:text-red-600"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 추가 모달 */}
      <ActionModal
        isOpen={createModal.isOpen}
        onClose={createModal.close}
        title="스터디룸 추가"
        confirmLabel="추가"
        onConfirm={handleCreate}
        isLoading={isPending}
      >
        <RoomFormFields form={form} onChange={setForm} error={error} />
      </ActionModal>

      {/* 수정 모달 */}
      <ActionModal
        isOpen={editModal.isOpen}
        onClose={editModal.close}
        title="스터디룸 수정"
        confirmLabel="저장"
        onConfirm={handleEdit}
        isLoading={isPending}
      >
        <RoomFormFields form={form} onChange={setForm} error={error} showActiveToggle showSortOrder />
      </ActionModal>

      {/* 삭제 확인 모달 */}
      <ActionModal
        isOpen={deleteModal.isOpen}
        onClose={deleteModal.close}
        title="스터디룸 삭제"
        confirmLabel="삭제"
        confirmVariant="danger"
        onConfirm={handleDelete}
        isLoading={isPending}
      >
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : (
          <p className="text-sm text-slate">
            이 스터디룸을 삭제하시겠습니까? 예약 이력이 없는 경우에만 삭제됩니다.
          </p>
        )}
      </ActionModal>
    </>
  );
}

function RoomFormFields({
  form,
  onChange,
  error,
  showActiveToggle = false,
  showSortOrder = false,
}: {
  form: RoomForm;
  onChange: (f: RoomForm) => void;
  error: string | null;
  showActiveToggle?: boolean;
  showSortOrder?: boolean;
}) {
  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold text-slate mb-1.5">스터디룸명 *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder="예: 스터디룸 1"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate mb-1.5">정원 (명) *</label>
          <input
            type="number"
            value={form.capacity}
            onChange={(e) => onChange({ ...form, capacity: e.target.value })}
            min={1}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
          />
        </div>
        {showSortOrder && (
          <div>
            <label className="block text-xs font-semibold text-slate mb-1.5">정렬 순서</label>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => onChange({ ...form, sortOrder: e.target.value })}
              min={0}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            />
          </div>
        )}
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate mb-1.5">위치·안내 (선택)</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          placeholder="예: 3층 왼쪽 첫번째 방"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>
      {showActiveToggle && (
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="room-isActive"
            checked={form.isActive}
            onChange={(e) => onChange({ ...form, isActive: e.target.checked })}
            className="h-4 w-4 rounded"
          />
          <label htmlFor="room-isActive" className="text-sm">
            활성 (예약 화면에 표시)
          </label>
        </div>
      )}
    </div>
  );
}
