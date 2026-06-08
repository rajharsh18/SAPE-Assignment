import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import { parsePdfViaVision } from "./pdf-vision-parser";
import {
  parseBranchHeader,
  parseCellContent,
  PERIOD_TIMES_EXPORT as PERIOD_TIMES,
} from "./pdf-parser-utils";

// Re-export types from a types file - actually let me keep types inline for simplicity

export interface ParsedSlot {
  day: string;
  period: number;
  startTime: string;
  endTime: string;
  courseCode: string | null;
  roomId: string | null;
  facultyName: string | null;
  branchKey?: string;
}

export interface ParsedBranch {
  name: string;
  code: string;
  semester: number;
  section: string | null;
  key: string;
}

export interface ParsedData {
  department: string;
  branches: ParsedBranch[];
  rooms: string[];
  courses: Array<{ code: string; name: string; branchKey?: string }>;
  faculty: string[];
  slots: ParsedSlot[];
  parseErrors: Array<{ row: number; reason: string }>;
  parseMethod: "text" | "vision";
}

function isMeaningfulTimetableText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 80) return false;
  const withoutPageMarkers = trimmed
    .replace(/--\s*\d+\s+of\s+\d+\s--/gi, "")
    .trim();
  if (withoutPageMarkers.length < 50) return false;
  return (
    /(?:MON|TUE|WED|THU|FRI|SAT|MONDAY|TUESDAY)/i.test(trimmed) ||
    /Period\s*[IVX\d\/]/i.test(trimmed) ||
    /[A-Z]{2,}\d{3}/.test(trimmed) ||
    /\d{2}[:.]\d{2}/.test(trimmed)
  );
}

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_PATTERNS = [
  /^MON(?:DAY)?/i,
  /^TUE(?:SDAY)?/i,
  /^WED(?:NESDAY)?/i,
  /^THU(?:RSDAY)?/i,
  /^FRI(?:DAY)?/i,
  /^SAT(?:URDAY)?/i,
];

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractPdfTextViaPdfJs(buffer: Buffer): Promise<string> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) })
      .promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text +=
        content.items.map((item) => ("str" in item ? item.str : "")).join(" ") +
        "\n";
    }
    return text;
  } catch {
    return "";
  }
}

function isDayRow(line: string): string | null {
  const trimmed = line.trim().toUpperCase();
  for (let i = 0; i < DAY_PATTERNS.length; i++) {
    if (DAY_PATTERNS[i].test(trimmed)) return DAYS[i];
  }
  return null;
}

function isHeaderRow(line: string): boolean {
  return (
    /period/i.test(line) ||
    /08:00/i.test(line) ||
    /08:30/i.test(line) ||
    /Period\s*I/i.test(line)
  );
}

export function parseFromText(text: string): ParsedData {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const result: ParsedData = {
    department: "",
    branches: [],
    rooms: [],
    courses: [],
    faculty: [],
    slots: [],
    parseErrors: [],
    parseMethod: "text",
  };

  const roomSet = new Set<string>();
  const courseSet = new Set<string>();
  const facultySet = new Set<string>();
  const branchSet = new Set<string>();
  let currentBranch: ParsedBranch | null = null;
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      !result.department &&
      (/department|computer science|engineering/i.test(line) ||
        /^CSE\b/i.test(line))
    ) {
      result.department = line
        .replace(/^department\s+of\s+/i, "")
        .replace(/\s+timetable.*/i, "")
        .trim();
      if (/^CSE$/i.test(result.department)) {
        result.department = "Computer Science & Engineering";
      }
      continue;
    }

    const branch = parseBranchHeader(line);
    if (branch && branch.semester > 0) {
      currentBranch = branch;
      if (!branchSet.has(branch.key)) {
        branchSet.add(branch.key);
        result.branches.push(branch);
      }
      inTable = false;
      continue;
    }

    if (isHeaderRow(line)) {
      inTable = true;
      continue;
    }

    const day = isDayRow(line);
    if (day && inTable) {
      const remaining = line.replace(/^[A-Za-z]+\s*/i, "");
      let cells = remaining.split(/\t|\s{2,}|\|/).filter(Boolean);

      if (cells.length === 0) {
        const bracketCells = line.match(
          /[^\t|]+?\([A-Za-z]{2,5}\d{1,4}[A-Za-z]?\)/gi,
        );
        if (bracketCells) cells = bracketCells;
        else {
          const legacyCells = line.match(
            /([A-Z]{2,}\d{3}[A-Z]?\s*[-/]\s*\S+)/gi,
          );
          if (legacyCells) cells = legacyCells;
        }
      }

      for (let p = 0; p < cells.length && p < 9; p++) {
        const period = p + 1;
        const { courseCode, courseName, roomId, facultyName } =
          parseCellContent(cells[p]);

        if (!courseCode && cells[p]?.trim()) {
          result.parseErrors.push({
            row: i + 1,
            reason: `Could not parse cell on ${day} period ${period}: "${cells[p]}"`,
          });
        }

        if (courseCode) {
          const courseKey = `${courseCode}-${currentBranch?.key || "default"}`;
          if (!courseSet.has(courseKey)) {
            courseSet.add(courseKey);
            result.courses.push({
              code: courseCode,
              name: courseName || courseCode,
              branchKey: currentBranch?.key,
            });
          } else if (courseName && courseName !== courseCode) {
            const existing = result.courses.find(
              (c) =>
                c.code === courseCode && c.branchKey === currentBranch?.key,
            );
            if (existing && existing.name === existing.code) {
              existing.name = courseName;
            }
          }

          const times = PERIOD_TIMES[period];
          result.slots.push({
            day,
            period,
            startTime: times.start,
            endTime: times.end,
            courseCode,
            roomId,
            facultyName,
            branchKey: currentBranch?.key,
          });

          if (roomId) roomSet.add(roomId);
          if (facultyName) facultySet.add(facultyName);
        }
      }
    }
  }

  result.rooms = Array.from(roomSet);
  result.faculty = Array.from(facultySet);

  if (!result.department) {
    result.department = "Computer Science & Engineering";
  }

  return result;
}

export async function parseTimetablePdfTextOnly(
  filePath: string,
): Promise<ParsedData | null> {
  const buffer = fs.readFileSync(filePath);

  let text = await extractPdfText(buffer);
  if (!isMeaningfulTimetableText(text)) {
    text = await extractPdfTextViaPdfJs(buffer);
  }

  if (!isMeaningfulTimetableText(text)) {
    return null;
  }

  const parsed = parseFromText(text);
  parsed.parseMethod = "text";
  return parsed;
}

export async function parseTimetablePdf(filePath: string): Promise<ParsedData> {
  const textParsed = await parseTimetablePdfTextOnly(filePath);
  if (textParsed) return textParsed;

  const visionParsed = await parsePdfViaVision(filePath);
  if (visionParsed.slots.length > 0 || visionParsed.courses.length > 0) {
    return visionParsed;
  }

  // Companion text file fallback for dev/testing
  const companionPath = filePath.replace(/\.pdf$/i, ".txt");
  if (fs.existsSync(companionPath)) {
    const companionText = fs.readFileSync(companionPath, "utf-8");
    const parsed = parseFromText(companionText);
    parsed.parseMethod = "text";
    return parsed;
  }

  return visionParsed;
}

export async function parseTimetablePdfFromDir(
  dir: string,
): Promise<ParsedData[]> {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .map((f) => path.join(dir, f));

  const results: ParsedData[] = [];
  for (const file of files) {
    results.push(await parseTimetablePdf(file));
  }
  return results;
}
