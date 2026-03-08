"use client";

import { useState } from "react";
import { EXAM_TYPE_LABEL } from "@/lib/constants";

type PeriodOption = {
  id: number;
  name: string;
  isActive: boolean;
};

type ExportPanelProps = {
  periods: PeriodOption[];
};

export function ExportPanel({ periods }: ExportPanelProps) {
  const [studentExamType, setStudentExamType] = useState<"GONGCHAE" | "GYEONGCHAE">("GONGCHAE");
  const [studentGeneration, setStudentGeneration] = useState("");
  const [studentActiveOnly, setStudentActiveOnly] = useState(true);
  const [scorePeriodId, setScorePeriodId] = useState<string>(
    periods.find((period) => period.isActive)?.id?.toString() ?? "",
  );
  const [scoreExamType, setScoreExamType] = useState<"GONGCHAE" | "GYEONGCHAE">("GONGCHAE");

  function downloadStudents(format: "csv" | "xlsx") {
    const params = new URLSearchParams({
      examType: studentExamType,
      format,
    });

    if (studentGeneration.trim()) {
      params.set("generation", studentGeneration.trim());
    }

    if (!studentActiveOnly) {
      params.set("activeOnly", "false");
    }

    window.location.href = `/api/export/students?${params.toString()}`;
  }

  function downloadScores(format: "csv" | "xlsx") {
    const params = new URLSearchParams({
      examType: scoreExamType,
      format,
    });

    if (scorePeriodId) {
      params.set("periodId", scorePeriodId);
    }

    window.location.href = `/api/export/scores?${params.toString()}`;
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
        <h2 className="text-xl font-semibold">수강생 명단</h2>
        <p className="mt-2 text-sm leading-7 text-slate">
          공채/경채, 활성 여부, 기수 조건으로 필터링한 명단을 CSV 또는 xlsx로 내려받습니다.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <select
            value={studentExamType}
            onChange={(event) =>
              setStudentExamType(event.target.value as typeof studentExamType)
            }
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
            <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
          </select>
          <input
            value={studentGeneration}
            onChange={(event) => setStudentGeneration(event.target.value)}
            placeholder="기수"
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          />
          <label className="inline-flex items-center gap-2 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm">
            <input
              type="checkbox"
              checked={studentActiveOnly}
              onChange={(event) => setStudentActiveOnly(event.target.checked)}
            />
            활성만 포함
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => downloadStudents("xlsx")}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            xlsx 다운로드
          </button>
          <button
            type="button"
            onClick={() => downloadStudents("csv")}
            className="rounded-full border border-ember/30 px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10"
          >
            CSV 다운로드
          </button>
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">성적 Raw</h2>
        <p className="mt-2 text-sm leading-7 text-slate">
          시험 기간과 직렬 기준으로 현재 저장된 원점수/OX/최종점수 원본 데이터를 내려받습니다.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <select
            value={scorePeriodId}
            onChange={(event) => setScorePeriodId(event.target.value)}
            className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm"
          >
            <option value="">전체 기간</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
                {period.isActive ? " / 현재 사용 중" : ""}
              </option>
            ))}
          </select>
          <select
            value={scoreExamType}
            onChange={(event) => setScoreExamType(event.target.value as typeof scoreExamType)}
            className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm"
          >
            <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
            <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
          </select>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => downloadScores("xlsx")}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            xlsx 다운로드
          </button>
          <button
            type="button"
            onClick={() => downloadScores("csv")}
            className="rounded-full border border-ember/30 px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10"
          >
            CSV 다운로드
          </button>
        </div>
      </section>
    </div>
  );
}
