"use client";

import { NoticeTargetType } from "@/generated/prisma";
import { formatDateTime } from "@/lib/format";
import { useState, useTransition } from "react";

type NoticeRecord = {
  id: number;
  title: string;
  content: string;
  targetType: NoticeTargetType;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type NoticeManagerProps = {
  initialNotices: NoticeRecord[];
  filters: {
    targetType?: NoticeTargetType;
    published?: boolean;
  };
};

type PublishedFilterLabel = "전체" | "게시됨" | "임시저장";

const TARGET_OPTIONS: Array<{ value: NoticeTargetType; label: string }> = [
  { value: NoticeTargetType.ALL, label: "전체 수강생" },
  { value: NoticeTargetType.GONGCHAE, label: "공채" },
  { value: NoticeTargetType.GYEONGCHAE, label: "경채" },
];

function sortNotices(notices: NoticeRecord[]) {
  return [...notices].sort((left, right) => {
    if (left.isPublished !== right.isPublished) {
      return Number(right.isPublished) - Number(left.isPublished);
    }

    const leftTime = new Date(left.publishedAt ?? left.createdAt).getTime();
    const rightTime = new Date(right.publishedAt ?? right.createdAt).getTime();

    return rightTime - leftTime;
  });
}

function targetLabel(targetType: NoticeTargetType) {
  return TARGET_OPTIONS.find((option) => option.value === targetType)?.label ?? targetType;
}

function matchesFilters(
  notice: NoticeRecord,
  filters: NoticeManagerProps["filters"],
) {
  if (filters.targetType && notice.targetType !== filters.targetType) {
    return false;
  }

  if (filters.published !== undefined && notice.isPublished !== filters.published) {
    return false;
  }

  return true;
}

function upsertNotice(
  notices: NoticeRecord[],
  notice: NoticeRecord,
  filters: NoticeManagerProps["filters"],
) {
  const next = notices.filter((item) => item.id !== notice.id);

  if (!matchesFilters(notice, filters)) {
    return sortNotices(next);
  }

  next.unshift(notice);
  return sortNotices(next);
}

export function NoticeManager({ initialNotices, filters }: NoticeManagerProps) {
  const [notices, setNotices] = useState(() => sortNotices(initialNotices));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [targetType, setTargetType] = useState<NoticeTargetType>(NoticeTargetType.ALL);
  const [publishOnSave, setPublishOnSave] = useState(false);
  const [notifyOnPublish, setNotifyOnPublish] = useState(true);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Request failed.");
    }

    return payload;
  }

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setContent("");
    setTargetType(NoticeTargetType.ALL);
    setPublishOnSave(false);
  }

  function startEdit(notice: NoticeRecord) {
    setEditingId(notice.id);
    setTitle(notice.title);
    setContent(notice.content);
    setTargetType(notice.targetType);
    setPublishOnSave(false);
    setNoticeMessage(null);
    setErrorMessage(null);
  }

  function publishedFilterLabel() {
    if (filters.published === true) {
      return "게시됨";
    }

    if (filters.published === false) {
      return "임시저장";
    }

    return "전체";
  }

  function setMessage(nextNotice: string | null, nextError: string | null) {
    setNoticeMessage(nextNotice);
    setErrorMessage(nextError);
  }

  function saveNotice() {
    setMessage(null, null);

    startTransition(async () => {
      try {
        const payload = await requestJson(
          editingId ? `/api/notices/${editingId}` : "/api/notices",
          {
            method: editingId ? "PUT" : "POST",
            body: JSON.stringify({
              title,
              content,
              targetType,
            }),
          },
        );

        const savedNotice = payload.notice as NoticeRecord;
        let nextNotices = upsertNotice(notices, savedNotice, filters);

        if (publishOnSave && !savedNotice.isPublished) {
          const published = await requestJson(`/api/notices/${savedNotice.id}/publish`, {
            method: "PUT",
            body: JSON.stringify({
              isPublished: true,
              sendNotification: notifyOnPublish,
            }),
          });

          nextNotices = upsertNotice(nextNotices, published.notice as NoticeRecord, filters);
          setNoticeMessage(
            published.notificationError
              ? `${
                  editingId
                    ? "공지사항이 수정 및 게시되었습니다."
                    : "공지사항이 작성 및 게시되었습니다."
                } 알림 발송 실패: ${published.notificationError}`
              : editingId
                ? "공지사항이 수정 및 게시되었습니다."
                : "공지사항이 작성 및 게시되었습니다.",
          );
        } else {
          setNoticeMessage(editingId ? "공지사항이 수정되었습니다." : "공지사항이 작성되었습니다.");
        }

        setNotices(nextNotices);
        setErrorMessage(null);
        resetForm();
      } catch (error) {
        setNoticeMessage(null);
        setErrorMessage(error instanceof Error ? error.message : "공지사항 저장에 실패했습니다.");
      }
    });
  }

  function togglePublish(notice: NoticeRecord, nextPublished: boolean) {
    setMessage(null, null);

    startTransition(async () => {
      try {
        const payload = await requestJson(`/api/notices/${notice.id}/publish`, {
          method: "PUT",
          body: JSON.stringify({
            isPublished: nextPublished,
            sendNotification: nextPublished && notifyOnPublish,
          }),
        });

        setNotices((current) =>
          upsertNotice(current, payload.notice as NoticeRecord, filters),
        );
        setNoticeMessage(
          payload.notificationError
            ? `${nextPublished ? "공지사항이 게시되었습니다." : "임시저장으로 변경되었습니다."} 알림 발송 실패: ${payload.notificationError}`
            : nextPublished
              ? "공지사항이 게시되었습니다."
              : "임시저장으로 변경되었습니다.",
        );
        setErrorMessage(null);
      } catch (error) {
        setNoticeMessage(null);
        setErrorMessage(error instanceof Error ? error.message : "게시 상태 변경에 실패했습니다.");
      }
    });
  }

  function removeNotice(id: number) {
    if (!window.confirm("이 공지사항을 삭제하시겠습니까?")) {
      return;
    }

    setMessage(null, null);

    startTransition(async () => {
      try {
        await requestJson(`/api/notices/${id}`, {
          method: "DELETE",
        });

        setNotices((current) => current.filter((notice) => notice.id !== id));

        if (editingId === id) {
          resetForm();
        }

        setNoticeMessage("공지사항이 삭제되었습니다.");
        setErrorMessage(null);
      } catch (error) {
        setNoticeMessage(null);
        setErrorMessage(error instanceof Error ? error.message : "공지사항 삭제에 실패했습니다.");
      }
    });
  }

  const currentPublishedFilter: PublishedFilterLabel = publishedFilterLabel();

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">
              {editingId ? "공지사항 수정" : "공지사항 작성"}
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              현재 필터: 대상 {filters.targetType ? targetLabel(filters.targetType) : "전체"}
              {" / "}
              상태 {currentPublishedFilter}
            </p>
          </div>
          <label className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm">
            <input
              type="checkbox"
              checked={notifyOnPublish}
              onChange={(event) => setNotifyOnPublish(event.target.checked)}
            />
            <span>게시 시 알림 발송</span>
          </label>
        </div>

        {noticeMessage ? (
          <div className="mt-6 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
            {noticeMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <label className="mb-2 block text-sm font-medium">대상</label>
            <select
              value={targetType}
              onChange={(event) => setTargetType(event.target.value as NoticeTargetType)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            >
              {TARGET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">제목</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
              placeholder="공지사항 제목"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium">내용</label>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={10}
            className="w-full rounded-[28px] border border-ink/10 px-4 py-3 text-sm leading-7"
            placeholder="공지사항 내용 (마크다운 또는 일반 텍스트)"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <label className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm">
            <input
              type="checkbox"
              checked={publishOnSave}
              onChange={(event) => setPublishOnSave(event.target.checked)}
            />
            <span>저장 후 즉시 게시</span>
          </label>
          <button
            type="button"
            onClick={saveNotice}
            disabled={isPending}
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            {editingId ? "수정 저장" : "공지사항 작성"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              disabled={isPending}
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              수정 취소
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">공지사항 목록</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              현재 필터 {notices.length}개
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {notices.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              조건에 맞는 공지사항이 없습니다.
            </div>
          ) : null}

          {notices.map((notice) => (
            <article key={notice.id} className="rounded-[24px] border border-ink/10 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                      {targetLabel(notice.targetType)}
                    </span>
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                        notice.isPublished
                          ? "border-forest/20 bg-forest/10 text-forest"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {notice.isPublished ? "게시됨" : "임시저장"}
                    </span>
                  </div>
                  <h3 className="mt-4 text-xl font-semibold">{notice.title}</h3>
                  <p className="mt-2 text-xs text-slate">
                    작성 {formatDateTime(notice.createdAt)}
                    {" / "}
                    수정 {formatDateTime(notice.updatedAt)}
                    {notice.publishedAt ? ` / 게시 ${formatDateTime(notice.publishedAt)}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(notice)}
                    className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePublish(notice, !notice.isPublished)}
                    disabled={isPending}
                    className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-forest/30 hover:text-forest"
                  >
                    {notice.isPublished ? "임시저장으로" : "게시"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeNotice(notice.id)}
                    disabled={isPending}
                    className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-400"
                  >
                    삭제
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-[20px] bg-mist px-4 py-4 text-sm leading-7 text-ink whitespace-pre-wrap">
                {notice.content}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
