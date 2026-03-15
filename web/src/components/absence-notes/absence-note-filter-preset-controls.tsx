"use client";

import { useState } from "react";
import { useFilterPresets } from "@/hooks/use-filter-presets";

type AbsenceNoteFilterPresetControlsProps = {
  formId: string;
  storageKey: string;
  fieldNames: string[];
  anchor?: string;
};

function getForm(formId: string) {
  return document.getElementById(formId) as HTMLFormElement | null;
}

function readFilters(form: HTMLFormElement, fieldNames: string[]) {
  const formData = new FormData(form);
  const nextFilters: Record<string, string> = {};

  for (const fieldName of fieldNames) {
    nextFilters[fieldName] = String(formData.get(fieldName) ?? "");
  }

  return nextFilters;
}

function writeFilters(form: HTMLFormElement, filters: Record<string, string>, fieldNames: string[]) {
  for (const fieldName of fieldNames) {
    const element = form.elements.namedItem(fieldName);
    if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLSelectElement)) {
      continue;
    }

    element.value = filters[fieldName] ?? "";
  }
}

function navigateWithFilters(filters: Record<string, string>, anchor?: string) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    const normalized = value.trim();
    if (normalized.length === 0) {
      continue;
    }

    params.set(key, normalized);
  }

  const query = params.toString();
  const hash = anchor ? `#${anchor}` : "";
  window.location.assign(`${window.location.pathname}${query ? `?${query}` : ""}${hash}`);
}

export function AbsenceNoteFilterPresetControls({
  formId,
  storageKey,
  fieldNames,
  anchor,
}: AbsenceNoteFilterPresetControlsProps) {
  const { presets, savePreset, deletePreset } = useFilterPresets(storageKey);
  const [selectedPresetId, setSelectedPresetId] = useState("");

  function handleSavePreset() {
    const form = getForm(formId);
    if (!form) {
      return;
    }

    const name = window.prompt("프리셋 이름을 입력하세요.");
    if (!name || name.trim().length === 0) {
      return;
    }

    const preset = savePreset(name.trim(), readFilters(form, fieldNames));
    if (!preset) {
      return;
    }

    setSelectedPresetId(preset.id);
  }

  function handleApplyPreset(presetId: string) {
    setSelectedPresetId(presetId);

    if (!presetId) {
      return;
    }

    const preset = presets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    const form = getForm(formId);
    if (form) {
      writeFilters(form, preset.filters, fieldNames);
    }

    navigateWithFilters(preset.filters, anchor);
  }

  function handleDeletePreset() {
    if (!selectedPresetId) {
      return;
    }

    const preset = presets.find((item) => item.id === selectedPresetId);
    if (!preset) {
      return;
    }

    const confirmed = window.confirm(`"${preset.name}" 프리셋을 삭제할까요?`);
    if (!confirmed) {
      return;
    }

    deletePreset(selectedPresetId);
    setSelectedPresetId("");
  }

  return (
    <div className="mt-5 rounded-[20px] border border-ink/10 bg-white px-4 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-2 block text-sm font-medium text-ink">저장된 필터 프리셋</label>
          <select
            value={selectedPresetId}
            onChange={(event) => handleApplyPreset(event.target.value)}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="">프리셋 선택...</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleSavePreset}
          className="inline-flex items-center justify-center rounded-full border border-ink/10 bg-white px-4 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          현재 필터 저장
        </button>
        <button
          type="button"
          onClick={handleDeletePreset}
          disabled={!selectedPresetId}
          className="inline-flex items-center justify-center rounded-full border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          프리셋 삭제
        </button>
      </div>
      <p className="mt-3 text-xs leading-6 text-slate">
        자주 쓰는 조회 조건을 저장해 두고, 목록에서 선택하면 즉시 적용됩니다.
      </p>
    </div>
  );
}