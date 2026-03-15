"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import { fetchJson } from "@/lib/client/fetch-json";
import {
  ATTEND_TYPE_LABEL,
  EXAM_TYPE_LABEL,
  SUBJECT_LABEL,
} from "@/lib/constants";
import { formatDate, todayDateInputValue } from "@/lib/format";
import type {
  OfflineScorePreview,
  OnlineScorePreview,
  ScorePreviewResult,
  ScoreResolutionInput,
} from "@/lib/scores/service";

const KO_MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const KO_DAYS = ["일","월","화","수","목","금","토"];

type PeriodOption = {
  id: number;
  name: string;
  isActive: boolean;
  sessions: Array<{
    id: number;
    examType: keyof typeof EXAM_TYPE_LABEL;
    week: number;
    subject: keyof typeof SUBJECT_LABEL;
    examDate: string;
    isCancelled: boolean;
  }>;
};

type ScoreInputWorkbenchProps = {
  periods: PeriodOption[];
};

type ExecuteImportResult = {
  createdCount: number;
  updatedCount: number;
  boundOnlineIdCount?: number;
  autoCreatedStudentCount?: number;
};

type ConfirmModalState = {
  title: string;
  description: string;
  details: string[];
  confirmLabel: string;
  onConfirm: () => void;
};

type CompletionModalState = {
  title: string;
  description: string;
  details: string[];
};

const tabs = [
  { key: "offline", label: "오프라인 파일" },
  { key: "online", label: "온라인 파일" },
  { key: "paste", label: "직접 붙여넣기" },
] as const;

function statusLabel(status: ScorePreviewResult["rows"][number]["status"]) {
  if (status === "ready") return "신규";
  if (status === "overwrite") return "덮어쓰기";
  if (status === "resolve") return "확인 필요";
  return "제외";
}

function statusClass(status: ScorePreviewResult["rows"][number]["status"]) {
  if (status === "ready") return "bg-forest/10 text-forest";
  if (status === "overwrite") return "bg-ember/10 text-ember";
  if (status === "resolve") return "bg-sky-50 text-sky-700";
  return "bg-red-50 text-red-700";
}

function formatOxSessionLabel(session: PeriodOption["sessions"][number]) {
  return `${session.examDate.slice(0, 10)} · ${EXAM_TYPE_LABEL[session.examType]} · ${SUBJECT_LABEL[session.subject]} · ${session.week}주차${session.isCancelled ? " (취소)" : ""}`;
}

function sessionDateKey(session: PeriodOption["sessions"][number]) {
  return session.examDate.slice(0, 10);
}

function findTodaySession(
  sessions: PeriodOption["sessions"],
  todayKey: string,
) {
  return sessions.find((session) => sessionDateKey(session) === todayKey) ?? null;
}

function getDefaultSessionId(period: PeriodOption | null, todayKey: string) {
  if (!period) {
    return null;
  }

  return findTodaySession(period.sessions, todayKey)?.id ?? period.sessions[0]?.id ?? null;
}

function getCalendarTargetSession(
  sessions: PeriodOption["sessions"],
  selectedSessionId: number | null,
  todayKey: string,
) {
  return (
    sessions.find((session) => session.id === selectedSessionId) ??
    findTodaySession(sessions, todayKey) ??
    sessions[0] ??
    null
  );
}

function SummaryCards({ preview }: { preview: ScorePreviewResult }) {
  return (
    <div className="grid gap-4 md:grid-cols-5">
      <article className="rounded-[24px] border border-ink/10 bg-white p-5">
        <p className="text-sm text-slate">전체 행</p>
        <p className="mt-3 text-3xl font-semibold">{preview.summary.totalRows}</p>
      </article>
      <article className="rounded-[24px] border border-ink/10 bg-white p-5">
        <p className="text-sm text-slate">신규</p>
        <p className="mt-3 text-3xl font-semibold text-forest">{preview.summary.readyRows}</p>
      </article>
      <article className="rounded-[24px] border border-ink/10 bg-white p-5">
        <p className="text-sm text-slate">덮어쓰기</p>
        <p className="mt-3 text-3xl font-semibold text-ember">{preview.summary.overwriteRows}</p>
      </article>
      <article className="rounded-[24px] border border-ink/10 bg-white p-5">
        <p className="text-sm text-slate">확인 필요</p>
        <p className="mt-3 text-3xl font-semibold text-sky-700">{preview.summary.resolveRows}</p>
      </article>
      <article className="rounded-[24px] border border-ink/10 bg-white p-5">
        <p className="text-sm text-slate">제외</p>
        <p className="mt-3 text-3xl font-semibold text-red-700">{preview.summary.invalidRows}</p>
      </article>
    </div>
  );
}

function PreviewTable({
  preview,
  source,
  onlineResolutions,
  setOnlineResolutions,
}: {
  preview: ScorePreviewResult;
  source: "offline" | "online" | "paste";
  onlineResolutions: ScoreResolutionInput;
  setOnlineResolutions: React.Dispatch<React.SetStateAction<ScoreResolutionInput>>;
}) {
  return (
    <div className="space-y-6">
      <SummaryCards preview={preview} />
      <div className="rounded-[24px] border border-ink/10 bg-mist px-5 py-4 text-sm text-slate">
        문항 {preview.summary.questionCount}개 / 답안 {preview.summary.answerCount}건 감지
      </div>
      <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">행</th>
                <th className="px-4 py-3 font-semibold">상태</th>
                {source === "online" ? (
                  <th className="px-4 py-3 font-semibold">온라인 ID</th>
                ) : null}
                <th className="px-4 py-3 font-semibold">수험번호</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">원점수</th>
                <th className="px-4 py-3 font-semibold">OX/추가</th>
                <th className="px-4 py-3 font-semibold">최종점수</th>
                <th className="px-4 py-3 font-semibold">매칭</th>
                {source === "online" ? (
                  <th className="px-4 py-3 font-semibold">onlineId 저장</th>
                ) : null}
                <th className="px-4 py-3 font-semibold">메모</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 bg-white">
              {preview.rows.map((row) => (
                <tr key={row.rowKey}>
                  <td className="px-4 py-3">{row.rowNumber}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  {source === "online" ? (
                    <td className="px-4 py-3 font-medium">{row.onlineId ?? "-"}</td>
                  ) : null}
                  <td className="px-4 py-3 font-medium">{row.examNumber ?? "-"}</td>
                  <td className="px-4 py-3">{row.name || row.matchedStudent?.name || "-"}</td>
                  <td className="px-4 py-3">{row.rawScore ?? "-"}</td>
                  <td className="px-4 py-3">{row.oxScore ?? "-"}</td>
                  <td className="px-4 py-3">{row.finalScore ?? "-"}</td>
                  <td className="px-4 py-3">
                    {row.matchedStudent ? (
                      <div className="text-xs leading-6">
                        <div>{row.matchedStudent.examNumber}</div>
                        <div className="text-slate">{row.matchedStudent.name}</div>
                        {row.willCreateStudent ? <div className="text-forest">반영 시 학생 자동 생성</div> : null}
                      </div>
                    ) : row.status === "resolve" && row.candidates.length > 0 ? (
                      <select
                        value={onlineResolutions[row.rowKey]?.examNumber ?? ""}
                        onChange={(event) =>
                          setOnlineResolutions((current) => ({
                            ...current,
                            [row.rowKey]: {
                              ...current[row.rowKey],
                              examNumber: event.target.value || undefined,
                            },
                          }))
                        }
                        className="rounded-xl border border-ink/10 px-3 py-2 text-sm"
                      >
                        <option value="">수강생 선택</option>
                        {row.candidates.map((candidate) => (
                          <option key={candidate.examNumber} value={candidate.examNumber}>
                            {candidate.examNumber} / {candidate.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-slate">-</span>
                    )}
                  </td>
                  {source === "online" ? (
                    <td className="px-4 py-3">
                      {row.onlineId && (row.matchedStudent || onlineResolutions[row.rowKey]?.examNumber) ? (
                        <label className="inline-flex items-center gap-2 text-xs text-slate">
                          <input
                            type="checkbox"
                            checked={onlineResolutions[row.rowKey]?.bindOnlineId ?? row.bindOnlineId}
                            onChange={(event) =>
                              setOnlineResolutions((current) => ({
                                ...current,
                                [row.rowKey]: {
                                  ...current[row.rowKey],
                                  bindOnlineId: event.target.checked,
                                },
                              }))
                            }
                          />
                          저장
                        </label>
                      ) : (
                        <span className="text-slate">-</span>
                      )}
                    </td>
                  ) : null}
                  <td className="px-4 py-3 text-slate">
                    {row.issues.length > 0
                      ? row.issues.join(", ")
                      : row.willCreateStudent
                        ? "학생 자동 생성 후 반영"
                        : row.hasExistingScore
                          ? "기존 점수 덮어쓰기"
                          : "정상"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SessionCalendar({
  sessions,
  selectedSessionId,
  onSelect,
}: {
  sessions: PeriodOption["sessions"];
  selectedSessionId: number | null;
  onSelect: (id: number) => void;
}) {
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, PeriodOption["sessions"]>();
    for (const s of sessions) {
      const key = sessionDateKey(s);
      const existing = map.get(key) ?? [];
      existing.push(s);
      map.set(key, existing);
    }
    return map;
  }, [sessions]);
  const todayKey = todayDateInputValue();

  const [viewYear, setViewYear] = useState(() => {
    const target = getCalendarTargetSession(sessions, selectedSessionId, todayKey);
    return target ? Number(target.examDate.slice(0, 4)) : new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const target = getCalendarTargetSession(sessions, selectedSessionId, todayKey);
    return target ? Number(target.examDate.slice(5, 7)) - 1 : new Date().getMonth();
  });
  const [activeDateKey, setActiveDateKey] = useState<string | null>(() => {
    const target = getCalendarTargetSession(sessions, selectedSessionId, todayKey);
    return target ? sessionDateKey(target) : null;
  });

  useEffect(() => {
    const target = getCalendarTargetSession(sessions, selectedSessionId, todayKey);
    setActiveDateKey(target ? sessionDateKey(target) : null);
    if (target) {
      setViewYear(Number(target.examDate.slice(0, 4)));
      setViewMonth(Number(target.examDate.slice(5, 7)) - 1);
    }
  }, [selectedSessionId, sessions, todayKey]);

  const gridCells = useMemo(() => {
    const firstDow = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<{ dateKey: string; dayNum: number } | null> = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        dateKey: `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        dayNum: d,
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const activeSessions = activeDateKey ? (sessionsByDate.get(activeDateKey) ?? []) : [];

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  if (sessions.length === 0) {
    return <p className="py-4 text-center text-sm text-slate">이 기간에 시험 회차가 없습니다.</p>;
  }

  return (
    <div className="select-none space-y-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={prevMonth} className="rounded-lg px-2 py-1 text-slate transition hover:bg-ink/5">◀</button>
        <span className="text-sm font-semibold">{viewYear}년 {KO_MONTHS[viewMonth]}</span>
        <button type="button" onClick={nextMonth} className="rounded-lg px-2 py-1 text-slate transition hover:bg-ink/5">▶</button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs font-medium text-slate">
        {KO_DAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {gridCells.map((cell, i) => {
          if (!cell) return <div key={`e${i}`} className="h-9" />;
          const cellSessions = sessionsByDate.get(cell.dateKey) ?? [];
          const hasSessions = cellSessions.length > 0;
          const isActive = cell.dateKey === activeDateKey;
          const dow = i % 7;
          const textColor = dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-600" : "";
          return (
            <button
              key={cell.dateKey}
              type="button"
              disabled={!hasSessions}
              onClick={() => {
                setActiveDateKey(cell.dateKey);
                if (cellSessions.length === 1) {
                  onSelect(cellSessions[0].id);
                } else if (cellSessions.length > 1) {
                  const already = cellSessions.find((s) => s.id === selectedSessionId);
                  onSelect(already ? already.id : cellSessions[0].id);
                }
              }}
              className={`flex h-9 flex-col items-center justify-center rounded-xl text-sm transition
                ${isActive
                  ? "bg-ink font-semibold text-white"
                  : hasSessions
                    ? `bg-forest/10 font-semibold hover:bg-forest/20 ${textColor || "text-forest"}`
                    : `cursor-default ${dow === 0 ? "text-red-200" : dow === 6 ? "text-blue-200" : "text-ink/20"}`
                }`}
            >
              {cell.dayNum}
            </button>
          );
        })}
      </div>
      {activeSessions.length > 1 && (
        <div className="flex flex-wrap gap-2 border-t border-ink/10 pt-3">
          {activeSessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition
                ${selectedSessionId === s.id
                  ? "bg-ink text-white"
                  : "border border-ink/10 text-ink hover:border-ember/30 hover:text-ember"
                }
                ${s.isCancelled ? "opacity-50" : ""}`}
            >
              {EXAM_TYPE_LABEL[s.examType]} / {SUBJECT_LABEL[s.subject]}
              {s.isCancelled ? " (취소)" : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScoreInputWorkbench({ periods }: ScoreInputWorkbenchProps) {
  const todayKey = todayDateInputValue();
  const initialPeriodId = periods.find((period) => period.isActive)?.id ?? periods[0]?.id ?? null;
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(initialPeriodId);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(() =>
    getDefaultSessionId(
      periods.find((period) => period.id === initialPeriodId) ?? null,
      todayKey,
    ),
  );
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["key"]>("offline");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [completionModal, setCompletionModal] = useState<CompletionModalState | null>(null);
  const [offlineAttendType, setOfflineAttendType] = useState<keyof typeof ATTEND_TYPE_LABEL>("NORMAL");
  const [offlineMainFile, setOfflineMainFile] = useState<File | null>(null);
  const [offlineAnalysisFile, setOfflineAnalysisFile] = useState<File | null>(null);
  const [offlineOxSessionId, setOfflineOxSessionId] = useState<number | null>(null);
  const [offlineMainPreview, setOfflineMainPreview] = useState<ScorePreviewResult | null>(null);
  const [offlineOxPreview, setOfflineOxPreview] = useState<ScorePreviewResult | null>(null);
  const [onlineAttendType, setOnlineAttendType] = useState<keyof typeof ATTEND_TYPE_LABEL>("LIVE");
  const [onlineMainFile, setOnlineMainFile] = useState<File | null>(null);
  const [onlineDetailFile, setOnlineDetailFile] = useState<File | null>(null);
  const [onlineOxSessionId, setOnlineOxSessionId] = useState<number | null>(null);
  const [onlineOxMainFile, setOnlineOxMainFile] = useState<File | null>(null);
  const [onlineOxDetailFile, setOnlineOxDetailFile] = useState<File | null>(null);
  const [onlineMainPreview, setOnlineMainPreview] = useState<ScorePreviewResult | null>(null);
  const [onlineOxPreview, setOnlineOxPreview] = useState<ScorePreviewResult | null>(null);
  const [onlineResolutions, setOnlineResolutions] = useState<ScoreResolutionInput>({});
  const [pasteAttendType, setPasteAttendType] = useState<keyof typeof ATTEND_TYPE_LABEL>("NORMAL");
  const [pasteText, setPasteText] = useState("");
  const [pastePreview, setPastePreview] = useState<ScorePreviewResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId],
  );
  const selectedSession = useMemo(
    () => selectedPeriod?.sessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedPeriod, selectedSessionId],
  );
  const isCumulativeSession = selectedSession?.subject === "CUMULATIVE";
  const oxAutoOptionLabel = isCumulativeSession
    ? "자동 연동 없음 (누적 모의고사 회차)"
    : "자동 연동 (같은 날짜 경찰학 회차)";
  const oxRuleHint = isCumulativeSession
    ? "목요일 누적 모의고사는 경찰학 OX가 없어 자동/수동 연동이 모두 비활성화됩니다."
    : "비워두면 같은 날짜의 경찰학 회차로 자동 연동됩니다. 다른 날짜로 보낼 때만 직접 선택해 주세요.";

  const oxSessionOptions = useMemo(() => {
    if (!selectedPeriod || !selectedSession) {
      return [];
    }

    return selectedPeriod.sessions.filter(
      (session) =>
        session.examType === selectedSession.examType &&
        session.subject === "POLICE_SCIENCE" &&
        !session.isCancelled,
    );
  }, [selectedPeriod, selectedSession]);

  useEffect(() => {
    if (!selectedPeriod?.sessions.length) {
      setSelectedSessionId(null);
      return;
    }

    const exists = selectedPeriod.sessions.some((session) => session.id === selectedSessionId);
    if (!exists) {
      setSelectedSessionId(getDefaultSessionId(selectedPeriod, todayKey));
    }
  }, [selectedPeriod, selectedSessionId, todayKey]);

  useEffect(() => {
    setOfflineMainPreview(null);
    setOfflineOxPreview(null);
    setOnlineMainPreview(null);
    setOnlineOxPreview(null);
    setPastePreview(null);
    setOnlineResolutions({});
  }, [selectedSessionId]);

  useEffect(() => {
    if (!isCumulativeSession) {
      return;
    }

    setOfflineOxSessionId(null);
    setOnlineOxSessionId(null);
  }, [isCumulativeSession]);

  useEffect(() => {
    if (offlineOxSessionId && !oxSessionOptions.some((session) => session.id === offlineOxSessionId)) {
      setOfflineOxSessionId(null);
    }
    if (onlineOxSessionId && !oxSessionOptions.some((session) => session.id === onlineOxSessionId)) {
      setOnlineOxSessionId(null);
    }
  }, [offlineOxSessionId, onlineOxSessionId, oxSessionOptions]);

  async function requestJson<T>(url: string, init?: RequestInit) {
    return fetchJson<T>(url, init, {
      defaultError: "요청에 실패했습니다.",
      timeoutError:
        "서버 처리 시간이 너무 오래 걸렸습니다. 저장 범위를 줄이거나 잠시 후 다시 시도해 주세요.",
    });
  }

  function run(action: () => Promise<void>) {
    setNotice(null);
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await action();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "요청 처리 중 오류가 발생했습니다.");
      }
    });
  }

  function openConfirmModal(modal: ConfirmModalState) {
    setConfirmModal(modal);
  }

  function closeConfirmModal() {
    if (!isPending) {
      setConfirmModal(null);
    }
  }

  function openCompletionModal(title: string, description: string, details: string[]) {
    setCompletionModal({ title, description, details });
  }

  function closeCompletionModal() {
    setCompletionModal(null);
  }

  function formatSessionSummary() {
    if (!selectedSession) {
      return "회차 미선택";
    }

    return selectedSession.examDate.slice(0, 10) + " · " + EXAM_TYPE_LABEL[selectedSession.examType] + " · " + SUBJECT_LABEL[selectedSession.subject] + " · " + selectedSession.week + "주차";
  }

  function buildPreviewDetail(label: string, preview: ScorePreviewResult) {
    const targetCount = preview.summary.readyRows + preview.summary.overwriteRows;
    return label + " 반영 대상 " + targetCount + "건 / 확인 필요 " + preview.summary.resolveRows + "건 / 제외 " + preview.summary.invalidRows + "건";
  }

  function buildExecuteDetail(label: string, result: ExecuteImportResult) {
    const parts = [label + " 신규 " + result.createdCount + "건", "업데이트 " + result.updatedCount + "건"];

    if (result.boundOnlineIdCount) {
      parts.push("onlineId 저장 " + result.boundOnlineIdCount + "건");
    }

    if (result.autoCreatedStudentCount) {
      parts.push("학생 자동 생성 " + result.autoCreatedStudentCount + "건");
    }

    return parts.join(" / ");
  }

  function buildOfflineFormData(mode: "preview" | "execute") {
    const formData = new FormData();
    formData.append("mode", mode);
    formData.append("sessionId", String(selectedSessionId));
    formData.append("attendType", offlineAttendType);
    if (offlineMainFile) formData.append("mainFile", offlineMainFile);
    if (offlineAnalysisFile) formData.append("analysisFile", offlineAnalysisFile);
    if (offlineOxSessionId) formData.append("oxSessionId", String(offlineOxSessionId));
    return formData;
  }

  function buildOnlineFormData(mode: "preview" | "execute") {
    const formData = new FormData();
    formData.append("mode", mode);
    formData.append("sessionId", String(selectedSessionId));
    formData.append("attendType", onlineAttendType);
    formData.append("resolutions", JSON.stringify(onlineResolutions));
    if (onlineMainFile) formData.append("mainFile", onlineMainFile);
    if (onlineDetailFile) formData.append("detailFile", onlineDetailFile);
    if (onlineOxSessionId) formData.append("oxSessionId", String(onlineOxSessionId));
    if (onlineOxMainFile) formData.append("oxMainFile", onlineOxMainFile);
    if (onlineOxDetailFile) formData.append("oxDetailFile", onlineOxDetailFile);
    return formData;
  }

  async function previewOfflineUpload() {
    const payload = (await requestJson("/api/scores/upload/offline", {
      method: "POST",
      body: buildOfflineFormData("preview"),
    })) as OfflineScorePreview;

    setOfflineMainPreview(payload.main);
    setOfflineOxPreview(payload.ox);
    setNotice("오프라인 파일 미리보기를 생성했습니다.");
  }

  async function executeOfflineUpload() {
    const payload = (await requestJson("/api/scores/upload/offline", {
      method: "POST",
      body: buildOfflineFormData("execute"),
    })) as { main: ExecuteImportResult; ox: ExecuteImportResult | null };

    const details = [buildExecuteDetail("일반", payload.main)];
    if (payload.ox) {
      details.push(buildExecuteDetail("OX", payload.ox));
    }

    setNotice("반영 완료: " + details.join(" | "));
    openCompletionModal("오프라인 성적 반영 완료", "오프라인 업로드 데이터를 정상적으로 반영했습니다.", details);
    setOfflineMainPreview(null);
    setOfflineOxPreview(null);
  }

  function requestOfflineExecute() {
    if (!offlineMainPreview) {
      return;
    }

    const details = [formatSessionSummary(), buildPreviewDetail("일반", offlineMainPreview)];
    if (offlineOxPreview) {
      details.push(buildPreviewDetail("OX", offlineOxPreview));
    }

    openConfirmModal({
      title: "오프라인 성적 반영",
      description: "미리보기 결과를 기준으로 성적 데이터를 실제 회차에 저장합니다.",
      details,
      confirmLabel: "반영 시작",
      onConfirm: () => {
        setConfirmModal(null);
        run(executeOfflineUpload);
      },
    });
  }

  async function previewOnlineUpload() {
    const payload = (await requestJson("/api/scores/upload/online", {
      method: "POST",
      body: buildOnlineFormData("preview"),
    })) as OnlineScorePreview;

    setOnlineMainPreview(payload.main);
    setOnlineOxPreview(payload.ox);
    setNotice("온라인 파일 미리보기를 생성했습니다.");
  }

  async function executeOnlineUpload() {
    const payload = (await requestJson("/api/scores/upload/online", {
      method: "POST",
      body: buildOnlineFormData("execute"),
    })) as { main: ExecuteImportResult; ox: ExecuteImportResult | null };

    const details = [buildExecuteDetail("일반", payload.main)];
    if (payload.ox) {
      details.push(buildExecuteDetail("OX", payload.ox));
    }

    setNotice("반영 완료: " + details.join(" | "));
    openCompletionModal("온라인 성적 반영 완료", "온라인 업로드 데이터를 정상적으로 반영했습니다.", details);
    setOnlineMainPreview(null);
    setOnlineOxPreview(null);
    setOnlineResolutions({});
  }

  function requestOnlineExecute() {
    if (!onlineMainPreview) {
      return;
    }

    const details = [formatSessionSummary(), buildPreviewDetail("일반", onlineMainPreview)];
    if (onlineOxPreview) {
      details.push(buildPreviewDetail("OX", onlineOxPreview));
    }

    openConfirmModal({
      title: "온라인 성적 반영",
      description: "미리보기 결과와 선택한 매칭 기준으로 성적 데이터를 저장합니다.",
      details,
      confirmLabel: "반영 시작",
      onConfirm: () => {
        setConfirmModal(null);
        run(executeOnlineUpload);
      },
    });
  }

  async function previewPasteUpload() {
    const payload = (await requestJson("/api/scores/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "preview",
        sessionId: selectedSessionId,
        text: pasteText,
        attendType: pasteAttendType,
      }),
    })) as ScorePreviewResult;

    setPastePreview(payload);
    setNotice("붙여넣기 미리보기를 생성했습니다.");
  }

  async function executePasteUpload() {
    const payload = (await requestJson("/api/scores/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "execute",
        sessionId: selectedSessionId,
        text: pasteText,
        attendType: pasteAttendType,
      }),
    })) as ExecuteImportResult;

    const details = [buildExecuteDetail("직접 입력", payload)];
    setNotice("반영 완료: " + details[0]);
    openCompletionModal("직접 입력 성적 반영 완료", "붙여넣기 데이터를 정상적으로 반영했습니다.", details);
    setPastePreview(null);
  }

  function requestPasteExecute() {
    if (!pastePreview) {
      return;
    }

    openConfirmModal({
      title: "직접 입력 성적 반영",
      description: "붙여넣기 미리보기 기준으로 성적 데이터를 저장합니다.",
      details: [formatSessionSummary(), buildPreviewDetail("직접 입력", pastePreview)],
      confirmLabel: "반영 시작",
      onConfirm: () => {
        setConfirmModal(null);
        run(executePasteUpload);
      },
    });
  }

  if (periods.length === 0) {
    return <div className="rounded-[28px] border border-dashed border-ink/20 bg-white px-6 py-12 text-center text-sm text-slate">먼저 시험 기간과 회차를 생성하세요.</div>;
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
        <div className="grid gap-6 md:grid-cols-[260px_1fr]">
          <div>
            <label className="mb-2 block text-sm font-medium">시험 기간</label>
            <select value={selectedPeriodId ?? ""} onChange={(event) => setSelectedPeriodId(Number(event.target.value))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm">
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}{period.isActive ? " ✓" : ""}
                </option>
              ))}
            </select>
            {selectedSession ? (
              <div className="mt-4 rounded-[20px] border border-ink/10 bg-white p-4 text-sm leading-7 text-slate">
                <div className="font-semibold text-ink">{SUBJECT_LABEL[selectedSession.subject]}</div>
                <div>{EXAM_TYPE_LABEL[selectedSession.examType]} · {selectedSession.week}주차</div>
                <div>{formatDate(selectedSession.examDate)}</div>
                {selectedSession.isCancelled ? <div className="mt-1 font-semibold text-red-500">취소된 회차</div> : null}
              </div>
            ) : (
              <div className="mt-4 rounded-[20px] border border-dashed border-ink/20 bg-white p-4 text-center text-sm text-slate">
                날짜를 선택하세요
              </div>
            )}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">시험 회차</label>
            <div className="rounded-2xl border border-ink/10 bg-white p-4">
              <SessionCalendar
                key={selectedPeriodId ?? 0}
                sessions={selectedPeriod?.sessions ?? []}
                selectedSessionId={selectedSessionId}
                onSelect={setSelectedSessionId}
              />
            </div>
          </div>
        </div>
      </section>
      {notice ? <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">{notice}</div> : null}
      {errorMessage ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeTab === tab.key ? "bg-ink text-white" : "border border-ink/10 text-ink hover:border-ember/30 hover:text-ember"}`}>
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === "offline" ? (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]">
              <select value={offlineAttendType} onChange={(event) => setOfflineAttendType(event.target.value as keyof typeof ATTEND_TYPE_LABEL)} className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm">
                {Object.entries(ATTEND_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-ink">성적 원본 파일 <span className="font-normal text-red-500">*필수</span></span>
                <input type="file" accept=".xls,.xlsx" onChange={(event) => { setOfflineMainFile(event.target.files?.[0] ?? null); setOfflineMainPreview(null); setOfflineOxPreview(null); }} className="block w-full rounded-2xl border border-dashed border-ink/20 bg-mist px-4 py-4 text-sm" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-ink">문항분석 파일 <span className="font-normal text-slate">(선택)</span></span>
                <input type="file" accept=".xls,.xlsx" onChange={(event) => { setOfflineAnalysisFile(event.target.files?.[0] ?? null); setOfflineMainPreview(null); }} className="block w-full rounded-2xl border border-dashed border-ink/20 bg-mist px-4 py-4 text-sm" />
              </label>
            </div>
            <div className="rounded-[24px] border border-ink/10 bg-mist px-4 py-3 text-xs leading-6 text-slate">
              <span className="font-semibold text-ink">파일 규칙</span>
              &nbsp;· 원본 파일 예시: <code className="rounded bg-ink/5 px-1">오프라인-성적표.xls</code>
              &nbsp;· 문항분석 파일 예시: <code className="rounded bg-ink/5 px-1">오프라인-문항분석.xls</code>
              &nbsp;· 경찰학 OX는 비워두면 같은 날짜 경찰학 회차로 자동 연동되며, 다른 날짜로 보낼 때만 아래 회차를 선택합니다.
              &nbsp;· 목요일 누적 모의고사와 마지막 배부일은 경찰학 OX를 연동하지 않습니다.
              &nbsp;· 분석 파일은 선택 입력이며, 없으면 원본 파일만 처리합니다.
            </div>
            <div className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <label className="mb-2 block text-sm font-medium">오프라인 OX 적용 회차 <span className="font-normal text-slate">(비워두면 같은 날짜 경찰학 회차로 자동 연동)</span></label>
              <select
                value={offlineOxSessionId ?? ""}
                onChange={(event) => { setOfflineOxSessionId(event.target.value ? Number(event.target.value) : null); setOfflineOxPreview(null); }}
                disabled={isCumulativeSession}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm disabled:bg-slate-100 disabled:text-slate"
              >
                <option value="">{oxAutoOptionLabel}</option>
                {oxSessionOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatOxSessionLabel(s)}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate">{oxRuleHint}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={isPending || !selectedSessionId || !offlineMainFile} onClick={() => run(previewOfflineUpload)} className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40">미리보기</button>
              <button type="button" disabled={isPending || !offlineMainPreview || !selectedSessionId || !offlineMainFile} onClick={requestOfflineExecute} className="inline-flex items-center rounded-full border border-ember/30 px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate">성적 반영</button>
            </div>
            {offlineMainPreview ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-ink">오프라인 일반 미리보기</p>
                <PreviewTable preview={offlineMainPreview} source="offline" onlineResolutions={onlineResolutions} setOnlineResolutions={setOnlineResolutions} />
              </div>
            ) : null}
            {offlineOxPreview ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-ink">오프라인 경찰학 OX 미리보기</p>
                <PreviewTable preview={offlineOxPreview} source="offline" onlineResolutions={onlineResolutions} setOnlineResolutions={setOnlineResolutions} />
              </div>
            ) : null}
          </div>
        ) : null}
        {activeTab === "online" ? (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <select value={onlineAttendType} onChange={(event) => setOnlineAttendType(event.target.value as keyof typeof ATTEND_TYPE_LABEL)} className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm">
                {Object.entries(ATTEND_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <div className="rounded-[24px] border border-ink/10 bg-mist px-4 py-3 text-xs leading-6 text-slate">
                <span className="font-semibold text-ink">파일 규칙</span>
                &nbsp;· 기본 점수 파일 예시: <code className="rounded bg-ink/5 px-1">온라인_성적.xls</code>
                &nbsp;· 상세 파일 예시: <code className="rounded bg-ink/5 px-1">온라인_상세결과.xls</code>
                &nbsp;· OX 기본 파일 예시: <code className="rounded bg-ink/5 px-1">온라인_OX.xls</code>
                &nbsp;· OX 상세 파일 예시: <code className="rounded bg-ink/5 px-1">온라인_OX_상세.xls</code>
                &nbsp;· OX 파일은 비워두면 같은 날짜 경찰학 회차로 자동 연동되며, 다른 날짜로 보낼 때만 아래 회차를 직접 선택합니다.
                &nbsp;· 목요일 누적 모의고사와 마지막 배부일은 경찰학 OX를 연동하지 않습니다.
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-ink">온라인 기본 파일 <span className="font-normal text-red-500">*필수</span></span>
                <input type="file" accept=".xls,.xlsx" onChange={(event) => { setOnlineMainFile(event.target.files?.[0] ?? null); setOnlineMainPreview(null); setOnlineOxPreview(null); setOnlineResolutions({}); }} className="block w-full rounded-2xl border border-dashed border-ink/20 bg-mist px-4 py-4 text-sm" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-ink">온라인 상세 파일 <span className="font-normal text-slate">(선택)</span></span>
                <input type="file" accept=".xls,.xlsx" onChange={(event) => { setOnlineDetailFile(event.target.files?.[0] ?? null); setOnlineMainPreview(null); setOnlineOxPreview(null); setOnlineResolutions({}); }} className="block w-full rounded-2xl border border-dashed border-ink/20 bg-mist px-4 py-4 text-sm" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-ink">온라인 OX 기본 파일 <span className="font-normal text-slate">(선택)</span></span>
                <input type="file" accept=".xls,.xlsx" onChange={(event) => { setOnlineOxMainFile(event.target.files?.[0] ?? null); setOnlineMainPreview(null); setOnlineOxPreview(null); setOnlineResolutions({}); }} className="block w-full rounded-2xl border border-dashed border-ink/20 bg-mist px-4 py-4 text-sm" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-ink">온라인 OX 상세 파일 <span className="font-normal text-slate">(선택)</span></span>
                <input type="file" accept=".xls,.xlsx" onChange={(event) => { setOnlineOxDetailFile(event.target.files?.[0] ?? null); setOnlineMainPreview(null); setOnlineOxPreview(null); setOnlineResolutions({}); }} className="block w-full rounded-2xl border border-dashed border-ink/20 bg-mist px-4 py-4 text-sm" />
              </label>
            </div>
            <div className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <label className="mb-2 block text-sm font-medium">온라인 OX 적용 회차 <span className="font-normal text-slate">(비워두면 같은 날짜 경찰학 회차로 자동 연동)</span></label>
              <select
                value={onlineOxSessionId ?? ""}
                onChange={(event) => { setOnlineOxSessionId(event.target.value ? Number(event.target.value) : null); setOnlineMainPreview(null); setOnlineOxPreview(null); setOnlineResolutions({}); }}
                disabled={isCumulativeSession}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm disabled:bg-slate-100 disabled:text-slate"
              >
                <option value="">{oxAutoOptionLabel}</option>
                {oxSessionOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatOxSessionLabel(s)}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate">{oxRuleHint}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={isPending || !selectedSessionId || !onlineMainFile} onClick={() => run(previewOnlineUpload)} className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40">미리보기</button>
              <button type="button" disabled={isPending || !onlineMainPreview || !selectedSessionId || !onlineMainFile} onClick={requestOnlineExecute} className="inline-flex items-center rounded-full border border-ember/30 px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate">성적 반영</button>
            </div>
            {onlineMainPreview ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-ink">온라인 일반 미리보기</p>
                <PreviewTable preview={onlineMainPreview} source="online" onlineResolutions={onlineResolutions} setOnlineResolutions={setOnlineResolutions} />
              </div>
            ) : null}
            {onlineOxPreview ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-ink">온라인 경찰학 OX 미리보기</p>
                <PreviewTable preview={onlineOxPreview} source="online" onlineResolutions={onlineResolutions} setOnlineResolutions={setOnlineResolutions} />
              </div>
            ) : null}
          </div>
        ) : null}
        {activeTab === "paste" ? (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <select value={pasteAttendType} onChange={(event) => setPasteAttendType(event.target.value as keyof typeof ATTEND_TYPE_LABEL)} className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm">
                {Object.entries(ATTEND_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <div className="rounded-[24px] border border-ink/10 bg-mist px-4 py-4 text-sm leading-7 text-slate">형식: `수험번호[TAB]이름[TAB]원점수` 또는 `수험번호[TAB]이름[TAB]원점수[TAB]응시유형` · 경찰학 OX는 OX 회차를 선택 후 별도 입력</div>
            </div>
            <textarea value={pasteText} onChange={(event) => { setPasteText(event.target.value); setPastePreview(null); }} className="min-h-[220px] w-full rounded-[24px] border border-ink/10 bg-mist px-4 py-4 text-sm leading-7" placeholder={"35357\t홍길동\t80\n35358\t김지우\t75\tNORMAL"} />
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={isPending || !selectedSessionId || !pasteText.trim()} onClick={() => run(previewPasteUpload)} className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40">미리보기</button>
              <button type="button" disabled={isPending || !pastePreview || !selectedSessionId || !pasteText.trim()} onClick={requestPasteExecute} className="inline-flex items-center rounded-full border border-ember/30 px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate">성적 반영</button>
            </div>
            {pastePreview ? <PreviewTable preview={pastePreview} source="paste" onlineResolutions={onlineResolutions} setOnlineResolutions={setOnlineResolutions} /> : null}
          </div>
        ) : null}
      </section>
      <ActionModal
        open={Boolean(confirmModal)}
        badgeLabel="확인"
        badgeTone="warning"
        title={confirmModal?.title ?? ""}
        description={confirmModal?.description ?? ""}
        details={confirmModal?.details ?? []}
        cancelLabel="취소"
        confirmLabel={confirmModal?.confirmLabel ?? "확인"}
        isPending={isPending}
        onClose={closeConfirmModal}
        onConfirm={confirmModal?.onConfirm}
      />
      <ActionModal
        open={Boolean(completionModal)}
        badgeLabel="완료"
        badgeTone="success"
        title={completionModal?.title ?? ""}
        description={completionModal?.description ?? ""}
        details={completionModal?.details ?? []}
        confirmLabel="확인"
        onClose={closeCompletionModal}
      />
    </div>
  );
}
