export interface OcrPageResult {
  pageNumber: number;
  ocrText: string;
  charCount: number;
  preview: string;
  branch: string | null;
  slotsFound: number;
  coursesFound: number;
  confirmed: boolean;
  rejected: boolean;
}

export interface PdfJobMetadata {
  filePath: string;
  parseMethod: "text" | "vision";
  pages?: OcrPageResult[];
  ocrProgress?: { current: number; total: number };
}

export function parsePdfJobMetadata(raw: unknown): PdfJobMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as PdfJobMetadata;
  if (typeof m.filePath !== "string") return null;
  return m;
}
