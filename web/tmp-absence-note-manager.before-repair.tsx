"use client";

import {
  AbsenceCategory,
  AbsenceStatus,
  StudentStatus,
  Subject,
} from "@prisma/client";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from "@/lib/analytics/presentation";
import {
  ABSENCE_CATEGORY_LABEL,
  SUBJECT_LABEL,
} from "@/lib/constants";
import { AbsenceNoteAttachmentPanel, type AbsenceNoteAttachmentRecord } from "@/components/absence-notes/absence-note-attachment-panel";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import { formatDate, formatDateTime, todayDateInputValue } from "@/lib/format";
import { useEffect, useRef, useMemo, useState, useTransition } from "react";

type SessionOption = {
  id: number;
  examDate: string;
  subject: Subject;
  week: number;
};

type StudentOption = {
  examNumber: string;
  name: string;
  currentStatus: StudentStatus;
};

type AbsenceNoteRecord = {
  id: number;
  examNumber: string;
  sessionId: number;
  reason: string;
  absenceCategory: AbsenceCategory | null;
  submittedAt: string | null;
  approvedAt: string | null;
  status: AbsenceStatus;
  attendCountsAsAttendance: boolean;
  attendGrantsPerfectAttendance: boolean;
  adminNote: string | null;
  student: {
    name: string;
    currentStatus: StudentStatus;
  };
  session: {
    examDate: string;
    week: number;
    subject: Subject;
    period: {
      name: string;
    };
  };
  attachments: AbsenceNoteAttachmentRecord[];
};

type SortColumn = "examNumber" | "status" | "absenceCategory" | "examDate" | "submittedAt" | "attendCountsAsAttendance" | "attendGrantsPerfectAttendance";

type AbsencePolicyOption = {
  id: number;
  name: string;
  absenceCategory: AbsenceCategory;
  attendCountsAsAttendance: boolean;
  attendGrantsPerfectAttendance: boolean;
  isActive: boolean;
  sortOrder: number;
};

type AbsenceNoteManagerProps = {
  students: StudentOption[];
  sessions: SessionOption[];
  policies: AbsencePolicyOption[];
  notes: AbsenceNoteRecord[];
  settingsHref?: string;
  showCreateSection?: boolean;
  showReviewSection?: boolean;
  showGuidanceSection?: boolean;
};

const NOTE_STATUS_LABEL: Record<AbsenceStatus, string> = {
  PENDING: "?湲?,
  APPROVED: "?뱀씤",
  REJECTED: "諛섎젮",
};

const NOTE_STATUS_CLASS: Record<AbsenceStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-forest/20 bg-forest/10 text-forest",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
};

const STATUS_SORT_ORDER: Record<AbsenceStatus, number> = {
  PENDING: 0,
  REJECTED: 1,
  APPROVED: 2,
};

const WEEKDAY_LABELS = ["??, "??, "??, "??, "紐?, "湲?, "??];
const PAGE_SIZE = 20;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

function getAttachmentFileKey(file: File) {
  return `${file.name.toLowerCase()}:${file.size}:${file.lastModified}`;
}

function validateAttachmentFile(file: File) {
  const lowerName = file.name.toLowerCase();
  const hasSupportedExtension = ATTACHMENT_EXTENSIONS.some((extension) =>
    lowerName.endsWith(extension),
  );

  if (!hasSupportedExtension) {
    return `${file.name}: PDF, JPG, JPEG, PNG ??? ???? ? ????.`;
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name}: 5MB ?? ??? ???? ? ????.`;
  }

  return null;
}

function mergeAttachmentFiles(currentFiles: File[], nextFiles: FileList | null) {
  const merged = [...currentFiles];
  const keys = new Set(currentFiles.map((file) => getAttachmentFileKey(file)));
  const errors: string[] = [];

  for (const file of Array.from(nextFiles ?? [])) {
    const error = validateAttachmentFile(file);
    if (error) {
      errors.push(error);
      continue;
    }

    const key = getAttachmentFileKey(file);
    if (keys.has(key)) {
      continue;
    }

    keys.add(key);
    merged.push(file);
  }

  return {
    files: merged,
    errors,
  };
}

function booleanFromFormData(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function getSessionDateKey(session: SessionOption) {
  return session.examDate.slice(0, 10);
}

function findFirstSessionIdByDate(sessions: SessionOption[], dateKey: string) {
  return sessions.find((session) => getSessionDateKey(session) === dateKey)?.id ?? null;
}

function SortIcon({ column, sortBy, sortOrder }: { column: SortColumn; sortBy: SortColumn; sortOrder: "asc" | "desc" }) {
  if (sortBy !== column) return <span className="ml-1 text-ink/20">??/span>;
  return <span className="ml-1 text-ember">{sortOrder === "asc" ? "?? : "??}</span>;
}

export function AbsenceNoteManager({
  students,
  sessions,
  policies,
  notes,
  settingsHref,
  showCreateSection = true,
  showReviewSection = true,
  showGuidanceSection = true,
}: AbsenceNoteManagerProps) {
  const todayKey = todayDateInputValue();
  const shouldShowCreateSection = showCreateSection;
  const shouldShowReviewSection = showReviewSection;
  const shouldShowGuidanceSection = showGuidanceSection;
  // ?? 怨듯넻 ?깅줉 ???곹깭 ??????????????????????????????????????
  const [createExamNumber, setCreateExamNumber] = useState(students[0]?.examNumber ?? "");
  const [studentSearch, setStudentSearch] = useState("");
  const [createCategory, setCreateCategory] = useState<AbsenceCategory>(AbsenceCategory.OTHER);
  const [createReason, setCreateReason] = useState("");
  const [createAdminNote, setCreateAdminNote] = useState("");
  const [createAttachments, setCreateAttachments] = useState<File[]>([]);
  const [createCountsAsAttendance, setCreateCountsAsAttendance] = useState(false);
  const [createPerfectAttendance, setCreatePerfectAttendance] = useState(false);
  const [createPolicyId, setCreatePolicyId] = useState("");

  // ?? ?④굔 ?깅줉 ????????????????????????????????????????????
  const [createDateFilter, setCreateDateFilter] = useState(todayKey);
  const [createSessionId, setCreateSessionId] = useState(() => {
    const sessionId = findFirstSessionIdByDate(sessions, todayKey);
    return sessionId ? String(sessionId) : "";
  });

  // ?? ?깅줉 紐⑤뱶: ?④굔 / ?쇨큵 ????????????????????????????????
  const [createMode, setCreateMode] = useState<"single" | "bulk">("single");

  // ?? ?쇨큵 ?깅줉 ?곹깭 ????????????????????????????????????????
  const [bulkSubMode, setBulkSubMode] = useState<"pick" | "weekday">("pick");
  const [bulkDateFrom, setBulkDateFrom] = useState(todayKey);
  const [bulkDateTo, setBulkDateTo] = useState(todayKey);
  const [bulkWeekdays, setBulkWeekdays] = useState<number[]>([]);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<number[]>([]);

  // ?? ?쒕줈???뚯감 蹂寃??곹깭 ?????????????????????????????????
  const [changeSessionDateFilter, setChangeSessionDateFilter] = useState(todayKey);
  const [changeSessionTargetId, setChangeSessionTargetId] = useState<string>(() => {
    const sessionId = findFirstSessionIdByDate(sessions, todayKey);
    return sessionId ? String(sessionId) : "";
  });

  // ?? 怨듯넻 UI ?곹깭 ??????????????????????????????????????????
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();
  const completionModal = useActionModalState();
  const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([]);
  const [selectedNote, setSelectedNote] = useState<AbsenceNoteRecord | null>(null);
  const [drawerAttachments, setDrawerAttachments] = useState<File[]>([]);
  const drawerFormRef = useRef<HTMLFormElement>(null);

  // ?? ?뺣젹 / ?섏씠吏 ?????????????????????????????????????????
  const [sortBy, setSortBy] = useState<SortColumn>("status");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);

  // ?? ?④굔 ?깅줉 ?꾪꽣 ????????????????????????????????????????
  const filteredSessions = useMemo(() => {
    if (!createDateFilter) return sessions;
    return sessions.filter((s) => getSessionDateKey(s) === createDateFilter);
  }, [sessions, createDateFilter]);
  const searchedStudents = useMemo(() => {
    const keyword = studentSearch.trim();
    if (!keyword) return students;
    return students.filter(
      (student) =>
        student.examNumber.includes(keyword) || student.name.includes(keyword),
    );
  }, [studentSearch, students]);
  const hasSelectedCreateSession = filteredSessions.some((session) => String(session.id) === createSessionId);

  useEffect(() => {
    if (filteredSessions.length === 0) {
      if (createSessionId !== "") {
        setCreateSessionId("");
      }
      return;
    }

    if (!filteredSessions.some((session) => String(session.id) === createSessionId)) {
      setCreateSessionId(String(filteredSessions[0].id));
    }
  }, [createSessionId, filteredSessions]);

  useEffect(() => {
    if (createMode === "bulk" && createAttachments.length > 0) {
      setCreateAttachments([]);
    }
  }, [createAttachments.length, createMode]);

  useEffect(() => {
    setDrawerAttachments([]);
  }, [selectedNote?.id]);

  const isWeekdayBulkReady = Boolean(bulkDateFrom) && Boolean(bulkDateTo) && bulkWeekdays.length > 0;

  // ?? ?쇨큵 ?깅줉: 議곌굔??留욌뒗 ?몄뀡 紐⑸줉 ?????????????????????
  const bulkFilteredSessions = useMemo(() => {
    if (bulkSubMode === "weekday" && !isWeekdayBulkReady) {
      return [];
    }

    return sessions.filter((s) => {
      const date = getSessionDateKey(s);
      if (bulkDateFrom && date < bulkDateFrom) return false;
      if (bulkDateTo && date > bulkDateTo) return false;
      if (bulkSubMode === "weekday") {
        const dow = new Date(`${date}T00:00:00`).getDay();
        if (!bulkWeekdays.includes(dow)) return false;
      }
      return true;
    });
  }, [sessions, bulkDateFrom, bulkDateTo, bulkSubMode, bulkWeekdays, isWeekdayBulkReady]);

  const bulkFilteredSessionIds = useMemo(
    () => new Set(bulkFilteredSessions.map((s) => s.id)),
    [bulkFilteredSessions],
  );

  // pick 紐⑤뱶???뚮뒗 bulkSelectedIds ?ъ슜, weekday/range 紐⑤뱶???먮룞 ?좏깮
  const effectiveSessionIds = useMemo(() => {
    if (bulkSubMode === "pick") {
      return bulkSelectedIds.filter((id) => bulkFilteredSessionIds.has(id));
    }
    return bulkFilteredSessions.map((s) => s.id);
  }, [bulkSubMode, bulkSelectedIds, bulkFilteredSessionIds, bulkFilteredSessions]);

  // ?? ?쒕줈???뚯감 蹂寃? ?좎쭨 ?꾪꽣 ?몄뀡 紐⑸줉 ????????????????
  const changeSessionOptions = useMemo(() => {
    if (!changeSessionDateFilter) return sessions;
    return sessions.filter((s) => getSessionDateKey(s) === changeSessionDateFilter);
  }, [sessions, changeSessionDateFilter]);

  useEffect(() => {
    if (changeSessionOptions.length === 0) {
      if (changeSessionTargetId !== "") {
        setChangeSessionTargetId("");
      }
      return;
    }

    if (!changeSessionOptions.some((session) => String(session.id) === changeSessionTargetId)) {
      setChangeSessionTargetId(String(changeSessionOptions[0].id));
    }
  }, [changeSessionOptions, changeSessionTargetId]);

  // ?? ?뺣젹???명듃 ???????????????????????????????????????????
  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "examNumber":
          cmp = a.examNumber.localeCompare(b.examNumber);
          break;
        case "status":
          cmp = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
          if (cmp === 0) cmp = b.session.examDate.localeCompare(a.session.examDate);
          break;
        case "absenceCategory":
          cmp = (a.absenceCategory ?? "").localeCompare(b.absenceCategory ?? "");
          break;
        case "examDate":
          cmp = a.session.examDate.localeCompare(b.session.examDate);
          break;
        case "submittedAt":
          cmp = (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "");
          break;
        case "attendCountsAsAttendance":
          cmp = Number(b.attendCountsAsAttendance) - Number(a.attendCountsAsAttendance);
          break;
        case "attendGrantsPerfectAttendance":
          cmp = Number(b.attendGrantsPerfectAttendance) - Number(a.attendGrantsPerfectAttendance);
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [notes, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sortedNotes.length / PAGE_SIZE));
  const paginatedNotes = sortedNotes.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const paginatedSelectableIds = paginatedNotes
    .filter((note) => note.status !== AbsenceStatus.APPROVED)
    .map((note) => note.id);

  useEffect(() => {
    setSelectedNoteIds([]);
  }, [currentPage, sortBy, sortOrder]);

  function toggleSort(column: SortColumn) {
    if (sortBy === column) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
    setCurrentPage(1);
  }

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "?붿껌???ㅽ뙣?덉뒿?덈떎.");
    return payload;
  }

  function setMessage(nextNotice: string | null, nextError: string | null) {
    setNotice(nextNotice);
    setErrorMessage(nextError);
  }

  function reloadPage(message: string, title = "?? ??", details: string[] = []) {
    setNotice(null);
    setErrorMessage(null);
    completionModal.openModal({
      badgeLabel: "??",
      badgeTone: "success",
      title,
      description: message,
      details,
      confirmLabel: "??",
      onClose: () => window.location.reload(),
    });
  }

  function openAttachmentPartialSuccess(details: string[]) {
    completionModal.openModal({
      badgeLabel: "?? ??",
      badgeTone: "warning",
      title: "???? ???????",
      description: "???? ?????? ?? ??? ??? ?????.",
      details,
      confirmLabel: "??",
      onClose: () => window.location.reload(),
    });
  }

  async function requestFormData(url: string, formData: FormData, method = "POST") {
    const response = await fetch(url, {
      method,
      body: formData,
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "??? ??? ??????.");
    return payload;
  }

  function handleAttachmentSelection(
    files: FileList | null,
    currentFiles: File[],
    setFiles: (files: File[]) => void,
  ) {
    const next = mergeAttachmentFiles(currentFiles, files);
    setFiles(next.files);

    if (next.errors.length > 0) {
      setMessage(null, next.errors.join(" "));
      return;
    }

    setMessage(null, null);
  }

  function handleCreateAttachmentSelection(files: FileList | null) {
    handleAttachmentSelection(files, createAttachments, setCreateAttachments);
  }

  function handleDrawerAttachmentSelection(files: FileList | null) {
    handleAttachmentSelection(files, drawerAttachments, setDrawerAttachments);
  }

  function removeCreateAttachment(index: number) {
    setCreateAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function removeDrawerAttachment(index: number) {
    setDrawerAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function uploadAttachments(noteId: number, files: File[]) {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    const payload = await requestFormData("/api/absence-notes/" + noteId + "/attachments", formData);
    return {
      attachments: (payload.attachments ?? []) as AbsenceNoteAttachmentRecord[],
      failed: ((payload.failed ?? []) as Array<{ fileName: string; message: string }>),
    };
  }

  function downloadAttachment(noteId: number, attachmentId: number) {
    window.open(
      "/api/absence-notes/" + noteId + "/attachments/" + attachmentId + "/download",
      "_blank",
      "noopener,noreferrer",
    );
  }

  function uploadDrawerAttachments() {
    if (!selectedNote || drawerAttachments.length === 0) {
      return;
    }

    setMessage(null, null);
    startTransition(async () => {
      try {
        const uploadResult = await uploadAttachments(selectedNote.id, drawerAttachments);
        setSelectedNote((current) =>
          current
            ? {
                ...current,
                attachments: [...current.attachments, ...uploadResult.attachments],
              }
            : current,
        );
        setDrawerAttachments([]);
        if (uploadResult.failed.length > 0) {
          openAttachmentPartialSuccess(
            uploadResult.failed.map((item) => item.fileName + ": " + item.message),
          );
          return;
        }
        setNotice("?? ??? ???????.");
      } catch (error) {
        setMessage(null, error instanceof Error ? error.message : "?? ?? ???? ??????.");
      }
    });
  }

  function removeAttachment(attachment: AbsenceNoteAttachmentRecord) {
    if (!selectedNote) {
      return;
    }

    confirmModal.openModal({
      badgeLabel: "?? ??",
      badgeTone: "warning",
      title: "?? ??? ??????",
      description: attachment.originalFileName + " ??? ????? ?????.",
      cancelLabel: "??",
      confirmLabel: "??",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setMessage(null, null);
        startTransition(async () => {
          try {
            const response = await fetch(
              "/api/absence-notes/" + selectedNote.id + "/attachments/" + attachment.id,
              {
                method: "DELETE",
                cache: "no-store",
              },
            );
            const payload = await response.json();
            if (!response.ok) {
              throw new Error(payload.error ?? "?? ?? ??? ??????.");
            }
            setSelectedNote((current) =>
              current
                ? {
                    ...current,
                    attachments: current.attachments.filter((item) => item.id !== attachment.id),
                  }
                : current,
            );
            if (payload.storageCleanupError) {
              openAttachmentPartialSuccess([payload.storageCleanupError]);
              return;
            }
            setNotice("?? ??? ??????.");
          } catch (error) {
            setMessage(null, error instanceof Error ? error.message : "?? ?? ??? ??????.");
          }
        });
      },
    });
  }


  // ?? ?④굔 ?깅줉 ?????????????????????????????????????????????
  function createNote() {
    setMessage(null, null);
    startTransition(async () => {
      try {
        const createdNote = await requestJson("/api/absence-notes", {
          method: "POST",
          body: JSON.stringify({
            examNumber: createExamNumber,
            sessionId: Number(createSessionId),
            reason: createReason,
            absenceCategory: createCategory,
            attendCountsAsAttendance:
              createCategory === AbsenceCategory.MILITARY ? true : createCountsAsAttendance || createPerfectAttendance,
            attendGrantsPerfectAttendance: createCategory === AbsenceCategory.MILITARY ? true : createPerfectAttendance,
            adminNote: createAdminNote,
          }),
        });

        const completionDetails: string[] = [];
        if (createAttachments.length > 0) {
          try {
            const uploadResult = await uploadAttachments(createdNote.id, createAttachments);
            if (uploadResult.attachments.length > 0) {
              completionDetails.push("?? " + uploadResult.attachments.length + "? ??? ??");
            }
            if (uploadResult.failed.length > 0) {
              openAttachmentPartialSuccess([
                ...completionDetails,
                ...uploadResult.failed.map((item) => item.fileName + ": " + item.message),
              ]);
              setCreateAttachments([]);
              return;
            }
          } catch (attachmentError) {
            setCreateAttachments([]);
            openAttachmentPartialSuccess([
              attachmentError instanceof Error ? attachmentError.message : "?? ?? ???? ??????.",
            ]);
            return;
          }
        }

        setCreateAttachments([]);
        reloadPage(
          createCategory === AbsenceCategory.MILITARY
            ? "???? ???? ??? ?? ???? ??????."
            : "???? ??????.",
          "?? ??",
          completionDetails,
        );
      } catch (error) {
        setMessage(null, error instanceof Error ? error.message : "??? ??? ??????.");
      }
    });
  }

  // ?? ?? ?? ?? ?쇨큵 ?깅줉 ?????????????????????????????????????????????
  function bulkCreateNotes() {
    if (bulkSubMode === "weekday" && !isWeekdayBulkReady) {
      setMessage(null, "?붿씪 諛섎났 ?깅줉? ?쒖옉?? 醫낅즺?? 諛섎났 ?붿씪??紐⑤몢 ?좏깮?댁빞 ?⑸땲??");
      return;
    }
    if (effectiveSessionIds.length === 0) {
      setMessage(null, "?깅줉???뚯감瑜??좏깮?섏꽭??");
      return;
    }
    setMessage(null, null);
    startTransition(async () => {
      try {
        const result = await requestJson("/api/absence-notes/bulk-create", {
          method: "POST",
          body: JSON.stringify({
            examNumber: createExamNumber,
            sessionIds: effectiveSessionIds,
            reason: createReason,
            absenceCategory: createCategory,
            attendCountsAsAttendance:
              createCategory === AbsenceCategory.MILITARY ? true : createCountsAsAttendance || createPerfectAttendance,
            attendGrantsPerfectAttendance: createCategory === AbsenceCategory.MILITARY ? true : createPerfectAttendance,
            adminNote: createAdminNote,
          }),
        });
        const parts = [`${result.succeeded}嫄??깅줉 ?꾨즺`];
        if (result.skipped > 0) parts.push(`${result.skipped}嫄??대? 議댁옱(嫄대꼫?)`);
        if (result.errors.length > 0) parts.push(`${result.errors.length}嫄??ㅽ뙣`);
        reloadPage(parts.join(", "));
      } catch (error) {
        setMessage(null, error instanceof Error ? error.message : "?쇨큵 ?깅줉???ㅽ뙣?덉뒿?덈떎.");
      }
    });
  }

  // ?? ?쒕줈???뚯감 蹂寃???????????????????????????????????????
  function changeNoteSession(noteId: number) {
    if (!changeSessionTargetId) {
      setMessage(null, "??? ??? ?????.");
      return;
    }
    if (changeSessionTargetId === String(selectedNote?.sessionId)) {
      setMessage(null, "?? ??? ?????.");
      return;
    }
    const isApproved = selectedNote?.status === AbsenceStatus.APPROVED;

    const execute = () => {
      setMessage(null, null);
      startTransition(async () => {
        try {
          await requestJson(`/api/absence-notes/${noteId}`, {
            method: "PUT",
            body: JSON.stringify({ action: "changeSession", newSessionId: Number(changeSessionTargetId) }),
          });
          reloadPage(
            isApproved
              ? "??? ??????. ??? ?????? ??????."
              : "??? ??? ??????.",
            "?? ?? ??",
            isApproved ? ["?? ??? ??? ???????."] : [],
          );
        } catch (error) {
          setMessage(null, error instanceof Error ? error.message : "?? ??? ??????.");
        }
      });
    };

    if (isApproved) {
      confirmModal.openModal({
        badgeLabel: "?? ?? ??",
        badgeTone: "warning",
        title: "??? ??? ?? ??",
        description: "??? ???? ??? ???? ??? ???? ?? ??? ?????. ?????????",
        cancelLabel: "??",
        confirmLabel: "?? ??",
        onConfirm: () => {
          confirmModal.closeModal();
          execute();
        },
      });
      return;
    }

    execute();
  }

  // ?? 湲곗〈 ?⑥닔?????????????????????????????????????????????
  function updateNote(noteId: number, formData: FormData) {
    setMessage(null, null);
    startTransition(async () => {
      try {
        const absenceCategory = formData.get("absenceCategory") as AbsenceCategory | null;
        const attendGrantsPerfectAttendance =
          absenceCategory === AbsenceCategory.MILITARY
            ? true
            : booleanFromFormData(formData, "attendGrantsPerfectAttendance");
        await requestJson(`/api/absence-notes/${noteId}`, {
          method: "PUT",
          body: JSON.stringify({
            action: "update",
            reason: String(formData.get("reason") ?? ""),
            absenceCategory,
            attendCountsAsAttendance:
              absenceCategory === AbsenceCategory.MILITARY
                ? true
                : attendGrantsPerfectAttendance || booleanFromFormData(formData, "attendCountsAsAttendance"),
            attendGrantsPerfectAttendance,
            adminNote: String(formData.get("adminNote") ?? ""),
          }),
        });
        reloadPage("?ъ쑀?쒕? ?섏젙?덉뒿?덈떎.");
      } catch (error) {
        setMessage(null, error instanceof Error ? error.message : "?ъ쑀???섏젙???ㅽ뙣?덉뒿?덈떎.");
      }
    });
  }

  function reviewNote(noteId: number, formData: FormData, action: "approve" | "reject") {
    setMessage(null, null);
    startTransition(async () => {
      try {
        const absenceCategory = formData.get("absenceCategory") as AbsenceCategory | null;
        const attendGrantsPerfectAttendance =
          absenceCategory === AbsenceCategory.MILITARY
            ? true
            : booleanFromFormData(formData, "attendGrantsPerfectAttendance");
        await requestJson(`/api/absence-notes/${noteId}`, {
          method: "PUT",
          body: JSON.stringify({
            action,
            adminNote: String(formData.get("adminNote") ?? ""),
            attendCountsAsAttendance:
              absenceCategory === AbsenceCategory.MILITARY
                ? true
                : attendGrantsPerfectAttendance || booleanFromFormData(formData, "attendCountsAsAttendance"),
            attendGrantsPerfectAttendance,
          }),
        });
        reloadPage(action === "approve" ? "?ъ쑀?쒕? ?뱀씤?덉뒿?덈떎." : "?ъ쑀?쒕? 諛섎젮?덉뒿?덈떎.");
      } catch (error) {
        setMessage(null, error instanceof Error ? error.message : "?ъ쑀??寃?좎뿉 ?ㅽ뙣?덉뒿?덈떎.");
      }
    });
  }

  function revertNote(noteId: number) {
    confirmModal.openModal({
      badgeLabel: "?? ?? ??",
      badgeTone: "warning",
      title: "??? ?? ??",
      description: "??? ???? ?? ??? ????????? EXCUSED ??? ?? ?????.",
      cancelLabel: "??",
      confirmLabel: "?? ??",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setMessage(null, null);
        startTransition(async () => {
          try {
            await requestJson(`/api/absence-notes/${noteId}`, {
              method: "PUT",
              body: JSON.stringify({ action: "revert" }),
            });
            reloadPage("??? ??? ??????.", "?? ?? ??");
          } catch (error) {
            setMessage(null, error instanceof Error ? error.message : "?? ??? ??????.");
          }
        });
      },
    });
  }

  function bulkReview(action: "approve" | "reject") {
    const label = action === "approve" ? "??" : "??";
    confirmModal.openModal({
      badgeLabel: `${label} ??`,
      badgeTone: "warning",
      title: `??? ?? ${label}`,
      description: `??? ${selectedNoteIds.length}?? ?? ${label}???????`,
      cancelLabel: "??",
      confirmLabel: label,
      onConfirm: () => {
        confirmModal.closeModal();
        setMessage(null, null);
        startTransition(async () => {
          try {
            const result = await requestJson("/api/absence-notes/bulk", {
              method: "POST",
              body: JSON.stringify({ action, ids: selectedNoteIds }),
            });
            reloadPage(
              `${result.succeeded}? ${label} ??${result.failed > 0 ? `, ${result.failed}? ??` : ""}`,
              `??? ?? ${label} ??`,
            );
          } catch (error) {
            setMessage(null, error instanceof Error ? error.message : `${label} ??? ??????.`);
          }
        });
      },
    });
  }

  function removeNote(noteId: number) {
    confirmModal.openModal({
      badgeLabel: "?? ??",
      badgeTone: "warning",
      title: "??? ??",
      description: "???? ????????? ??? ???? EXCUSED ??? ?? ?????.",
      cancelLabel: "??",
      confirmLabel: "??",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setMessage(null, null);
        startTransition(async () => {
          try {
            await requestJson(`/api/absence-notes/${noteId}`, { method: "DELETE" });
            reloadPage("???? ??????.", "??? ?? ??");
          } catch (error) {
            setMessage(null, error instanceof Error ? error.message : "??? ??? ??????.");
          }
        });
      },
    });
  }

  function handleDrawerAction(action: "update" | "approve" | "reject") {
    if (!selectedNote || !drawerFormRef.current) return;
    const formData = new FormData(drawerFormRef.current);
    if (action === "update") updateNote(selectedNote.id, formData);
    else reviewNote(selectedNote.id, formData, action);
  }

  const allSelectableSelected =
    paginatedSelectableIds.length > 0 &&
    paginatedSelectableIds.every((id) => selectedNoteIds.includes(id));
  const pendingCount = notes.filter((n) => n.status === AbsenceStatus.PENDING).length;
  const rejectedCount = notes.filter((n) => n.status === AbsenceStatus.REJECTED).length;
  const selectedStudent = students.find((s) => s.examNumber === createExamNumber);
  const activePolicies = useMemo(
    () =>
      policies
        .filter((policy) => policy.isActive)
        .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id),
    [policies],
  );

  function applyCreatePolicy(policyId: string) {
    setCreatePolicyId(policyId);

    const selectedPolicy = activePolicies.find((policy) => String(policy.id) === policyId);
    if (!selectedPolicy) {
      return;
    }

    const nextPerfectAttendance = selectedPolicy.attendGrantsPerfectAttendance;
    setCreateCategory(selectedPolicy.absenceCategory);
    setCreateCountsAsAttendance(selectedPolicy.attendCountsAsAttendance || nextPerfectAttendance);
    setCreatePerfectAttendance(nextPerfectAttendance);
  }

  // ?? 怨듯넻 ?깅줉 ???섎떒 (?숈깮, ?ъ쑀 ?좏삎, 異쒖꽍/媛쒓렐, ?ъ쑀 ?댁슜, 愿由ъ옄 硫붾え) ??
  function renderCommonFormFields() {
    const isMilitary = createCategory === AbsenceCategory.MILITARY;
    const effectiveCreateCountsAsAttendance = isMilitary
      ? true
      : createCountsAsAttendance || createPerfectAttendance;
    const effectiveCreatePerfectAttendance = isMilitary ? true : createPerfectAttendance;

    return (
      <>
        {/* ?ъ쑀 ?뺤콉 + ?ъ쑀 ?좏삎 */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium">?ъ쑀 ?뺤콉</label>
            <select
              value={createPolicyId}
              onChange={(e) => applyCreatePolicy(e.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            >
              <option value="">吏곸젒 ?좏깮</option>
              {activePolicies.map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.name} 쨌 {ABSENCE_CATEGORY_LABEL[policy.absenceCategory]}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate">
              ?먯＜ ?곕뒗 ?ъ쑀 ?뺤콉??怨좊Ⅴ硫?異쒖꽍 ?ы븿怨?媛쒓렐 ?몄젙 媛믪씠 ?먮룞?쇰줈 梨꾩썙吏묐땲??
            </p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">?ъ쑀 ?좏삎</label>
            <select
              value={createCategory}
              onChange={(e) => {
                const nextCategory = e.target.value as AbsenceCategory;
                setCreatePolicyId("");
                setCreateCategory(nextCategory);
                if (nextCategory === AbsenceCategory.MILITARY) {
                  setCreateCountsAsAttendance(true);
                  setCreatePerfectAttendance(true);
                }
              }}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            >
              {Object.values(AbsenceCategory).map((category) => (
                <option key={category} value={category}>{ABSENCE_CATEGORY_LABEL[category]}</option>
              ))}
            </select>
            {isMilitary && (
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                ?덈퉬援곗? ?깅줉 利됱떆 ?먮룞?뱀씤?섍퀬 異쒖꽍 ?ы븿怨?媛쒓렐 ?몄젙???④퍡 ?곸슜?⑸땲??
              </p>
            )}
          </div>
        </div>

        {/* 異쒖꽍 ?ы븿 + 媛쒓렐 ?몄젙 */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${isMilitary ? "border-amber-200 bg-amber-50 text-amber-700" : "border-ink/10"}`}>
            <input
              type="checkbox"
              checked={effectiveCreateCountsAsAttendance}
              disabled={isMilitary || effectiveCreatePerfectAttendance}
              onChange={(e) => setCreateCountsAsAttendance(e.target.checked)}
              className="h-4 w-4"
            />
            異쒖꽍 ?ы븿
            {isMilitary ? <span className="text-xs">(?먮룞)</span> : null}
          </label>
          <label className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${isMilitary ? "border-amber-200 bg-amber-50 text-amber-700" : "border-ink/10"}`}>
            <input
              type="checkbox"
              checked={effectiveCreatePerfectAttendance}
              disabled={isMilitary}
              onChange={(e) => {
                const checked = e.target.checked;
                setCreatePerfectAttendance(checked);
                if (checked) {
                  setCreateCountsAsAttendance(true);
                }
              }}
              className="h-4 w-4"
            />
            媛쒓렐 ?몄젙
            {isMilitary ? <span className="text-xs">(?먮룞)</span> : null}
          </label>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium">?ъ쑀 ?댁슜</label>
          <textarea
            rows={3}
            value={createReason}
            onChange={(e) => setCreateReason(e.target.value)}
            className="w-full rounded-3xl border border-ink/10 px-4 py-3 text-sm"
            placeholder="?? 蹂묒썝 吏꾨즺濡??ㅼ쟾 ?쒗뿕 李몄꽍 遺덇?"
          />
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium">??? ??</label>
          <input
            value={createAdminNote}
            onChange={(e) => setCreateAdminNote(e.target.value)}
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            placeholder="?? ?? ??"
          />
        </div>

        {createMode === "single" ? (
          <div className="mt-4">
            <AbsenceNoteAttachmentPanel
              title="?? ??"
              description="???? ???? ??? ??? ?? ??????."
              emptyMessage="???? ?? ???? ??? ??? ??? ?????."
              selectedFiles={createAttachments}
              existingAttachments={[]}
              disabled={isPending}
              onFilesSelected={handleCreateAttachmentSelection}
              onRemoveSelected={removeCreateAttachment}
            />
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-ink/10 px-4 py-4 text-sm text-slate">
            ?? ??? ?? ??? ???? ????. ??? ???? ?? ?? ? ?? ???? ?????.
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-8">
      {notice ? (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">{notice}</div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      {shouldShowCreateSection ? (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">?ъ쑀???깅줉</h2>
            <p className="mt-1 text-sm text-slate">?대떦 湲곌컙??紐⑤뱺 ?뚯감(怨쇨굅쨌誘몃옒 ?ы븿)?먯꽌 ?ъ쑀?쒕? ?깅줉?????덉뒿?덈떎.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {settingsHref ? (
              <a
                href={settingsHref}
                className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                ?ъ쑀 ?뺤콉 ?ㅼ젙
              </a>
            ) : null}
            <div className="flex rounded-full border border-ink/10 p-1 text-sm">
              <button
                type="button"
                onClick={() => setCreateMode("single")}
                className={`rounded-full px-4 py-1.5 font-semibold transition ${createMode === "single" ? "bg-ink text-white" : "text-slate hover:text-ink"}`}
              >
                ?④굔 ?깅줉
              </button>
              <button
                type="button"
                onClick={() => setCreateMode("bulk")}
                className={`rounded-full px-4 py-1.5 font-semibold transition ${createMode === "bulk" ? "bg-ink text-white" : "text-slate hover:text-ink"}`}
              >
                ?쇨큵 ?깅줉
              </button>
            </div>
          </div>
        </div>


        {/* ?섍컯???좏깮 (怨듯넻) */}
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium">?섍컯??/label>
            <input
              type="text"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="?섑뿕踰덊샇 ?먮뒗 ?대쫫 寃??
              className="mb-2 w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            />
            <select
              value={createExamNumber}
              onChange={(e) => setCreateExamNumber(e.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
              disabled={searchedStudents.length === 0}
            >
              {searchedStudents.length === 0 ? (
                <option value="">寃??寃곌낵 ?놁쓬</option>
              ) : (
                searchedStudents.map((student) => (
                  <option key={student.examNumber} value={student.examNumber}>
                    {student.examNumber} 쨌 {student.name}
                    {student.currentStatus !== "NORMAL" ? ` [${STATUS_LABEL[student.currentStatus]}]` : ""}
                  </option>
                ))
              )}
            </select>
            {selectedStudent && selectedStudent.currentStatus !== "NORMAL" && (
              <p className="mt-1.5 text-xs">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[selectedStudent.currentStatus]}`}>
                  {STATUS_LABEL[selectedStudent.currentStatus]}
                </span>
                <span className="ml-1.5 text-slate">?곹깭 ?숈깮?낅땲??</span>
              </p>
            )}
          </div>

          {/* ?④굔: ?⑥씪 ?뚯감 ?좏깮 */}
          {createMode === "single" && (
            <div className="xl:col-span-2">
              <label className="mb-2 block text-sm font-medium">?뚯감 ?좏깮</label>
              <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                <div>
                  <label className="mb-2 block text-xs font-medium text-slate">?좎쭨</label>
                  <input
                    type="date"
                    value={createDateFilter}
                    onChange={(e) => {
                      const date = e.target.value;
                      setCreateDateFilter(date);
                      const matched = sessions.filter((s) => getSessionDateKey(s) === date);
                      setCreateSessionId(matched[0] ? String(matched[0].id) : "");
                    }}
                    className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium text-slate">?뚯감</label>
                  <select
                    value={createSessionId}
                    onChange={(e) => setCreateSessionId(e.target.value)}
                    className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
                  >
                    {filteredSessions.length === 0 ? (
                      <option value="">?대떦 ?좎쭨???뚯감 ?놁쓬</option>
                    ) : (
                      filteredSessions.map((session) => (
                        <option key={session.id} value={session.id}>
                          {session.week}二쇱감 쨌 {SUBJECT_LABEL[session.subject]}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            </div>
          )}


          {/* ?쇨큵: ?좎쭨 踰붿쐞 */}
          {createMode === "bulk" && (
            <div className="xl:col-span-3">
              {/* ?쒕툕紐⑤뱶 ??*/}
              <div className="mb-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setBulkSubMode("pick")}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${bulkSubMode === "pick" ? "border-ember bg-ember/10 text-ember" : "border-ink/10 text-slate hover:border-ink/30"}`}
                >
                  ?좎쭨 吏곸젒 ?좏깮
                </button>
                <button
                  type="button"
                  onClick={() => setBulkSubMode("weekday")}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${bulkSubMode === "weekday" ? "border-ember bg-ember/10 text-ember" : "border-ink/10 text-slate hover:border-ink/30"}`}
                >
                  ?붿씪 諛섎났
                </button>
              </div>

              {/* ?좎쭨 踰붿쐞 */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate">?쒖옉??/label>
                  <input
                    type="date"
                    value={bulkDateFrom}
                    onChange={(e) => setBulkDateFrom(e.target.value)}
                    className="w-full rounded-2xl border border-ink/10 px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate">醫낅즺??/label>
                  <input
                    type="date"
                    value={bulkDateTo}
                    onChange={(e) => setBulkDateTo(e.target.value)}
                    className="w-full rounded-2xl border border-ink/10 px-3 py-2.5 text-sm"
                  />
                </div>
              </div>

              {/* ?붿씪 ?좏깮 (weekday 紐⑤뱶) */}
              {bulkSubMode === "weekday" && (
                <div className="mt-3">
                  <label className="mb-2 block text-xs font-medium text-slate">諛섎났 ?붿씪 ?좏깮</label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAY_LABELS.map((label, i) => (
                      <label
                        key={i}
                        className={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-sm font-semibold transition ${bulkWeekdays.includes(i) ? "border-ink bg-ink text-white" : "border-ink/10 text-slate hover:border-ink/30"}`}
                      >
                        <input
                          type="checkbox"
                          checked={bulkWeekdays.includes(i)}
                          onChange={(e) =>
                            setBulkWeekdays((prev) =>
                              e.target.checked ? [...prev, i] : prev.filter((d) => d !== i),
                            )
                          }
                          className="sr-only"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* pick 紐⑤뱶: 泥댄겕諛뺤뒪 紐⑸줉 */}
              {bulkSubMode === "pick" && bulkFilteredSessions.length > 0 && (
                <div className="mt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-medium text-slate">?뚯감 ?좏깮</label>
                    <button
                      type="button"
                      onClick={() =>
                        setBulkSelectedIds(
                          bulkSelectedIds.length === bulkFilteredSessions.length
                            ? []
                            : bulkFilteredSessions.map((s) => s.id),
                        )
                      }
                      className="text-xs text-ember underline"
                    >
                      {bulkSelectedIds.length === bulkFilteredSessions.length ? "?꾩껜 ?댁젣" : "?꾩껜 ?좏깮"}
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-2xl border border-ink/10 divide-y divide-ink/5">
                    {bulkFilteredSessions.map((s) => (
                      <label key={s.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-mist/40">
                        <input
                          type="checkbox"
                          checked={bulkSelectedIds.includes(s.id)}
                          onChange={(e) =>
                            setBulkSelectedIds((prev) =>
                              e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                            )
                          }
                          className="h-4 w-4"
                        />
                        <span>{formatDate(s.examDate)} 쨌 {s.week}二쇱감 쨌 {SUBJECT_LABEL[s.subject]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* weekday 紐⑤뱶: 誘몃━蹂닿린 */}
              {bulkSubMode === "weekday" ? (
                <div className="mt-3 rounded-2xl border border-ink/10 p-3">
                  {!isWeekdayBulkReady ? (
                    <p className="text-xs text-amber-700">?쒖옉?? 醫낅즺?? 諛섎났 ?붿씪??紐⑤몢 ?좏깮?댁빞 ?뚯감媛 怨꾩궛?⑸땲??</p>
                  ) : effectiveSessionIds.length > 0 ? (
                    <>
                      <p className="mb-2 text-xs font-medium text-slate">?대떦 ?뚯감 ({effectiveSessionIds.length}嫄?</p>
                      <ul className="max-h-32 overflow-y-auto space-y-1 text-xs text-slate">
                        {bulkFilteredSessions.map((s) => (
                          <li key={s.id}>{formatDate(s.examDate)} 쨌 {s.week}二쇱감 쨌 {SUBJECT_LABEL[s.subject]}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-xs text-slate">?좏깮??議곌굔??留욌뒗 ?뚯감媛 ?놁뒿?덈떎.</p>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* 怨듯넻 ?꾨뱶 */}
        {renderCommonFormFields()}

        {/* ?깅줉 踰꾪듉 */}
        {createMode === "single" ? (
          <button
            type="button"
            onClick={createNote}
            disabled={isPending || !createExamNumber || !createReason.trim() || !hasSelectedCreateSession}
            className="mt-4 inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            {createCategory === AbsenceCategory.MILITARY ? "?ъ쑀???깅줉 (利됱떆 ?뱀씤)" : "?ъ쑀???깅줉"}
          </button>
        ) : (
          <button
            type="button"
            onClick={bulkCreateNotes}
            disabled={isPending || !createExamNumber || !createReason.trim() || effectiveSessionIds.length === 0 || (bulkSubMode === "weekday" && !isWeekdayBulkReady)}
            className="mt-4 inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            {bulkSubMode === "weekday" && !isWeekdayBulkReady
              ? "?쇨큵 ?깅줉 (湲곌컙쨌?붿씪 ?좏깮 ?꾩슂)"
              : effectiveSessionIds.length > 0
                ? `${effectiveSessionIds.length}媛??뚯감 ?쇨큵 ?깅줉`
                : "?쇨큵 ?깅줉 (?뚯감 ?좏깮 ?꾩슂)"}
          </button>
        )}
      </section>
      ) : null}

      {shouldShowReviewSection ? (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold">?ъ쑀??寃??/h2>
            {pendingCount > 0 && (
              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                ?湲?{pendingCount}嫄?              </span>
            )}
            {rejectedCount > 0 && (
              <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                諛섎젮 {rejectedCount}嫄?              </span>
            )}
          </div>
        </div>

        {notes.length === 0 ? (
          <div className="mt-6 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
            議고쉶???ъ쑀?쒓? ?놁뒿?덈떎. ???꾪꽣?먯꽌 議곌굔??蹂寃쏀븯嫄곕굹 ?ъ쑀?쒕? ?깅줉?섏꽭??
          </div>
        ) : (
          <>
            <div className="mt-6 overflow-x-auto rounded-2xl border border-ink/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/60 text-left text-xs font-semibold text-slate">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer"
                        checked={allSelectableSelected}
                        disabled={paginatedSelectableIds.length === 0}
                        onChange={(e) => setSelectedNoteIds(e.target.checked ? paginatedSelectableIds : [])}
                        title="?꾩옱 ?섏씠吏 ?湲걔룸컲????ぉ ?꾩껜 ?좏깮"
                      />
                    </th>
                    <th className="cursor-pointer select-none px-4 py-3 hover:text-ink" onClick={() => toggleSort("examNumber")}>
                      ?섑뿕踰덊샇 쨌 ?대쫫 <SortIcon column="examNumber" sortBy={sortBy} sortOrder={sortOrder} />
                    </th>
                    <th className="cursor-pointer select-none px-4 py-3 hover:text-ink" onClick={() => toggleSort("status")}>
                      ?곹깭 <SortIcon column="status" sortBy={sortBy} sortOrder={sortOrder} />
                    </th>
                    <th className="px-4 py-3">?숈깮 ?곹깭</th>
                    <th className="cursor-pointer select-none px-4 py-3 hover:text-ink" onClick={() => toggleSort("absenceCategory")}>
                      ?ъ쑀 ?좏삎 <SortIcon column="absenceCategory" sortBy={sortBy} sortOrder={sortOrder} />
                    </th>
                    <th className="cursor-pointer select-none px-4 py-3 hover:text-ink" onClick={() => toggleSort("attendCountsAsAttendance")}>
                      異쒖꽍?ы븿 <SortIcon column="attendCountsAsAttendance" sortBy={sortBy} sortOrder={sortOrder} />
                    </th>
                    <th className="cursor-pointer select-none px-4 py-3 hover:text-ink" onClick={() => toggleSort("attendGrantsPerfectAttendance")}>
                      媛쒓렐?몄젙 <SortIcon column="attendGrantsPerfectAttendance" sortBy={sortBy} sortOrder={sortOrder} />
                    </th>
                    <th className="cursor-pointer select-none px-4 py-3 hover:text-ink" onClick={() => toggleSort("examDate")}>
                      ?뚯감 ?뺣낫 <SortIcon column="examDate" sortBy={sortBy} sortOrder={sortOrder} />
                    </th>
                    <th className="cursor-pointer select-none px-4 py-3 hover:text-ink" onClick={() => toggleSort("submittedAt")}>
                      ?쒖텧??<SortIcon column="submittedAt" sortBy={sortBy} sortOrder={sortOrder} />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {paginatedNotes.map((note) => {
                    const isSelectable = note.status !== AbsenceStatus.APPROVED;
                    return (
                      <tr
                        key={note.id}
                        onClick={() => {
                          setSelectedNote(note);
                          setChangeSessionDateFilter(todayKey);
                          const todaySessionId = findFirstSessionIdByDate(sessions, todayKey);
                          setChangeSessionTargetId(todaySessionId ? String(todaySessionId) : "");
                        }}
                        className="cursor-pointer transition-colors hover:bg-mist/40"
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {isSelectable ? (
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer"
                              checked={selectedNoteIds.includes(note.id)}
                              onChange={(e) =>
                                setSelectedNoteIds((current) =>
                                  e.target.checked ? [...current, note.id] : current.filter((id) => id !== note.id),
                                )
                              }
                            />
                          ) : (
                            <div className="h-4 w-4" />
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium">{note.examNumber} 쨌 {note.student.name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${NOTE_STATUS_CLASS[note.status]}`}>
                            {NOTE_STATUS_LABEL[note.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[note.student.currentStatus]}`}>
                            {STATUS_LABEL[note.student.currentStatus]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate">
                          {note.absenceCategory ? ABSENCE_CATEGORY_LABEL[note.absenceCategory] : "-"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {note.attendCountsAsAttendance ? (
                            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">?ы븿</span>
                          ) : (
                            <span className="text-slate">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {note.attendGrantsPerfectAttendance ? (
                            <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">?몄젙</span>
                          ) : (
                            <span className="text-slate">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate">
                          {note.session.period.name} 쨌 {formatDate(note.session.examDate)} 쨌 {note.session.week}二쇱감 쨌 {SUBJECT_LABEL[note.session.subject]}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate">
                          {note.submittedAt ? formatDateTime(note.submittedAt) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ?섏씠吏?ㅼ씠??*/}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate">
                  {(currentPage - 1) * PAGE_SIZE + 1}??Math.min(currentPage * PAGE_SIZE, sortedNotes.length)} / {sortedNotes.length}嫄?                </span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="rounded-lg px-2 py-1 text-slate transition hover:bg-mist disabled:opacity-30">짬</button>
                  <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="rounded-lg px-2 py-1 text-slate transition hover:bg-mist disabled:opacity-30">??/button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                    const page = start + i;
                    return (
                      <button key={page} type="button" onClick={() => setCurrentPage(page)}
                        className={`min-w-[2rem] rounded-lg px-2 py-1 transition ${page === currentPage ? "bg-ink font-semibold text-white" : "text-slate hover:bg-mist"}`}>
                        {page}
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="rounded-lg px-2 py-1 text-slate transition hover:bg-mist disabled:opacity-30">??/button>
                  <button type="button" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="rounded-lg px-2 py-1 text-slate transition hover:bg-mist disabled:opacity-30">쨩</button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
      ) : null}

      {selectedNoteIds.length > 0 ? <div className="h-24" /> : null}
      {selectedNoteIds.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-ink/10 bg-white/95 px-4 py-3 shadow-lg backdrop-blur lg:left-[260px] sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold text-ink">{selectedNoteIds.length}嫄??좏깮??/span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => bulkReview("approve")}
                disabled={isPending}
                className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
              >
                ?좏깮 ?뱀씤
              </button>
              <button
                type="button"
                onClick={() => bulkReview("reject")}
                disabled={isPending}
                className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                ?좏깮 諛섎젮
              </button>
              <button
                type="button"
                onClick={() => setSelectedNoteIds([])}
                className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
              >
                ?좏깮 ?댁젣
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shouldShowGuidanceSection ? (
        <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">?댁쁺 ?덈궡</h2>
              <ul className="mt-4 space-y-2 text-sm leading-7 text-slate">
                <li>怨쇨굅쨌誘몃옒 紐⑤뱺 ?뚯감???ъ쑀?쒕? ?깅줉?????덉뒿?덈떎.</li>
                <li><span className="font-semibold text-ink">?덈퉬援?/span>? ?ъ쑀???깅줉 ???먮룞?쇰줈 利됱떆 ?뱀씤?섎ŉ 異쒖꽍 ?ы븿怨?媛쒓렐 ?몄젙???④퍡 ?곸슜?⑸땲??</li>
                <li>?ъ쑀 ?뺤콉???좏깮?섎㈃ 異쒖꽍 ?ы븿怨?媛쒓렐 ?몄젙 湲곕낯媛믪씠 ?먮룞?쇰줈 梨꾩썙吏硫? ?꾩슂?섎㈃ ?깅줉 ?붾㈃?먯꽌 諛붾줈 議곗젙?????덉뒿?덈떎.</li>
                <li>?뱀씤?섎㈃ ABSENT??EXCUSED濡?蹂寃쎈릺怨??곹깭 ?먯젙???ㅼ떆 怨꾩궛?섎ŉ, 異쒖꽍瑜?諛섏쁺 ?щ????ъ쑀???ㅼ젙媛믪쓣 ?곕쫭?덈떎.</li>
                <li>諛섎젮???ъ쑀?쒕뒗 ?ш??좏븯???ㅼ떆 ?뱀씤?????덉뒿?덈떎.</li>
              </ul>
            </div>
            {settingsHref ? (
              <a
                href={settingsHref}
                className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                ?ъ쑀 ?뺤콉 ?ㅼ젙?쇰줈 ?대룞
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ?ъ씠???쒕줈??*/}
      {shouldShowReviewSection && selectedNote ? (
        <>
          <div className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px]" onClick={() => setSelectedNote(null)} />
          <div key={selectedNote.id} className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl">
            {/* ?ㅻ뜑 */}
            <div className="shrink-0 flex items-start justify-between border-b border-ink/10 px-6 py-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{selectedNote.examNumber} 쨌 {selectedNote.student.name}</h3>
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${NOTE_STATUS_CLASS[selectedNote.status]}`}>
                    {NOTE_STATUS_LABEL[selectedNote.status]}
                  </span>
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[selectedNote.student.currentStatus]}`}>
                    {STATUS_LABEL[selectedNote.student.currentStatus]}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-slate">
                  {selectedNote.session.period.name} 쨌 {formatDate(selectedNote.session.examDate)} 쨌 {selectedNote.session.week}二쇱감 쨌 {SUBJECT_LABEL[selectedNote.session.subject]}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-4 text-xs text-slate/70">
                  <span>?쒖텧: {selectedNote.submittedAt ? formatDateTime(selectedNote.submittedAt) : "-"}</span>
                  <span>?뱀씤: {selectedNote.approvedAt ? formatDateTime(selectedNote.approvedAt) : "-"}</span>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedNote(null)} className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate transition hover:bg-ink/10 hover:text-ink" aria-label="?リ린">??/button>
            </div>

            {/* ???ㅽ겕濡??곸뿭 */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="px-6 py-5">
                {selectedNote.status === AbsenceStatus.APPROVED && (
                  <div className="mb-5 flex items-center gap-2 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
                    <span className="font-semibold">?뱀씤 ?꾨즺</span>
                    <span className="text-forest/70">???댁슜 ?섏젙??遺덇??⑸땲?? 蹂寃쎌씠 ?꾩슂?섎㈃ ??젣 ???щ벑濡앺븯?몄슂.</span>
                  </div>
                )}
                {selectedNote.status === AbsenceStatus.REJECTED && (
                  <div className="mb-5 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <span className="font-semibold">諛섎젮??/span>
                    <span className="text-red-500">???댁슜 ?섏젙 ???ㅼ떆 ?뱀씤?섍굅????젣?????덉뒿?덈떎.</span>
                  </div>
                )}

                <form ref={drawerFormRef} className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-medium">?ъ쑀 ?댁슜</label>
                    <textarea
                      name="reason"
                      rows={5}
                      defaultValue={selectedNote.reason}
                      disabled={selectedNote.status === AbsenceStatus.APPROVED}
                      className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm disabled:bg-slate-50 disabled:text-slate"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium">?ъ쑀 ?좏삎</label>
                      <select
                        name="absenceCategory"
                        defaultValue={selectedNote.absenceCategory ?? AbsenceCategory.OTHER}
                        disabled={selectedNote.status === AbsenceStatus.APPROVED}
                        className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm disabled:bg-slate-50 disabled:text-slate"
                      >
                        {Object.values(AbsenceCategory).map((category) => (
                          <option key={category} value={category}>{ABSENCE_CATEGORY_LABEL[category]}</option>
                        ))}
                      </select>
                      {selectedNote.absenceCategory === AbsenceCategory.MILITARY && selectedNote.status !== AbsenceStatus.APPROVED && (
                        <p className="mt-1.5 text-xs text-amber-600">?덈퉬援? ?뱀씤 ???먮룞?쇰줈 異쒖꽍 ?ы븿 + 媛쒓렐 ?몄젙</p>
                      )}
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium">愿由ъ옄 硫붾え</label>
                      <input
                        name="adminNote"
                        defaultValue={selectedNote.adminNote ?? ""}
                        className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
                        placeholder="?대? ?뺤씤 硫붾え"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate">
                      <input
                        type="checkbox"
                        name="attendCountsAsAttendance"
                        defaultChecked={selectedNote.absenceCategory === AbsenceCategory.MILITARY ? true : selectedNote.attendCountsAsAttendance}
                        disabled={selectedNote.absenceCategory === AbsenceCategory.MILITARY}
                        className="h-4 w-4"
                      />
                      異쒖꽍 ?ы븿
                      {selectedNote.absenceCategory === AbsenceCategory.MILITARY && (
                        <span className="text-xs text-amber-600">(?덈퉬援??먮룞)</span>
                      )}
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate">
                      <input
                        type="checkbox"
                        name="attendGrantsPerfectAttendance"
                        defaultChecked={selectedNote.absenceCategory === AbsenceCategory.MILITARY ? true : selectedNote.attendGrantsPerfectAttendance}
                        disabled={selectedNote.absenceCategory === AbsenceCategory.MILITARY}
                        className="h-4 w-4"
                      />
                      媛쒓렐 ?몄젙
                      {selectedNote.absenceCategory === AbsenceCategory.MILITARY && (
                        <span className="text-xs text-amber-600">(?덈퉬援??먮룞)</span>
                      )}
                    </label>
                  </div>
                </form>

                <div className="mt-6 space-y-3">
                  <AbsenceNoteAttachmentPanel
                    title="?? ??"
                    description="?? ??? ????? ? ??? ??? ? ????."
                    emptyMessage="??? ??? ????."
                    selectedFiles={drawerAttachments}
                    existingAttachments={selectedNote.attachments}
                    disabled={isPending}
                    onFilesSelected={handleDrawerAttachmentSelection}
                    onRemoveSelected={removeDrawerAttachment}
                    onDeleteExisting={removeAttachment}
                    onDownloadExisting={(attachment) => downloadAttachment(selectedNote.id, attachment.id)}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={uploadDrawerAttachments}
                      disabled={isPending || drawerAttachments.length === 0}
                      className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ?? ???
                    </button>
                  </div>
                </div>
                {/* ?뚯감 蹂寃??뱀뀡 */}
                <div className="mt-6 rounded-2xl border border-ink/10 p-4">
                  <h4 className="text-sm font-semibold">?뚯감 蹂寃?/h4>
                  <p className="mt-1 text-xs text-slate">
                    ?섎せ ?깅줉???좎쭨瑜??섏젙?⑸땲??
                    {selectedNote.status === AbsenceStatus.APPROVED && (
                      <span className="ml-1 font-medium text-amber-600">蹂寃????뱀씤??痍⑥냼?⑸땲??</span>
                    )}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate">?좎쭨 ?꾪꽣</label>
                      <input
                        type="date"
                        value={changeSessionDateFilter}
                        onChange={(e) => {
                          setChangeSessionDateFilter(e.target.value);
                          const matched = sessions.filter((s) => getSessionDateKey(s) === e.target.value);
                          setChangeSessionTargetId(matched[0] ? String(matched[0].id) : "");
                        }}
                        className="w-full rounded-2xl border border-ink/10 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate">蹂寃쏀븷 ?뚯감</label>
                      <select
                        value={changeSessionTargetId}
                        onChange={(e) => setChangeSessionTargetId(e.target.value)}
                        className="w-full rounded-2xl border border-ink/10 px-3 py-2 text-sm"
                      >
                        {changeSessionOptions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {formatDate(s.examDate)} 쨌 {s.week}二쇱감 쨌 {SUBJECT_LABEL[s.subject]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => changeNoteSession(selectedNote.id)}
                    disabled={
                      isPending ||
                      !changeSessionTargetId ||
                      changeSessionTargetId === String(selectedNote.sessionId)
                    }
                    className="mt-3 inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ?뚯감 蹂寃?                  </button>
                </div>
              </div>

              {/* ?명꽣 ?≪뀡 */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 px-6 py-4">
                <button
                  type="button"
                  onClick={() => removeNote(selectedNote.id)}
                  disabled={isPending}
                  className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  ??젣
                </button>
                <div className="flex flex-wrap gap-2">
                  {selectedNote.status !== AbsenceStatus.APPROVED && (
                    <button
                      type="button"
                      onClick={() => handleDrawerAction("update")}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      ???                    </button>
                  )}
                  {selectedNote.status !== AbsenceStatus.APPROVED && (
                    <button
                      type="button"
                      onClick={() => handleDrawerAction("approve")}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
                    >
                      ?뱀씤
                    </button>
                  )}
                  {selectedNote.status === AbsenceStatus.PENDING && (
                    <button
                      type="button"
                      onClick={() => handleDrawerAction("reject")}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      諛섎젮
                    </button>
                  )}
                  {selectedNote.status === AbsenceStatus.APPROVED && (
                    <button
                      type="button"
                      onClick={() => revertNote(selectedNote.id)}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      ?뱀씤痍⑥냼
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
      <ActionModal
        open={Boolean(confirmModal.modal)}
        badgeLabel={confirmModal.modal?.badgeLabel ?? ""}
        badgeTone={confirmModal.modal?.badgeTone}
        title={confirmModal.modal?.title ?? ""}
        description={confirmModal.modal?.description ?? ""}
        details={confirmModal.modal?.details ?? []}
        cancelLabel={confirmModal.modal?.cancelLabel}
        confirmLabel={confirmModal.modal?.confirmLabel ?? "??"}
        confirmTone={confirmModal.modal?.confirmTone}
        isPending={isPending}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
      <ActionModal
        open={Boolean(completionModal.modal)}
        badgeLabel={completionModal.modal?.badgeLabel ?? ""}
        badgeTone={completionModal.modal?.badgeTone}
        title={completionModal.modal?.title ?? ""}
        description={completionModal.modal?.description ?? ""}
        details={completionModal.modal?.details ?? []}
        confirmLabel={completionModal.modal?.confirmLabel ?? "??"}
        onClose={completionModal.closeModal}
        onConfirm={completionModal.modal?.onConfirm}
      />
    </div>
  );
}

