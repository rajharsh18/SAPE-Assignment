import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import type { OcrPageResult } from "./pdf-job-metadata";
import type { ParsedBranch, ParsedData, ParsedSlot } from "./pdf-parser";
import {
  branchKey,
  PERIOD_TIMES_EXPORT as PERIOD_TIMES,
  isValidFacultyName,
  splitFacultyNames,
} from "./pdf-parser-utils";

const execFileAsync = promisify(execFile);

const DEFAULT_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Llama 4 Scout is the lightest Groq vision model on the free tier (Llama 3.2 vision
// previews were deprecated). Override via GROQ_MODEL if needed.
const DEFAULT_GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const VALID_DAYS = new Set(["MON", "TUE", "WED", "THU", "FRI", "SAT"]);
const DAY_MAP: Record<string, string> = {
  MON: "MON",
  MONDAY: "MON",
  TUE: "TUE",
  TUESDAY: "TUE",
  WED: "WED",
  WEDNESDAY: "WED",
  THU: "THU",
  THURSDAY: "THU",
  FRI: "FRI",
  FRIDAY: "FRI",
  SAT: "SAT",
  SATURDAY: "SAT",
};

interface VisionSlot {
  day?: string;
  period?: number;
  courseCode?: string;
  roomId?: string | null;
  facultyName?: string | null;
  branchCode?: string;
  semester?: number;
  section?: string;
}

interface VisionPayload {
  department?: string;
  branches?: Array<{
    code?: string;
    name?: string;
    semester?: number;
    section?: string;
  }>;
  rooms?: string[];
  courses?: Array<{ code?: string; name?: string; branchCode?: string }>;
  faculty?: string[];
  slots?: VisionSlot[];
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      await execFileAsync("where", [cmd]);
    } else {
      await execFileAsync("sh", ["-c", `command -v ${cmd}`]);
    }
    return true;
  } catch {
    return false;
  }
}

export async function isPopplerAvailable(): Promise<boolean> {
  return commandExists("pdftoppm");
}

async function convertPdfToPngs(
  pdfPath: string,
  outDir: string,
): Promise<string[]> {
  const prefix = path.join(outDir, "page");
  // 200 dpi: good readability for vision models, keeps PNGs ~300-500 KB so they fit
  // comfortably under Groq's per-image base64 limit.
  await execFileAsync("pdftoppm", ["-png", "-r", "200", pdfPath, prefix]);
  return fs
    .readdirSync(outDir)
    .filter((f) => f.endsWith(".png"))
    .sort()
    .map((f) => path.join(outDir, f));
}

function normalizeDay(day: string): string | null {
  const upper = day.trim().toUpperCase();
  if (VALID_DAYS.has(upper)) return upper;
  return DAY_MAP[upper] || null;
}

function normalizeBranchCode(raw: string): string {
  const code = raw.toUpperCase().replace(/[^A-Z]/g, "");
  if (code === "CSE") return "CS";
  if (code === "AIML" || code === "AI") return "AIML";
  if (code === "MCA") return "MCA";
  return code || "CS";
}

function isCourseCodeToken(token: string): boolean {
  return /^[A-Z]{2,4}\d{3,6}L?$/.test(token);
}

const SYSTEM_PROMPT = `You are an expert at reading university timetable PDF pages.
You will be shown an image of one timetable page. Extract every piece of structured data you can see and respond with ONLY a JSON object (no prose, no markdown fences).

Schema:
{
  "department": string,                    // e.g. "Computer Science & Engineering"
  "branches": [                            // every branch header visible on this page
    {"code": "CS", "name": "Computer Science", "semester": 6, "section": "A"}
  ],
  "rooms": ["219", "Lab 3"],              // room numbers / lab names referenced
  "courses": [
    {"code": "CS333", "name": "Compiler Design", "branchCode": "CS"}
  ],
  "faculty": ["Dr. Example Person"],
  "slots": [                               // one entry per non-empty timetable cell
    {
      "day": "MON",                        // MON|TUE|WED|THU|FRI|SAT
      "period": 1,                          // 1..9, left-to-right column index
      "courseCode": "CS333",
      "roomId": "219",
      "facultyName": "Dr. Example",
      "branchCode": "CS",
      "semester": 6,
      "section": "A"
    }
  ]
}

Rules:
- Read the timetable grid row by row. Each row is a day, each column is a period.
- Skip cells that say BREAK, LUNCH, NC, or are empty.
- BIT Mesra format: faculty name(s) appear BEFORE the course title. Multiple faculty on one cell means co-teaching.
- The course CODE is inside parentheses after the title, e.g. "Compiler Design (CS601)" → code=CS601, name="Compiler Design". NEVER use the course title as the code.
- Faculty may be on line(s) above the course line, or on the same line before the title, e.g. "Dr. A and Dr. B Compiler Design (CS601)".
- Room number or lab is usually on the line below the course, or after / following the bracket.
- Ignore faculty strings that contain only punctuation/symbols with no letters.
- Legacy format "CS333/219" means courseCode=CS333, roomId=219.
- If a cell shows a lab like "Networks Lab (CS611L) Lab 3", code=CS611L, roomId="Lab 3".
- Tie every slot back to the branch header above its table.

IMPORTANT — branch codes used in this PDF:
  - CS   (B.Tech Computer Science, all semesters and sections)
  - AIML (B.Tech AI & ML, and M.Tech AIML)
  - MCA  (MCA programme)
  Use the EXACT code from the page header "Branch:" field.

IMPORTANT — course code prefixes used in this PDF:
  CS, AI, CA, MA, MT, HS, IT, MC, AI (for AIML courses)
  Preserve these prefixes exactly as printed inside the parentheses.
  Examples: CS333, AI303, CA413, MA24201, MT133, HS24211, IT349, MC300, CS630, AI601.

- If the page is not a timetable (cover, syllabus list, etc.), still extract courses/faculty you see, but return an empty slots array.
- Output ONLY the JSON object. No commentary.`;

function extractJson(text: string): VisionPayload | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as VisionPayload;
  } catch {
    return null;
  }
}

async function callGroqVision(pngPath: string): Promise<VisionPayload | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not set. Add it to the worker environment to enable vision-based PDF parsing.",
    );
  }

  const url = process.env.GROQ_URL || DEFAULT_GROQ_URL;
  const model = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
  const imageBytes = fs.readFileSync(pngPath);
  const dataUrl = `data:image/png;base64,${imageBytes.toString("base64")}`;

  const body = {
    model,
    temperature: 0.02,
    max_tokens: 4096,
    response_format: { type: "json_object" as const },
    messages: [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: SYSTEM_PROMPT },
          { type: "image_url" as const, image_url: { url: dataUrl } },
        ],
      },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Groq vision call failed (${res.status}): ${errText.slice(0, 400)}`,
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) return null;
  return extractJson(content);
}

function visionPayloadToParsed(
  payload: VisionPayload,
  currentBranch: ParsedBranch | null,
): {
  parsed: ParsedData;
  primaryBranch: ParsedBranch | null;
} {
  const branches: ParsedBranch[] = [];
  const branchMap = new Map<string, ParsedBranch>();

  for (const b of payload.branches || []) {
    if (!b.code || !b.semester) continue;
    const code = normalizeBranchCode(b.code);
    const section = (b.section || "A").toUpperCase();
    const key = branchKey(code, b.semester, section);
    if (branchMap.has(key)) continue;
    const branch: ParsedBranch = {
      code,
      name: b.name?.trim() || (code === "CS" ? "Computer Science" : code),
      semester: b.semester,
      section,
      key,
    };
    branchMap.set(key, branch);
    branches.push(branch);
  }

  const primaryBranch = branches[0] || currentBranch || null;

  const courses = (payload.courses || [])
    .filter((c) => c?.code)
    .map((c) => {
      const code = c.code!.toUpperCase().trim();
      const branch = c.branchCode
        ? branches.find((b) => b.code === normalizeBranchCode(c.branchCode!))
        : primaryBranch;
      return {
        code,
        name: c.name?.trim() || code,
        branchKey: branch?.key,
      };
    });

  const slots: ParsedSlot[] = [];
  for (const s of payload.slots || []) {
    if (!s.day || !s.period || !s.courseCode) continue;
    const courseCode = s.courseCode.toUpperCase().trim();

    if (!isCourseCodeToken(courseCode)) continue;

    const day = normalizeDay(s.day);
    const period = Math.min(9, Math.max(1, Number(s.period) || 0));
    if (!day || period < 1) continue;

    let branch: ParsedBranch | null = null;
    if (s.branchCode && s.semester) {
      const code = normalizeBranchCode(s.branchCode);
      const section = (s.section || "A").toUpperCase();
      const key = branchKey(code, s.semester, section);
      branch = branchMap.get(key) || null;
      if (!branch) {
        branch = {
          code,
          name: code === "CS" ? "Computer Science" : code,
          semester: s.semester,
          section,
          key,
        };
        branchMap.set(key, branch);
        branches.push(branch);
      }
    } else if (primaryBranch) {
      branch = primaryBranch;
    }

    const times = PERIOD_TIMES[period];
    slots.push({
      day,
      period,
      startTime: times.start,
      endTime: times.end,
      courseCode,
      roomId: s.roomId?.toString().trim() || null,
      facultyName: (() => {
        const raw = s.facultyName?.toString().trim();
        if (!raw) return null;
        const names = splitFacultyNames(raw).filter(isValidFacultyName);
        return names.length > 0 ? names.join(" & ") : null;
      })(),
      branchKey: branch?.key,
    });
  }

  const parsed: ParsedData = {
    department: payload.department?.trim() || "Computer Science & Engineering",
    branches,
    rooms: (payload.rooms || []).map((r) => String(r).trim()).filter(Boolean),
    courses,
    faculty: (payload.faculty || [])
      .map((f) => String(f).trim())
      .filter(Boolean),
    slots,
    parseErrors: [],
    parseMethod: "vision",
  };

  return { parsed, primaryBranch };
}

function summarizeBranch(branch: ParsedBranch | null): string | null {
  if (!branch) return null;
  return `${branch.code} Sem ${branch.semester}${branch.section ? ` ${branch.section}` : ""}`;
}

export async function visionPdfPages(
  filePath: string,
  onPageComplete?: (
    page: OcrPageResult,
    index: number,
    total: number,
  ) => Promise<void>,
): Promise<{ pages: OcrPageResult[]; pagePayloads: VisionPayload[] }> {
  if (!(await isPopplerAvailable())) {
    throw new Error(
      "Vision PDF parsing requires poppler-utils (pdftoppm). Run via the Docker worker image.",
    );
  }
  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is not set on the worker. Add it to docker-compose env to enable vision parsing.",
    );
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "samayak-pdf-vision-"));
  const pages: OcrPageResult[] = [];
  const pagePayloads: VisionPayload[] = [];
  let currentBranch: ParsedBranch | null = null;

  try {
    const pngs = await convertPdfToPngs(filePath, tmpDir);

    for (let i = 0; i < pngs.length; i++) {
      const pageNumber = i + 1;
      let payload: VisionPayload | null = null;
      let errorReason: string | null = null;

      try {
        payload = await callGroqVision(pngs[i]);
      } catch (e) {
        errorReason = (e as Error).message;
      }

      const safePayload = payload ?? {};
      const { parsed, primaryBranch } = visionPayloadToParsed(
        safePayload,
        currentBranch,
      );
      if (primaryBranch) currentBranch = primaryBranch;

      pagePayloads.push(safePayload);

      const rawJson = JSON.stringify(safePayload, null, 2);
      const page: OcrPageResult = {
        pageNumber,
        ocrText: errorReason
          ? `[vision error] ${errorReason}\n\n${rawJson}`
          : rawJson,
        charCount: rawJson.length,
        preview: errorReason
          ? `Vision error: ${errorReason.slice(0, 200)}`
          : `${parsed.slots.length} slots, ${parsed.courses.length} courses, ${parsed.branches.length} branches`,
        branch: summarizeBranch(primaryBranch || currentBranch),
        slotsFound: parsed.slots.length,
        coursesFound: parsed.courses.length,
        confirmed: false,
        rejected: false,
      };
      pages.push(page);

      if (onPageComplete) {
        await onPageComplete(page, pageNumber, pngs.length);
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return { pages, pagePayloads };
}

export function mergeVisionPayloads(payloads: VisionPayload[]): ParsedData {
  const merged: ParsedData = {
    department: "",
    branches: [],
    rooms: [],
    courses: [],
    faculty: [],
    slots: [],
    parseErrors: [],
    parseMethod: "vision",
  };

  const branchSet = new Set<string>();
  const courseSet = new Set<string>();
  const facultySet = new Set<string>();
  const roomSet = new Set<string>();
  let currentBranch: ParsedBranch | null = null;

  for (const payload of payloads) {
    const { parsed, primaryBranch } = visionPayloadToParsed(
      payload,
      currentBranch,
    );
    if (primaryBranch) currentBranch = primaryBranch;

    if (!merged.department && parsed.department)
      merged.department = parsed.department;

    for (const b of parsed.branches) {
      if (!branchSet.has(b.key)) {
        branchSet.add(b.key);
        merged.branches.push(b);
      }
    }

    for (const c of parsed.courses) {
      const key = `${c.code}-${c.branchKey || "default"}`;
      if (!courseSet.has(key)) {
        courseSet.add(key);
        merged.courses.push(c);
      }
    }

    merged.slots.push(...parsed.slots);
    parsed.rooms.forEach((r) => roomSet.add(r));
    parsed.faculty.forEach((f) => facultySet.add(f));
  }

  merged.rooms = Array.from(roomSet);
  merged.faculty = Array.from(facultySet);
  if (!merged.department) merged.department = "Computer Science & Engineering";

  if (
    merged.branches.length === 0 &&
    (merged.slots.length > 0 || merged.courses.length > 0)
  ) {
    const fallback: ParsedBranch = {
      name: "Computer Science",
      code: "CS",
      semester: 6,
      section: "A",
      key: branchKey("CS", 6, "A"),
    };
    merged.branches.push(fallback);
    merged.slots.forEach((s) => {
      if (!s.branchKey) s.branchKey = fallback.key;
    });
    merged.courses.forEach((c) => {
      if (!c.branchKey) c.branchKey = fallback.key;
    });
  }

  return merged;
}

export function parseFromVisionPages(pages: OcrPageResult[]): ParsedData {
  const confirmed = pages.filter((p) => p.confirmed && !p.rejected);
  const payloads: VisionPayload[] = [];
  for (const page of confirmed) {
    const stripped = page.ocrText.replace(/^\[vision error\][^\n]*\n+/, "");
    try {
      payloads.push(JSON.parse(stripped) as VisionPayload);
    } catch {
      // skip malformed page
    }
  }
  return mergeVisionPayloads(payloads);
}

export async function parsePdfViaVision(filePath: string): Promise<ParsedData> {
  try {
    const { pages, pagePayloads } = await visionPdfPages(filePath);
    pages.forEach((p) => {
      p.confirmed = true;
    });
    const merged = mergeVisionPayloads(pagePayloads);
    return merged;
  } catch (err) {
    return {
      department: "Computer Science & Engineering",
      branches: [],
      rooms: [],
      courses: [],
      faculty: [],
      slots: [],
      parseErrors: [
        { row: 0, reason: `Vision pipeline failed: ${(err as Error).message}` },
      ],
      parseMethod: "vision",
    };
  }
}
