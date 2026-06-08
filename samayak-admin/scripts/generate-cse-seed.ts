/**
 * Generates prisma/data/cse-seed.json from the CSE timetable PDF (OCR).
 * Run inside Docker worker: node dist/scripts/generate-cse-seed.js
 */
import fs from "fs";
import path from "path";
import { parseTimetablePdf } from "../lib/pdf-parser";
import type { ParsedData } from "../lib/pdf-parser";
import { isValidFacultyName } from "../lib/pdf-parser-utils";

const ASSIGNMENT_ROOMS: Record<
  string,
  { capacity: number; type: "CLASSROOM" | "LAB" }
> = {
  "219": { capacity: 60, type: "CLASSROOM" },
  "220": { capacity: 60, type: "CLASSROOM" },
  "233A": { capacity: 120, type: "CLASSROOM" },
  "Lab 1": { capacity: 40, type: "LAB" },
  "Lab 2": { capacity: 40, type: "LAB" },
  "Lab 3": { capacity: 40, type: "LAB" },
  "Lab 4": { capacity: 40, type: "LAB" },
  "Lab 5": { capacity: 40, type: "LAB" },
  "Lab 6": { capacity: 40, type: "LAB" },
  "Lab 7": { capacity: 40, type: "LAB" },
};

const BRANCH_NAMES: Record<string, string> = {
  CS: "Computer Science",
  AIML: "AI & Machine Learning",
  MCA: "MCA",
  MTECH: "M.Tech",
};

function normalizeRoom(room: string): string | null {
  let trimmed = room.trim().replace(/\s+/g, " ");
  trimmed = trimmed.replace(/^[Gg](\d)/, "$1");

  const labMatch = trimmed.match(/^(?:Lab\s*)?(\d+)$/i);
  if (/^lab/i.test(trimmed) || (labMatch && parseInt(labMatch[1], 10) <= 7)) {
    const n = trimmed.match(/\d+/)?.[0];
    return n && parseInt(n, 10) <= 7 ? `Lab ${n}` : null;
  }

  const upper = trimmed.toUpperCase().replace(/\s+/g, "");
  if (upper === "233A" || upper === "233A") return "233A";
  if (/^2(19|20|33A?|34|35|36)$/.test(upper)) {
    if (upper.startsWith("233")) return "233A";
    return upper;
  }
  if (/^\d{3}[A-Z]?$/.test(upper)) return upper;
  return null;
}

const GARBAGE_COURSE_CODES = new Set([
  "AB",
  "AL",
  "LAB",
  "AIML",
  "ES",
  "IR",
  "USL",
  "MAL",
]);

function isValidCourseCode(code: string): boolean {
  const c = code.trim().toUpperCase();
  if (c.length < 2 || GARBAGE_COURSE_CODES.has(c)) return false;
  if (/^(MON|TUE|WED|THU|FRI|SAT|BREAK|LUNCH|NC)$/i.test(c)) return false;
  return /^[A-Z]{2,5}\d{0,4}[A-Z]?$/.test(c);
}

function isAllowedRoom(room: string): boolean {
  const n = normalizeRoom(room);
  return n !== null && n in ASSIGNMENT_ROOMS;
}

function inferCourseType(code: string): "LECTURE" | "LAB" | "TUTORIAL" {
  if (/\d{3}[lL]$/.test(code) || /lab/i.test(code)) return "LAB";
  if (/seminar|tutorial/i.test(code)) return "TUTORIAL";
  return "LECTURE";
}

function inferCredits(code: string, name: string): number {
  if (/^NC$/i.test(code)) return 0;
  if (/seminar/i.test(name) || /seminar/i.test(code)) return 0;
  if (/\d{3}[lL]$/.test(code)) return 2;
  const m = name.match(/\b(\d+(?:\.\d+)?)\s*credit/i);
  if (m) return Math.round(parseFloat(m[1]));
  return 3;
}

function facultyEmail(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/^(dr\.|prof\.|mr\.|ms\.|mrs\.)\s*/i, "")
      .replace(/[^a-z\s.]/g, "")
      .trim()
      .replace(/\s+/g, ".") + "@bit.ac.in"
  );
}

function branchGroupKey(code: string, semester: number): string {
  return `${code}-${semester}`;
}

function toSeed(parsed: ParsedData) {
  const branchSections = new Map<string, Set<string>>();
  for (const b of parsed.branches) {
    const group = branchGroupKey(b.code, b.semester);
    if (!branchSections.has(group)) branchSections.set(group, new Set());
    branchSections.get(group)!.add(b.section || "A");
  }

  // Only branches that appear in parsed data (with slots or courses)
  const activeBranchKeys = new Set<string>();
  for (const s of parsed.slots) {
    if (s.branchKey) activeBranchKeys.add(s.branchKey);
  }
  for (const c of parsed.courses) {
    if (c.branchKey) activeBranchKeys.add(c.branchKey);
  }

  const branches = parsed.branches
    .filter((b) => activeBranchKeys.has(b.key))
    .reduce(
      (acc, b) => {
        const group = branchGroupKey(b.code, b.semester);
        let entry = acc.find(
          (x) => x.code === b.code && x.semester === b.semester,
        );
        if (!entry) {
          entry = {
            name: BRANCH_NAMES[b.code] || b.name,
            code: b.code,
            semester: b.semester,
            sections: [],
          };
          acc.push(entry);
        }
        const sec = b.section || "A";
        if (!entry.sections.includes(sec)) entry.sections.push(sec);
        return acc;
      },
      [] as Array<{
        name: string;
        code: string;
        semester: number;
        sections: string[];
      }>,
    );

  for (const b of branches) {
    b.sections.sort();
  }

  const roomsUsed = new Set<string>();
  for (const s of parsed.slots) {
    if (s.roomId) {
      const n = normalizeRoom(s.roomId);
      if (n && isAllowedRoom(n)) roomsUsed.add(n);
    }
  }

  const rooms = [...roomsUsed]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((roomNumber) => ({
      roomNumber,
      capacity: ASSIGNMENT_ROOMS[roomNumber].capacity,
      type: ASSIGNMENT_ROOMS[roomNumber].type,
    }));

  const courseMeta = new Map<
    string,
    { code: string; name: string; credits: number; type: string }
  >();
  for (const c of parsed.courses) {
    if (!isValidCourseCode(c.code)) continue;
    const type = inferCourseType(c.code);
    const credits = inferCredits(c.code, c.name);
    const existing = courseMeta.get(c.code);
    if (!existing || (c.name !== c.code && existing.name === existing.code)) {
      courseMeta.set(c.code, {
        code: c.code,
        name: c.name === c.code ? c.code : c.name,
        credits,
        type,
      });
    }
  }
  for (const s of parsed.slots) {
    if (!s.courseCode || !isValidCourseCode(s.courseCode)) continue;
    if (!courseMeta.has(s.courseCode)) {
      courseMeta.set(s.courseCode, {
        code: s.courseCode,
        name: s.courseCode,
        credits: inferCredits(s.courseCode, s.courseCode),
        type: inferCourseType(s.courseCode),
      });
    }
  }

  const courses: Record<
    string,
    Array<{ code: string; name: string; credits: number; type: string }>
  > = {};
  for (const b of branches) {
    const group = branchGroupKey(b.code, b.semester);
    const codes = new Set<string>();
    for (const c of parsed.courses) {
      if (!c.branchKey) continue;
      const [code, semStr, sec] = c.branchKey.split("-");
      if (code === b.code && parseInt(semStr, 10) === b.semester) {
        codes.add(c.code);
      }
      void sec;
    }
    for (const s of parsed.slots) {
      if (!s.branchKey || !s.courseCode || !isValidCourseCode(s.courseCode))
        continue;
      const [code, semStr] = s.branchKey.split("-");
      if (code === b.code && parseInt(semStr, 10) === b.semester) {
        codes.add(s.courseCode);
      }
    }
    if (codes.size > 0) {
      courses[group] = [...codes].sort().map(
        (code) =>
          courseMeta.get(code) || {
            code,
            name: code,
            credits: inferCredits(code, code),
            type: inferCourseType(code),
          },
      );
    }
  }

  const facultyCourseMap = new Map<string, Set<string>>();
  const facultyNames = new Map<string, string>();

  for (const s of parsed.slots) {
    if (
      s.facultyName &&
      s.courseCode &&
      isValidFacultyName(s.facultyName) &&
      isValidCourseCode(s.courseCode)
    ) {
      const email = facultyEmail(s.facultyName);
      facultyNames.set(email, s.facultyName.trim());
      if (!facultyCourseMap.has(email)) facultyCourseMap.set(email, new Set());
      facultyCourseMap.get(email)!.add(s.courseCode);
    }
  }
  for (const name of parsed.faculty) {
    if (!isValidFacultyName(name)) continue;
    const email = facultyEmail(name);
    facultyNames.set(email, name.trim());
    if (!facultyCourseMap.has(email)) facultyCourseMap.set(email, new Set());
  }

  const faculty = [...facultyNames.entries()].map(([email, name]) => ({
    name,
    email,
    role: "PROFESSOR",
    courseCodes: [...(facultyCourseMap.get(email) || [])].sort(),
  }));

  const timetables: Record<
    string,
    Array<{ day: string; period: number; courseCode: string; room: string }>
  > = {};
  for (const s of parsed.slots) {
    if (
      !s.branchKey ||
      !s.courseCode ||
      !s.roomId ||
      !isValidCourseCode(s.courseCode)
    )
      continue;
    const room = normalizeRoom(s.roomId);
    if (!room || !isAllowedRoom(room)) continue;

    if (!timetables[s.branchKey]) timetables[s.branchKey] = [];
    timetables[s.branchKey].push({
      day: s.day,
      period: s.period,
      courseCode: s.courseCode,
      room,
    });
  }

  // Assignment Section 04: CS VI A-D and IV A-D; only keep branches with timetable data.
  const assignmentBranches = branches.filter((b) => {
    const hasSlots = Object.keys(timetables).some((key) => {
      const [code, sem, sec] = key.split("-");
      return (
        code === b.code &&
        parseInt(sem, 10) === b.semester &&
        b.sections.includes(sec)
      );
    });
    return hasSlots;
  });

  const allowedBranchGroups = new Set(
    assignmentBranches.map((b) => branchGroupKey(b.code, b.semester)),
  );
  const filteredCourses: typeof courses = {};
  for (const [k, v] of Object.entries(courses)) {
    if (allowedBranchGroups.has(k) && v.length > 0) filteredCourses[k] = v;
  }

  const allAssignmentRooms = Object.entries(ASSIGNMENT_ROOMS).map(
    ([roomNumber, meta]) => ({
      roomNumber,
      capacity: meta.capacity,
      type: meta.type,
    }),
  );

  return {
    department: { name: "Computer Science & Engineering", code: "CSE" },
    branches: assignmentBranches,
    rooms: allAssignmentRooms,
    courses: filteredCourses,
    faculty,
    timetables,
  };
}

async function main() {
  const pdfPath = process.argv[2] || path.join(__dirname, "../../CSE(8).pdf");
  const outPath =
    process.argv[3] || path.join(__dirname, "../prisma/data/cse-seed.json");

  console.log(`Parsing: ${pdfPath}`);
  const parsed = await parseTimetablePdf(pdfPath);
  console.log(
    `Method: ${parsed.parseMethod}, branches: ${parsed.branches.length}, slots: ${parsed.slots.length}, courses: ${parsed.courses.length}, faculty: ${parsed.faculty.length}`,
  );

  if (parsed.slots.length === 0 && parsed.courses.length === 0) {
    console.error("No data extracted from PDF.");
    process.exit(1);
  }

  const seed = toSeed(parsed);
  fs.writeFileSync(outPath, JSON.stringify(seed, null, 2) + "\n");
  console.log(`Wrote ${outPath}`);
  console.log(
    `Branches: ${seed.branches.length}, rooms: ${seed.rooms.length}, faculty: ${seed.faculty.length}, timetable keys: ${Object.keys(seed.timetables).length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
