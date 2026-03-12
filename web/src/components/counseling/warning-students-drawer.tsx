"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { StudentStatus, ExamType } from "@prisma/client";
import { STATUS_BADGE_CLASS, STATUS_LABEL } from "@/lib/analytics/presentation";
import { buildHref } from "@/lib/analytics/ui";

type WarningStudent = {
  examNumber: string;
  name: string;
  currentStatus: StudentStatus;
  examType: ExamType;
};

type Props = {
  warningNoRecentCount: number;
  warningStudents: WarningStudent[];
};

export function WarningStudentsDrawer({ warningNoRecentCount, warningStudents }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => warningNoRecentCount > 0 && setIsOpen(true)}
        className={`w-full border p-6 text-left transition ${
          warningNoRecentCount > 0
            ? "cursor-pointer border-amber-200 bg-amber-50 hover:border-amber-400 hover:bg-amber-100/60"
            : "cursor-default border-ink/10 bg-white"
        }`}
      >
        <p className="text-sm text-slate">경고 · 탈락 미면담</p>
        <p className="mt-3 flex items-baseline gap-1">
          <span className={`text-3xl font-semibold ${warningNoRecentCount > 0 ? "text-amber-700" : ""}`}>
            {warningNoRecentCount}
          </span>
          <span className={`text-base font-normal ${warningNoRecentCount > 0 ? "text-amber-600" : "text-slate"}`}>
            명
          </span>
        </p>
        <p className="mt-2 text-xs text-slate">
          {warningNoRecentCount > 0 ? "클릭해서 미면담 학생 목록 보기" : "최근 30일 내 면담 기록이 없는 학생 없음"}
        </p>
      </button>

      {mounted
        ? createPortal(
            <>
              <div
                aria-hidden="true"
                onClick={() => setIsOpen(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 9998,
                  backgroundColor: "rgba(0, 0, 0, 0.5)",
                  transition: "opacity 300ms",
                  opacity: isOpen ? 1 : 0,
                  pointerEvents: isOpen ? "auto" : "none",
                }}
              />

              <div
                role="dialog"
                aria-modal="true"
                aria-label="경고 · 탈락 미면담 학생 목록"
                style={{
                  position: "fixed",
                  top: 0,
                  bottom: 0,
                  right: 0,
                  zIndex: 9999,
                  width: "100%",
                  maxWidth: "384px",
                  display: "flex",
                  flexDirection: "column",
                  backgroundColor: "#ffffff",
                  boxShadow: "-8px 0 32px rgba(0,0,0,0.15)",
                  transition: "transform 300ms ease-in-out",
                  transform: isOpen ? "translateX(0)" : "translateX(100%)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: "1px solid #e5e7eb",
                    padding: "20px 24px",
                  }}
                >
                  <div>
                    <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.15em", color: "#4B5563", textTransform: "uppercase" }}>
                      미면담 목록
                    </p>
                    <h2 style={{ marginTop: "4px", fontSize: "18px", fontWeight: 600 }}>
                      경고 · 탈락 <span style={{ color: "#d97706" }}>{warningNoRecentCount}명</span>
                    </h2>
                    <p style={{ marginTop: "2px", fontSize: "12px", color: "#4B5563" }}>
                      최근 30일 내 면담 기록 없음
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="닫기"
                    style={{
                      width: "36px",
                      height: "36px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid #e5e7eb",
                      background: "none",
                      cursor: "pointer",
                      fontSize: "20px",
                      color: "#4B5563",
                    }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
                  {warningStudents.length === 0 ? (
                    <p style={{ textAlign: "center", padding: "32px 0", fontSize: "14px", color: "#4B5563" }}>
                      해당 학생이 없습니다.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {warningStudents.map((student) => (
                        <Link
                          prefetch={false}
                          key={student.examNumber}
                          href={buildHref("/admin/counseling", {
                            examType: student.examType,
                            examNumber: student.examNumber,
                            search: student.examNumber,
                          })}
                          onClick={() => setIsOpen(false)}
                          className="flex items-center gap-3 border border-gray-200 bg-gray-50 px-4 py-3 text-sm transition hover:border-amber-300 hover:bg-amber-50"
                        >
                          <span className="flex-1 font-semibold">
                            {student.examNumber} · {student.name}
                          </span>
                          <span className={`inline-flex shrink-0 border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[student.currentStatus]}`}>
                            {STATUS_LABEL[student.currentStatus]}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ borderTop: "1px solid #e5e7eb", padding: "16px 24px" }}>
                  <p style={{ fontSize: "12px", color: "#4B5563" }}>
                    학생 이름을 누르면 해당 학생 면담 화면으로 이동합니다.
                  </p>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}