"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ATTEND_TYPE_LABEL,
  EXAM_TYPE_LABEL,
  SUBJECT_LABEL,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type {
  ScorePreviewResult,
  ScoreResolutionInput,
} from "@/lib/scores/service";

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
                            checked={Boolean(onlineResolutions[row.rowKey]?.bindOnlineId)}
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
                    {row.issues.length > 0 ? row.issues.join(", ") : row.hasExistingScore ? "기존 점수 덮어쓰기" : "정상"}
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

export function ScoreInputWorkbench({ periods }: ScoreInputWorkbenchProps) {
  const initialPeriodId = periods.find((period) => period.isActive)?.id ?? periods[0]?.id ?? null;
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(initialPeriodId);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
    periods.find((period) => period.id === initialPeriodId)?.sessions[0]?.id ?? null,
  );
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["key"]>("offline");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [offlineAttendType, setOfflineAttendType] = useState<keyof typeof ATTEND_TYPE_LABEL>("NORMAL");
  const [offlineFile, setOfflineFile] = useState<File | null>(null);
  const [offlinePreview, setOfflinePreview] = useState<ScorePreviewResult | null>(null);
  const [onlineAttendType, setOnlineAttendType] = useState<keyof typeof ATTEND_TYPE_LABEL>("LIVE");
  const [onlineMainFile, setOnlineMainFile] = useState<File | null>(null);
  const [onlineOxFile, setOnlineOxFile] = useState<File | null>(null);
  const [onlineDetailFile, setOnlineDetailFile] = useState<File | null>(null);
  const [onlineOxDetailFile, setOnlineOxDetailFile] = useState<File | null>(null);
  const [onlinePreview, setOnlinePreview] = useState<ScorePreviewResult | null>(null);
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

  useEffect(() => {
    if (!selectedPeriod?.sessions.length) {
      setSelectedSessionId(null);
      return;
    }

    const exists = selectedPeriod.sessions.some((session) => session.id === selectedSessionId);
    if (!exists) {
      setSelectedSessionId(selectedPeriod.sessions[0]?.id ?? null);
    }
  }, [selectedPeriod, selectedSessionId]);

  useEffect(() => {
    setOfflinePreview(null);
    setOnlinePreview(null);
    setPastePreview(null);
    setOnlineResolutions({});
  }, [selectedSessionId]);

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "요청에 실패했습니다.");
    }
    return payload;
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

  function buildOfflineFormData(mode: "preview" | "execute") {
    const formData = new FormData();
    formData.append("mode", mode);
    formData.append("sessionId", String(selectedSessionId));
    formData.append("attendType", offlineAttendType);
    if (offlineFile) formData.append("file", offlineFile);
    return formData;
  }

  function buildOnlineFormData(mode: "preview" | "execute") {
    const formData = new FormData();
    formData.append("mode", mode);
    formData.append("sessionId", String(selectedSessionId));
    formData.append("attendType", onlineAttendType);
    formData.append("resolutions", JSON.stringify(onlineResolutions));
    if (onlineMainFile) formData.append("mainFile", onlineMainFile);
    if (onlineOxFile) formData.append("oxFile", onlineOxFile);
    if (onlineDetailFile) formData.append("detailFile", onlineDetailFile);
    if (onlineOxDetailFile) formData.append("oxDetailFile", onlineOxDetailFile);
    return formData;
  }

  if (periods.length === 0) {
    return <div className="rounded-[28px] border border-dashed border-ink/20 bg-white px-6 py-12 text-center text-sm text-slate">먼저 시험 기간과 회차를 생성하세요.</div>;
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-medium">시험 기간</label>
            <select value={selectedPeriodId ?? ""} onChange={(event) => setSelectedPeriodId(Number(event.target.value))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm">
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}{period.isActive ? " / 현재 사용 중" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-medium">시험 회차</label>
            <select value={selectedSessionId ?? ""} onChange={(event) => setSelectedSessionId(Number(event.target.value))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm">
              {selectedPeriod?.sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {EXAM_TYPE_LABEL[session.examType]} / {session.week}주차 / {SUBJECT_LABEL[session.subject]} / {formatDate(session.examDate)}{session.isCancelled ? " / 취소됨" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        {selectedSession ? (
          <div className="mt-5 rounded-[24px] border border-ink/10 bg-white p-5 text-sm text-slate">
            {EXAM_TYPE_LABEL[selectedSession.examType]} / {selectedSession.week}주차 / {SUBJECT_LABEL[selectedSession.subject]} / {formatDate(selectedSession.examDate)}
          </div>
        ) : null}
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
            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <select value={offlineAttendType} onChange={(event) => setOfflineAttendType(event.target.value as keyof typeof ATTEND_TYPE_LABEL)} className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm">
                {Object.entries(ATTEND_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input type="file" accept=".xls,.xlsx" onChange={(event) => { setOfflineFile(event.target.files?.[0] ?? null); setOfflinePreview(null); }} className="block w-full rounded-2xl border border-dashed border-ink/20 bg-mist px-4 py-4 text-sm" />
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={isPending || !selectedSessionId || !offlineFile} onClick={() => run(async () => { const payload = (await requestJson("/api/scores/upload/offline", { method: "POST", body: buildOfflineFormData("preview") })) as ScorePreviewResult; setOfflinePreview(payload); setNotice("오프라인 파일 미리보기를 생성했습니다."); })} className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40">미리보기</button>
              <button type="button" disabled={isPending || !offlinePreview || !selectedSessionId || !offlineFile} onClick={() => run(async () => { const payload = await requestJson("/api/scores/upload/offline", { method: "POST", body: buildOfflineFormData("execute") }); setNotice(`반영 완료: 신규 ${payload.createdCount}건 / 업데이트 ${payload.updatedCount}건`); setOfflinePreview(null); })} className="inline-flex items-center rounded-full border border-ember/30 px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate">성적 반영</button>
            </div>
            {offlinePreview ? <PreviewTable preview={offlinePreview} source="offline" onlineResolutions={onlineResolutions} setOnlineResolutions={setOnlineResolutions} /> : null}
          </div>
        ) : null}
        {activeTab === "online" ? (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <select value={onlineAttendType} onChange={(event) => setOnlineAttendType(event.target.value as keyof typeof ATTEND_TYPE_LABEL)} className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm">
                {Object.entries(ATTEND_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input type="file" accept=".xls,.xlsx" onChange={(event) => { setOnlineMainFile(event.target.files?.[0] ?? null); setOnlinePreview(null); }} className="block w-full rounded-2xl border border-dashed border-ink/20 bg-mist px-4 py-4 text-sm" />
              <input type="file" accept=".xls,.xlsx" onChange={(event) => { setOnlineOxFile(event.target.files?.[0] ?? null); setOnlinePreview(null); }} className="block w-full rounded-2xl border border-dashed border-ink/20 bg-mist px-4 py-4 text-sm" />
              <input type="file" accept=".xls,.xlsx" onChange={(event) => { setOnlineDetailFile(event.target.files?.[0] ?? null); setOnlinePreview(null); }} className="block w-full rounded-2xl border border-dashed border-ink/20 bg-mist px-4 py-4 text-sm" />
            </div>
            <input type="file" accept=".xls,.xlsx" onChange={(event) => { setOnlineOxDetailFile(event.target.files?.[0] ?? null); setOnlinePreview(null); }} className="block w-full rounded-2xl border border-dashed border-ink/20 bg-mist px-4 py-4 text-sm" />
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={isPending || !selectedSessionId || !onlineMainFile} onClick={() => run(async () => { const payload = (await requestJson("/api/scores/upload/online", { method: "POST", body: buildOnlineFormData("preview") })) as ScorePreviewResult; setOnlinePreview(payload); setNotice("온라인 파일 미리보기를 생성했습니다."); })} className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40">미리보기</button>
              <button type="button" disabled={isPending || !onlinePreview || !selectedSessionId || !onlineMainFile} onClick={() => run(async () => { const payload = await requestJson("/api/scores/upload/online", { method: "POST", body: buildOnlineFormData("execute") }); setNotice(`반영 완료: 신규 ${payload.createdCount}건 / 업데이트 ${payload.updatedCount}건 / onlineId 연결 ${payload.boundOnlineIdCount}건`); setOnlinePreview(null); })} className="inline-flex items-center rounded-full border border-ember/30 px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate">성적 반영</button>
            </div>
            {onlinePreview ? <PreviewTable preview={onlinePreview} source="online" onlineResolutions={onlineResolutions} setOnlineResolutions={setOnlineResolutions} /> : null}
          </div>
        ) : null}
        {activeTab === "paste" ? (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <select value={pasteAttendType} onChange={(event) => setPasteAttendType(event.target.value as keyof typeof ATTEND_TYPE_LABEL)} className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm">
                {Object.entries(ATTEND_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <div className="rounded-[24px] border border-ink/10 bg-mist px-4 py-4 text-sm leading-7 text-slate">`수험번호[TAB]이름[TAB]원점수` 또는 `수험번호[TAB]이름[TAB]원점수[TAB]OX점수[TAB]응시유형`</div>
            </div>
            <textarea value={pasteText} onChange={(event) => { setPasteText(event.target.value); setPastePreview(null); }} className="min-h-[220px] w-full rounded-[24px] border border-ink/10 bg-mist px-4 py-4 text-sm leading-7" placeholder={"35357\t홍길동\t80\n35358\t김지우\t75\t10\tNORMAL"} />
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={isPending || !selectedSessionId || !pasteText.trim()} onClick={() => run(async () => { const payload = (await requestJson("/api/scores/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "preview", sessionId: selectedSessionId, text: pasteText, attendType: pasteAttendType }) })) as ScorePreviewResult; setPastePreview(payload); setNotice("붙여넣기 미리보기를 생성했습니다."); })} className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40">미리보기</button>
              <button type="button" disabled={isPending || !pastePreview || !selectedSessionId || !pasteText.trim()} onClick={() => run(async () => { const payload = await requestJson("/api/scores/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "execute", sessionId: selectedSessionId, text: pasteText, attendType: pasteAttendType }) }); setNotice(`반영 완료: 신규 ${payload.createdCount}건 / 업데이트 ${payload.updatedCount}건`); setPastePreview(null); })} className="inline-flex items-center rounded-full border border-ember/30 px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-slate">성적 반영</button>
            </div>
            {pastePreview ? <PreviewTable preview={pastePreview} source="paste" onlineResolutions={onlineResolutions} setOnlineResolutions={setOnlineResolutions} /> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
