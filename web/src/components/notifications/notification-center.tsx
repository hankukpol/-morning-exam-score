"use client";

import {
  ExamType,
  NotificationType,
  StudentStatus,
} from "@/generated/prisma";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from "@/lib/analytics/presentation";
import { EXAM_TYPE_LABEL, NOTIFICATION_TYPE_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import Link from "next/link";
import { useState, useTransition } from "react";

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
};

type CenterPayload = Omit<NotificationCenterProps, "filters">;

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

function parseExamNumbers(input: string) {
  return input
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function NotificationCenter({
  filters,
  setup,
  summary: initialSummary,
  students: initialStudents,
  pendingLogs: initialPendingLogs,
  historyLogs: initialHistoryLogs,
}: NotificationCenterProps) {
  const [students, setStudents] = useState(initialStudents);
  const [pendingLogs, setPendingLogs] = useState(initialPendingLogs);
  const [historyLogs, setHistoryLogs] = useState(initialHistoryLogs);
  const [summary, setSummary] = useState(initialSummary);
  const [selectedLogIds, setSelectedLogIds] = useState(
    initialPendingLogs.map((log) => log.id),
  );
  const [manualType, setManualType] = useState<NotificationType>(NotificationType.NOTICE);
  const [manualMessage, setManualMessage] = useState("");
  const [manualExamNumbers, setManualExamNumbers] = useState("");
  const [manualPointAmount, setManualPointAmount] = useState("10000");
  const [notice, setNotice] = useState<string | null>(null);
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
      throw new Error(payload.error ?? "요청에 실패했습니다.");
    }

    return payload;
  }

  function setMessage(nextNotice: string | null, nextError: string | null) {
    setNotice(nextNotice);
    setErrorMessage(nextError);
  }

  async function refreshCenter() {
    const params = new URLSearchParams({
      examType: filters.examType,
    });

    if (filters.search) {
      params.set("search", filters.search);
    }

    const payload = (await fetch(`/api/notifications/logs?${params.toString()}`, {
      cache: "no-store",
    }).then(async (response) => ({
      ok: response.ok,
      body: await response.json(),
    }))) as { ok: boolean; body: { error?: string } & CenterPayload };

    if (!payload.ok) {
      throw new Error(payload.body.error ?? "알림 데이터를 다시 불러오지 못했습니다.");
    }

    setStudents(
      payload.body.students.map((student) => ({
        ...student,
        consentedAt: student.consentedAt ? String(student.consentedAt) : null,
      })),
    );
    setPendingLogs(
      payload.body.pendingLogs.map((log) => ({
        ...log,
        sentAt: String(log.sentAt),
      })),
    );
    setHistoryLogs(
      payload.body.historyLogs.map((log) => ({
        ...log,
        sentAt: String(log.sentAt),
      })),
    );
    setSummary(payload.body.summary);
    setSelectedLogIds(
      payload.body.pendingLogs
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

  function updateConsent(examNumber: string, consent: boolean) {
    setMessage(null, null);

    startTransition(async () => {
      try {
        await requestJson("/api/notifications/consent", {
          method: "POST",
          body: JSON.stringify({
            examNumber,
            consent,
          }),
        });
        setStudents((current) =>
          current.map((student) =>
            student.examNumber === examNumber
              ? {
                  ...student,
                  notificationConsent: consent,
                  consentedAt: consent ? new Date().toISOString() : null,
                }
              : student,
          ),
        );
        await refreshCenter();
        setMessage("수신 동의 상태를 저장했습니다.", null);
      } catch (error) {
        setMessage(
          null,
          error instanceof Error ? error.message : "수신 동의 상태를 저장하지 못했습니다.",
        );
      }
    });
  }

  function sendSelectedLogs() {
    if (selectedLogIds.length === 0) {
      setMessage(null, "발송할 알림을 선택하세요.");
      return;
    }

    setMessage(null, null);

    startTransition(async () => {
      try {
        const result = await requestJson("/api/notifications/send", {
          method: "POST",
          body: JSON.stringify({
            logIds: selectedLogIds,
          }),
        });

        await refreshCenter();
        setMessage(
          `발송 완료 ${result.sentCount}건, 실패 ${result.failedCount}건, 제외 ${result.skippedCount}건`,
          null,
        );
      } catch (error) {
        setMessage(
          null,
          error instanceof Error ? error.message : "대기 알림 발송에 실패했습니다.",
        );
      }
    });
  }

  function sendManualNotification() {
    setMessage(null, null);

    startTransition(async () => {
      try {
        const result = await requestJson("/api/notifications/send", {
          method: "POST",
          body: JSON.stringify({
            type: manualType,
            message: manualMessage,
            examType: filters.examType,
            examNumbers: parseExamNumbers(manualExamNumbers),
            pointAmount:
              manualType === NotificationType.POINT ? Number(manualPointAmount) : null,
          }),
        });

        setManualMessage("");
        setManualExamNumbers("");
        await refreshCenter();
        setMessage(
          `수동 발송 완료 ${result.sentCount}건, 실패 ${result.failedCount}건, 제외 ${result.skippedCount}건`,
          null,
        );
      } catch (error) {
        setMessage(
          null,
          error instanceof Error ? error.message : "수동 알림 발송에 실패했습니다.",
        );
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
          <p className="mt-2 text-xs text-slate">동의 미설정 또는 연락처 누락 {summary.excludedStudents}명</p>
        </article>
        <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
          <p className="text-sm text-slate">대기 중</p>
          <p className="mt-4 text-2xl font-semibold">{summary.pendingCount}건</p>
          <p className="mt-2 text-xs text-slate">자동 큐 + 수동 큐 포함</p>
        </article>
        <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
          <p className="text-sm text-slate">재시도 필요</p>
          <p className="mt-4 text-2xl font-semibold">{summary.failedCount}건</p>
          <p className="mt-2 text-xs text-slate">실패 로그만 모아서 재발송할 수 있습니다.</p>
        </article>
      </section>

      {!setup.notificationReady ? (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Solapi 설정이 아직 완성되지 않았습니다.</h2>
              <p className="mt-2 leading-7">
                누락된 키: {setup.missingNotificationKeys.join(", ") || "-"}
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
              개별 수험번호를 지정하지 않으면 현재 직렬 전체를 대상으로 발송합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={sendManualNotification}
            disabled={isPending}
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            수동 발송 실행
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
              placeholder="비워두면 현재 직렬 전체 발송, 여러 명은 쉼표로 구분"
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
            placeholder="NOTICE는 메시지 입력이 필수입니다. WARNING/POINT는 비워두면 기본 문구를 사용합니다."
          />
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">자동 발송 큐</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              상태 변경으로 생성된 경고/탈락 알림과 실패 후 재시도 대상을 모아둡니다.
            </p>
          </div>
          <button
            type="button"
            onClick={sendSelectedLogs}
            disabled={isPending || pendingLogs.length === 0}
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            선택 발송
          </button>
        </div>

        <div className="mt-6 overflow-x-auto rounded-[28px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">선택</th>
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
              {pendingLogs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedLogIds.includes(log.id)}
                      onChange={() => toggleSelection(log.id)}
                    />
                  </td>
                  <td className="px-4 py-3">{formatDateTime(log.sentAt)}</td>
                  <td className="px-4 py-3">{NOTIFICATION_TYPE_LABEL[log.type]}</td>
                  <td className="px-4 py-3">{log.examNumber}</td>
                  <td className="px-4 py-3">{log.student.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${SEND_STATUS_CLASS[log.status] ?? SEND_STATUS_CLASS.pending}`}
                    >
                      {SEND_STATUS_LABEL[log.status] ?? log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate">{log.failReason ?? "-"}</td>
                </tr>
              ))}
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
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${SEND_STATUS_CLASS[log.status] ?? SEND_STATUS_CLASS.pending}`}
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
    </div>
  );
}
