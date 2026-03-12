"use client";

import {
  ExamType,
  NotificationType,
  StudentStatus,
  Subject,
} from "@prisma/client";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from "@/lib/analytics/presentation";
import { EXAM_TYPE_LABEL, NOTIFICATION_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

type NotificationStudent = {
  examNumber: string;
  name: string;
  phone: string | null;
  examType: ExamType;
  currentStatus: StudentStatus;
  notificationConsent: boolean;
  consentedAt: string | null;
};

type NotificationLogRecord = {
  id: number;
  examNumber: string;
  type: NotificationType;
  channel: "ALIMTALK" | "SMS";
  message: string;
  status: string;
  sentAt: string;
  failReason: string | null;
  student: {
    name: string;
    phone: string | null;
    notificationConsent: boolean;
    examType: ExamType;
  };
};

type SessionOption = {
  id: number;
  examType: string;
  week: number;
  subject: Subject;
  examDate: string;
  isCancelled: boolean;
};

type PeriodOption = {
  id: number;
  name: string;
  isActive: boolean;
  sessions: SessionOption[];
};

type NotificationCenterProps = {
  filters: {
    examType: ExamType;
    search?: string;
  };
  setup: {
    notificationReady: boolean;
    missingNotificationKeys: string[];
  };
  summary: {
    totalStudents: number;
    consentedStudents: number;
    excludedStudents: number;
    pendingCount: number;
    failedCount: number;
  };
  students: NotificationStudent[];
  pendingLogs: NotificationLogRecord[];
  historyLogs: NotificationLogRecord[];
  periods: PeriodOption[];
};

type CenterPayload = Omit<NotificationCenterProps, "filters">;

type PreviewRow = {
  examNumber: string;
  name: string;
  phone: string | null;
  currentStatus: StudentStatus;
  notificationConsent: boolean;
  message: string;
  state: "ready" | "excluded";
  exclusionReason: string | null;
  logId?: number;
  notificationType: NotificationType;
};

type PreviewResponse = {
  rows: PreviewRow[];
  readyCount: number;
  excludedCount: number;
  missingExamNumbers: string[];
  messageSamples: string[];
};

type NotificationRequestBody = {
  preview?: boolean;
  logIds?: number[];
  type?: NotificationType;
  message?: string;
  examType?: ExamType;
  examNumbers?: string[];
  pointAmount?: number | null;
  periodId?: number;
  statuses?: StudentStatus[];
};

type PreviewModalState = {
  title: string;
  description: string;
  confirmLabel: string;
  payload: NotificationRequestBody;
  response: PreviewResponse;
};

const SEND_STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  failed: "실패",
  sent: "발송 완료",
  skipped: "제외",
};

const SEND_STATUS_CLASS: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  sent: "border-forest/20 bg-forest/10 text-forest",
  skipped: "border-slate-200 bg-slate-50 text-slate-600",
};

const PREVIEW_STATE_LABEL = {
  ready: "발송 가능",
  excluded: "제외",
} as const;

const PREVIEW_STATE_CLASS = {
  ready: "border-forest/20 bg-forest/10 text-forest",
  excluded: "border-slate-200 bg-slate-50 text-slate-600",
} as const;

const DEFAULT_MISSING_MESSAGE =
  "오늘 시험 성적이 아직 등록되지 않았습니다. 확인 부탁드립니다.";

function parseExamNumbers(input: string) {
  return Array.from(
    new Set(
      input
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

export function NotificationCenter({
  filters,
  setup,
  summary: initialSummary,
  students: initialStudents,
  pendingLogs: initialPendingLogs,
  historyLogs: initialHistoryLogs,
  periods,
}: NotificationCenterProps) {
  const [students, setStudents] = useState(initialStudents);
  const [pendingLogs, setPendingLogs] = useState(initialPendingLogs);
  const [historyLogs, setHistoryLogs] = useState(initialHistoryLogs);
  const [summary, setSummary] = useState(initialSummary);
  const [selectedLogIds, setSelectedLogIds] = useState(
    initialPendingLogs
      .filter((log) => log.status === "pending" || log.status === "failed")
      .map((log) => log.id),
  );
  const activePeriod = periods.find((period) => period.isActive) ?? periods[0] ?? null;
  const [manualType, setManualType] = useState<NotificationType>(NotificationType.NOTICE);
  const [manualMessage, setManualMessage] = useState("");
  const [manualExamNumbers, setManualExamNumbers] = useState("");
  const [manualPointAmount, setManualPointAmount] = useState("10000");
  const [missingPeriodId, setMissingPeriodId] = useState<string>(
    activePeriod ? String(activePeriod.id) : "",
  );
  const [missingSessionId, setMissingSessionId] = useState<string>("");
  const [missingStudents, setMissingStudents] = useState<
    Array<{
      examNumber: string;
      name: string;
      phone: string | null;
      examType: ExamType;
      notificationConsent: boolean;
    }> | null
  >(null);
  const [missingMessage, setMissingMessage] = useState("");
  const [previewModal, setPreviewModal] = useState<PreviewModalState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const missingSessions =
    periods.find((period) => period.id === Number(missingPeriodId))?.sessions ?? [];
  const selectableLogs = pendingLogs.filter(
    (log) => log.status === "pending" || log.status === "failed",
  );
  const allSelectableLogIds = selectableLogs.map((log) => log.id);
  const isAllSelectableChecked =
    selectableLogs.length > 0 && allSelectableLogIds.every((id) => selectedLogIds.includes(id));
  const sendingEnabled = setup.notificationReady && !isPending;

  const parsedManualExamNumbers = useMemo(
    () => parseExamNumbers(manualExamNumbers),
    [manualExamNumbers],
  );

  async function requestJson<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: init?.cache ?? "no-store",
    });

    const text = await response.text();
    const payload = text.trim()
      ? (JSON.parse(text) as T & { error?: string })
      : ({} as T & { error?: string });

    if (!response.ok) {
      throw new Error(payload.error ?? "요청 처리에 실패했습니다.");
    }

    return payload as T;
  }

  function resetMessages() {
    setNotice(null);
    setErrorMessage(null);
  }

  function run(action: () => Promise<void>) {
    resetMessages();
    startTransition(async () => {
      try {
        await action();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "작업 처리 중 오류가 발생했습니다.",
        );
      }
    });
  }

  async function refreshCenter() {
    const params = new URLSearchParams({ examType: filters.examType });
    if (filters.search) {
      params.set("search", filters.search);
    }

    const payload = await requestJson<CenterPayload>(
      `/api/notifications/logs?${params.toString()}`,
      { method: "GET" },
    );

    setStudents(
      payload.students.map((student) => ({
        ...student,
        consentedAt: student.consentedAt ? String(student.consentedAt) : null,
      })),
    );
    setPendingLogs(
      payload.pendingLogs.map((log) => ({
        ...log,
        sentAt: String(log.sentAt),
      })),
    );
    setHistoryLogs(
      payload.historyLogs.map((log) => ({
        ...log,
        sentAt: String(log.sentAt),
      })),
    );
    setSummary(payload.summary);
    setSelectedLogIds(
      payload.pendingLogs
        .filter((log) => log.status === "pending" || log.status === "failed")
        .map((log) => log.id),
    );
  }

  function toggleSelection(id: number) {
    setSelectedLogIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  function buildManualPayload(): NotificationRequestBody {
    return {
      type: manualType,
      message: manualMessage,
      examType: parsedManualExamNumbers.length === 0 ? filters.examType : undefined,
      examNumbers: parsedManualExamNumbers.length > 0 ? parsedManualExamNumbers : undefined,
      pointAmount:
        manualType === NotificationType.POINT ? Number(manualPointAmount || 0) : null,
    };
  }

  function buildMissingPayload(): NotificationRequestBody {
    return {
      type: NotificationType.NOTICE,
      message: missingMessage.trim() || DEFAULT_MISSING_MESSAGE,
      examNumbers: missingStudents?.map((student) => student.examNumber) ?? [],
    };
  }

  function openPreviewModal(
    title: string,
    description: string,
    confirmLabel: string,
    payload: NotificationRequestBody,
    response: PreviewResponse,
  ) {
    setPreviewModal({
      title,
      description,
      confirmLabel,
      payload,
      response,
    });
  }

  function updateConsent(examNumber: string, consent: boolean) {
    run(async () => {
      await requestJson("/api/notifications/consent", {
        method: "POST",
        body: JSON.stringify({ examNumber, consent }),
      });
      await refreshCenter();
      setNotice("수신 동의 상태를 변경했습니다.");
    });
  }

  function previewSelectedLogs() {
    if (!setup.notificationReady) {
      setErrorMessage("알림 연동 설정이 완료되지 않았습니다.");
      return;
    }

    if (selectedLogIds.length === 0) {
      setErrorMessage("미리보기할 대기 알림을 선택해 주세요.");
      return;
    }

    run(async () => {
      const payload = { logIds: selectedLogIds } satisfies NotificationRequestBody;
      const response = await requestJson<PreviewResponse>("/api/notifications/send", {
        method: "POST",
        body: JSON.stringify({ ...payload, preview: true }),
      });

      openPreviewModal(
        "대기 알림 발송 미리보기",
        "선택한 대기 알림의 실제 발송 대상과 제외 대상을 확인합니다.",
        "선택한 알림 발송",
        payload,
        response,
      );
    });
  }

  function previewManualNotification() {
    if (!setup.notificationReady) {
      setErrorMessage("알림 연동 설정이 완료되지 않았습니다.");
      return;
    }

    run(async () => {
      const payload = buildManualPayload();
      const response = await requestJson<PreviewResponse>("/api/notifications/send", {
        method: "POST",
        body: JSON.stringify({ ...payload, preview: true }),
      });

      openPreviewModal(
        "수동 발송 미리보기",
        "발송 전에 대상자, 제외 사유, 실제 전송 문구를 확인합니다.",
        "수동 알림 발송",
        payload,
        response,
      );
    });
  }

  function previewMissingNotification() {
    if (!setup.notificationReady) {
      setErrorMessage("알림 연동 설정이 완료되지 않았습니다.");
      return;
    }

    if (!missingStudents || missingStudents.length === 0) {
      setErrorMessage("성적 미입력 학생을 먼저 조회해 주세요.");
      return;
    }

    run(async () => {
      const payload = buildMissingPayload();
      const response = await requestJson<PreviewResponse>("/api/notifications/send", {
        method: "POST",
        body: JSON.stringify({ ...payload, preview: true }),
      });

      openPreviewModal(
        "성적 미입력 안내 미리보기",
        "조회된 학생들에게 발송될 안내 메시지를 확인합니다.",
        "미입력 안내 발송",
        payload,
        response,
      );
    });
  }

  function confirmPreviewSend() {
    if (!previewModal) {
      return;
    }

    run(async () => {
      const result = await requestJson<{
        sentCount: number;
        failedCount: number;
        skippedCount: number;
      }>("/api/notifications/send", {
        method: "POST",
        body: JSON.stringify(previewModal.payload),
      });

      setPreviewModal(null);
      if (previewModal.payload.logIds?.length) {
        setNotice(
          `선택 알림 발송 완료: 성공 ${result.sentCount}건, 실패 ${result.failedCount}건, 제외 ${result.skippedCount}건`,
        );
      } else {
        setNotice(
          `알림 발송 완료: 성공 ${result.sentCount}건, 실패 ${result.failedCount}건, 제외 ${result.skippedCount}건`,
        );
      }
      setManualMessage("");
      setManualExamNumbers("");
      setMissingMessage("");
      setMissingStudents(null);
      setMissingSessionId("");
      await refreshCenter();
    });
  }

  function previewMissingStudents() {
    if (!missingSessionId) {
      setErrorMessage("회차를 선택해 주세요.");
      return;
    }

    run(async () => {
      const result = await requestJson<{
        students: Array<{
          examNumber: string;
          name: string;
          phone: string | null;
          examType: ExamType;
          notificationConsent: boolean;
        }>;
      }>(`/api/notifications/missing-scores?sessionId=${missingSessionId}`);

      setMissingStudents(result.students);
      if (result.students.length === 0) {
        setNotice("성적 미입력 학생이 없습니다.");
      } else {
        setNotice(`성적 미입력 학생 ${result.students.length}명을 찾았습니다.`);
      }
    });
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
          <p className="text-sm text-slate">발송 대상 학생</p>
          <p className="mt-4 text-2xl font-semibold">{summary.totalStudents}명</p>
          <p className="mt-2 text-xs text-slate">{EXAM_TYPE_LABEL[filters.examType]} 기준</p>
        </article>
        <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
          <p className="text-sm text-slate">수신 동의</p>
          <p className="mt-4 text-2xl font-semibold">{summary.consentedStudents}명</p>
          <p className="mt-2 text-xs text-slate">미동의 또는 연락처 없음 {summary.excludedStudents}명</p>
        </article>
        <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
          <p className="text-sm text-slate">대기 중</p>
          <p className="mt-4 text-2xl font-semibold">{summary.pendingCount}건</p>
          <p className="mt-2 text-xs text-slate">자동 생성 및 재발송 후보 포함</p>
        </article>
        <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
          <p className="text-sm text-slate">실패 건</p>
          <p className="mt-4 text-2xl font-semibold">{summary.failedCount}건</p>
          <p className="mt-2 text-xs text-slate">재검토가 필요한 발송 내역입니다.</p>
        </article>
      </section>

      {!setup.notificationReady ? (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Solapi 설정이 아직 완료되지 않았습니다.</h2>
              <p className="mt-2 leading-7">
                누락된 환경 변수: {setup.missingNotificationKeys.join(", ") || "없음"}
              </p>
            </div>
            <Link
              href="/admin/settings/notifications"
              className="inline-flex items-center rounded-full border border-amber-300 px-4 py-2 font-semibold transition hover:border-amber-500"
            >
              설정 페이지
            </Link>
          </div>
        </section>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {notice}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">수동 발송</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              수험번호를 비워 두면 현재 직렬 전체를 대상으로 미리보기 후 발송합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={previewManualNotification}
            disabled={!sendingEnabled}
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            미리보기 후 발송
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium">알림 유형</label>
            <select
              value={manualType}
              onChange={(event) => setManualType(event.target.value as NotificationType)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            >
              {Object.values(NotificationType).map((type) => (
                <option key={type} value={type}>
                  {NOTIFICATION_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          </div>
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-medium">대상 수험번호</label>
            <input
              value={manualExamNumbers}
              onChange={(event) => setManualExamNumbers(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
              placeholder="비워 두면 현재 직렬 전체 발송, 여러 명은 쉼표나 줄바꿈으로 구분"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">포인트 금액</label>
            <input
              type="number"
              min={0}
              value={manualPointAmount}
              onChange={(event) => setManualPointAmount(event.target.value)}
              disabled={manualType !== NotificationType.POINT}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm disabled:bg-slate-50"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium">메시지</label>
          <textarea
            value={manualMessage}
            onChange={(event) => setManualMessage(event.target.value)}
            rows={4}
            className="w-full rounded-3xl border border-ink/10 px-4 py-3 text-sm"
            placeholder="일반 공지는 직접 입력이 필요합니다. 경고/포인트 알림은 비워 두면 기본 문구를 사용합니다."
          />
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">대기 알림 발송</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              자동 생성된 경고 및 탈락 알림, 실패 후 재발송 대상을 미리 확인합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={previewSelectedLogs}
            disabled={!sendingEnabled || selectedLogIds.length === 0}
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            선택 항목 미리보기
          </button>
        </div>

        <div className="mt-6 overflow-x-auto rounded-[28px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">
                  <input
                    type="checkbox"
                    checked={isAllSelectableChecked}
                    onChange={(event) =>
                      setSelectedLogIds(event.target.checked ? allSelectableLogIds : [])
                    }
                  />
                </th>
                <th className="px-4 py-3 font-semibold">발생 시각</th>
                <th className="px-4 py-3 font-semibold">유형</th>
                <th className="px-4 py-3 font-semibold">수험번호</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">상태</th>
                <th className="px-4 py-3 font-semibold">사유</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {pendingLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate">
                    대기 중인 알림이 없습니다.
                  </td>
                </tr>
              ) : null}
              {pendingLogs.map((log) => {
                const selectable = log.status === "pending" || log.status === "failed";
                return (
                  <tr key={log.id}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedLogIds.includes(log.id)}
                        onChange={() => toggleSelection(log.id)}
                        disabled={!selectable}
                      />
                    </td>
                    <td className="px-4 py-3">{formatDateTime(log.sentAt)}</td>
                    <td className="px-4 py-3">{NOTIFICATION_TYPE_LABEL[log.type]}</td>
                    <td className="px-4 py-3">{log.examNumber}</td>
                    <td className="px-4 py-3">{log.student.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                          SEND_STATUS_CLASS[log.status] ?? SEND_STATUS_CLASS.pending
                        }`}
                      >
                        {SEND_STATUS_LABEL[log.status] ?? log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate">{log.failReason ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">수신 동의 관리</h2>
        <div className="mt-6 overflow-x-auto rounded-[28px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">수험번호</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">연락처</th>
                <th className="px-4 py-3 font-semibold">현재 상태</th>
                <th className="px-4 py-3 font-semibold">수신 동의</th>
                <th className="px-4 py-3 font-semibold">갱신 시각</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {students.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate">
                    조회된 학생이 없습니다.
                  </td>
                </tr>
              ) : null}
              {students.map((student) => (
                <tr key={student.examNumber}>
                  <td className="px-4 py-3">{student.examNumber}</td>
                  <td className="px-4 py-3">{student.name}</td>
                  <td className="px-4 py-3">{student.phone ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[student.currentStatus]}`}
                    >
                      {STATUS_LABEL[student.currentStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={student.notificationConsent}
                        onChange={(event) =>
                          updateConsent(student.examNumber, event.target.checked)
                        }
                        disabled={isPending}
                      />
                      <span>{student.notificationConsent ? "동의" : "미동의"}</span>
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    {student.consentedAt ? formatDateTime(student.consentedAt) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">발송 이력</h2>
        <div className="mt-6 overflow-x-auto rounded-[28px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">발송 시각</th>
                <th className="px-4 py-3 font-semibold">유형</th>
                <th className="px-4 py-3 font-semibold">채널</th>
                <th className="px-4 py-3 font-semibold">수험번호</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">결과</th>
                <th className="px-4 py-3 font-semibold">메시지</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {historyLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate">
                    발송 이력이 없습니다.
                  </td>
                </tr>
              ) : null}
              {historyLogs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3">{formatDateTime(log.sentAt)}</td>
                  <td className="px-4 py-3">{NOTIFICATION_TYPE_LABEL[log.type]}</td>
                  <td className="px-4 py-3">{log.channel}</td>
                  <td className="px-4 py-3">{log.examNumber}</td>
                  <td className="px-4 py-3">{log.student.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                        SEND_STATUS_CLASS[log.status] ?? SEND_STATUS_CLASS.pending
                      }`}
                    >
                      {SEND_STATUS_LABEL[log.status] ?? log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 leading-6 text-slate">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {periods.length > 0 ? (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold">성적 미입력 안내</h2>
          <p className="mt-3 text-sm leading-7 text-slate">
            특정 회차의 미입력 학생을 먼저 조회한 뒤, 안내 메시지를 미리보고 발송합니다.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium">시험 기간</label>
              <select
                value={missingPeriodId}
                onChange={(event) => {
                  setMissingPeriodId(event.target.value);
                  setMissingSessionId("");
                  setMissingStudents(null);
                }}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
              >
                {periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name}
                    {period.isActive ? " (현재 활성)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">회차</label>
              <select
                value={missingSessionId}
                onChange={(event) => {
                  setMissingSessionId(event.target.value);
                  setMissingStudents(null);
                }}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
              >
                <option value="">-- 회차 선택 --</option>
                {missingSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {formatDate(session.examDate)} · {EXAM_TYPE_LABEL[session.examType as ExamType]} · {session.week}주차 · {SUBJECT_LABEL[session.subject]}
                    {session.isCancelled ? " [취소]" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={previewMissingStudents}
                disabled={isPending || !missingSessionId}
                className="w-full rounded-full border border-ink/10 px-4 py-3 text-sm font-semibold transition hover:border-forest/30 hover:text-forest disabled:cursor-not-allowed disabled:opacity-40"
              >
                미입력 학생 조회
              </button>
            </div>
          </div>

          {missingStudents !== null ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-[24px] border border-ink/10 bg-mist p-4">
                <p className="text-sm font-semibold">미입력 학생 {missingStudents.length}명</p>
                <p className="mt-1 text-xs text-slate">
                  수신 동의가 없거나 연락처가 없는 학생은 실제 발송 시 자동 제외됩니다.
                </p>
                <div className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-ink/10 bg-white p-3">
                  <div className="flex flex-wrap gap-2">
                    {missingStudents.length === 0 ? (
                      <span className="text-sm text-slate">모든 학생의 성적이 입력되어 있습니다.</span>
                    ) : (
                      missingStudents.map((student) => (
                        <span
                          key={student.examNumber}
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${
                            student.notificationConsent
                              ? "border-forest/20 bg-forest/10 text-forest"
                              : "border-slate-200 bg-slate-50 text-slate-600"
                          }`}
                        >
                          {student.examNumber} {student.name}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  안내 메시지
                </label>
                <textarea
                  rows={3}
                  value={missingMessage}
                  onChange={(event) => setMissingMessage(event.target.value)}
                  className="w-full rounded-[20px] border border-ink/10 px-4 py-3 text-sm"
                  placeholder={DEFAULT_MISSING_MESSAGE}
                />
              </div>
              <button
                type="button"
                onClick={previewMissingNotification}
                disabled={!sendingEnabled || missingStudents.length === 0}
                className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
              >
                미리보기 후 발송
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {previewModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-4 py-8"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewModal(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-ink/10 px-6 py-5">
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-forest">
                Preview
              </div>
              <h3 className="mt-4 text-2xl font-semibold">{previewModal.title}</h3>
              <p className="mt-2 text-sm leading-7 text-slate">{previewModal.description}</p>
            </div>

            <div className="grid gap-4 border-b border-ink/10 bg-mist/60 px-6 py-5 md:grid-cols-4">
              <article className="rounded-3xl bg-white p-4">
                <p className="text-sm text-slate">전체 대상</p>
                <p className="mt-2 text-2xl font-semibold">{previewModal.response.rows.length}명</p>
              </article>
              <article className="rounded-3xl bg-white p-4">
                <p className="text-sm text-slate">발송 가능</p>
                <p className="mt-2 text-2xl font-semibold text-forest">
                  {previewModal.response.readyCount}명
                </p>
              </article>
              <article className="rounded-3xl bg-white p-4">
                <p className="text-sm text-slate">제외 대상</p>
                <p className="mt-2 text-2xl font-semibold text-slate-700">
                  {previewModal.response.excludedCount}명
                </p>
              </article>
              <article className="rounded-3xl bg-white p-4">
                <p className="text-sm text-slate">학생 없음</p>
                <p className="mt-2 text-2xl font-semibold text-red-700">
                  {previewModal.response.missingExamNumbers.length}명
                </p>
              </article>
            </div>

            <div className="max-h-[50vh] overflow-auto px-6 py-5">
              {previewModal.response.messageSamples.length > 0 ? (
                <div className="mb-5 rounded-[24px] border border-ink/10 bg-mist p-4">
                  <p className="text-sm font-semibold">메시지 예시</p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-slate">
                    {previewModal.response.messageSamples.map((sample) => (
                      <p key={sample} className="rounded-2xl bg-white px-4 py-3">
                        {sample}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              {previewModal.response.missingExamNumbers.length > 0 ? (
                <div className="mb-5 rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  학생 DB에 없는 수험번호: {previewModal.response.missingExamNumbers.join(", ")}
                </div>
              ) : null}

              <div className="overflow-x-auto rounded-[24px] border border-ink/10">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist/80 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold">상태</th>
                      <th className="px-4 py-3 font-semibold">유형</th>
                      <th className="px-4 py-3 font-semibold">수험번호</th>
                      <th className="px-4 py-3 font-semibold">이름</th>
                      <th className="px-4 py-3 font-semibold">연락처</th>
                      <th className="px-4 py-3 font-semibold">현재 상태</th>
                      <th className="px-4 py-3 font-semibold">제외 사유</th>
                      <th className="px-4 py-3 font-semibold">메시지</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10 bg-white">
                    {previewModal.response.rows.map((row) => (
                      <tr key={`${row.logId ?? row.examNumber}-${row.notificationType}`}>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${PREVIEW_STATE_CLASS[row.state]}`}
                          >
                            {PREVIEW_STATE_LABEL[row.state]}
                          </span>
                        </td>
                        <td className="px-4 py-3">{NOTIFICATION_TYPE_LABEL[row.notificationType]}</td>
                        <td className="px-4 py-3">{row.examNumber}</td>
                        <td className="px-4 py-3">{row.name}</td>
                        <td className="px-4 py-3">{row.phone ?? "-"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[row.currentStatus]}`}
                          >
                            {STATUS_LABEL[row.currentStatus]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate">{row.exclusionReason ?? "-"}</td>
                        <td className="px-4 py-3 whitespace-pre-wrap leading-6 text-slate">
                          {row.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-ink/10 px-6 py-5">
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ink/30"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={confirmPreviewSend}
                disabled={isPending || previewModal.response.readyCount === 0}
                className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
              >
                {previewModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
