import { getSheetRows, readWorkbookFromBuffer, toCellString } from "@/lib/excel/workbook";

export type ScoreFilePreview = {
  fileName: string;
  detectedType:
    | "offline-score"
    | "offline-errata"
    | "online-score"
    | "online-ox-score"
    | "online-detail"
    | "online-ox-detail"
    | "unknown";
  sheetNames: string[];
  rowCount: number;
  headers: string[];
};

function detectScoreFileType(fileName: string, headers: string[]) {
  const normalizedName = fileName.toLowerCase();
  const normalizedHeaders = headers.map((header) =>
    header.replace(/\s+/g, "").toLowerCase(),
  );

  if (normalizedName.includes("모의고사채점표")) {
    return normalizedHeaders.includes("수험번호") ? "offline-score" : "offline-errata";
  }

  if (normalizedName.includes("경찰학o,x_채점표") || normalizedName.includes("경찰학o,x_채점표".replace(",", ""))) {
    return "online-ox-detail";
  }

  if (normalizedName.includes("채점표")) {
    return "online-detail";
  }

  if (normalizedName.includes("경찰학o,x") || normalizedName.includes("경찰학ox")) {
    return "online-ox-score";
  }

  if (normalizedHeaders.includes("아이디") && normalizedHeaders.includes("점수")) {
    return "online-score";
  }

  return "unknown";
}

export function previewScoreFiles(
  files: Array<{
    fileName: string;
    buffer: Buffer | ArrayBuffer;
  }>,
) {
  return files.map((file) => {
    const workbook = readWorkbookFromBuffer(file.buffer);
    const firstSheetName = workbook.SheetNames[0];
    const rows = getSheetRows(workbook, firstSheetName);
    const headers = (rows[0] ?? []).map((value) => toCellString(value));

    return {
      fileName: file.fileName,
      detectedType: detectScoreFileType(file.fileName, headers),
      sheetNames: workbook.SheetNames,
      rowCount: Math.max(rows.length - 1, 0),
      headers,
    } satisfies ScoreFilePreview;
  });
}
