"use client";

import { NoticeTargetType } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

type NoticeFormProps = {
  noticeId?: number;
  defaultValues?: {
    title: string;
    content: string;
    targetType: NoticeTargetType;
    isPinned: boolean;
  };
};

const TARGET_OPTIONS: Array<{ value: NoticeTargetType; label: string }> = [
  { value: NoticeTargetType.ALL, label: "전체 학생" },
  { value: NoticeTargetType.GONGCHAE, label: "공채" },
  { value: NoticeTargetType.GYEONGCHAE, label: "경채" },
];

export function NoticeForm({ noticeId, defaultValues }: NoticeFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(defaultValues?.title ?? "");
  const [content, setContent] = useState(defaultValues?.content ?? "");
  const [targetType, setTargetType] = useState<NoticeTargetType>(
    defaultValues?.targetType ?? NoticeTargetType.ALL,
  );
  const [isPinned, setIsPinned] = useState(defaultValues?.isPinned ?? false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleSubmit() {
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const url = noticeId ? `/api/notices/${noticeId}` : "/api/notices";
        const method = noticeId ? "PUT" : "POST";

        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content, targetType, isPinned }),
          cache: "no-store",
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "저장에 실패했습니다.");
        }

        router.push("/admin/notices");
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "저장에 실패했습니다.",
        );
      }
    });
  }

  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-6 sm:p-8">
      {errorMessage ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          <label className="mb-2 block text-sm font-medium">대상</label>
          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as NoticeTargetType)}
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
          >
            {TARGET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            제목 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="공지사항 제목"
            required
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-2 block text-sm font-medium">
          내용 <span className="text-red-500">*</span>
        </label>
        <RichTextEditor content={content} onChange={setContent} disabled={isPending} />
        <p className="mt-2 text-xs text-slate">
          굵게, 제목, 목록, 링크 서식을 사용할 수 있습니다.
        </p>
      </div>

      <div className="mt-4">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm">
          <input
            type="checkbox"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span>상단 고정 (공지 목록 최상단에 표시)</span>
        </label>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="inline-flex items-center rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/notices")}
          disabled={isPending}
          className="inline-flex items-center rounded-full border border-ink/10 px-6 py-3 text-sm font-semibold transition hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </div>
  );
}
