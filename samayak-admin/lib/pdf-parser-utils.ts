export const TEACHING_PERIODS_PER_DAY = 9;

export const LUNCH_BREAK = { start: "12:50", end: "13:30" };

export const PERIOD_TIMES_EXPORT: Record<
  number,
  { start: string; end: string }
> = {
  1: { start: "08:00", end: "08:50" },
  2: { start: "09:00", end: "09:50" },
  3: { start: "10:00", end: "10:50" },
  4: { start: "11:00", end: "11:50" },
  5: { start: "12:00", end: "12:50" },
  6: { start: "13:30", end: "14:20" },
  7: { start: "14:30", end: "15:20" },
  8: { start: "15:30", end: "16:20" },
  9: { start: "16:30", end: "17:20" },
};

const ROMAN_MAP: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
};

const FACULTY_SPLIT_REGEX = /\s+(?:and|&)\s+|\s*[,;]\s*/i;
const SINGLE_FACULTY_BLOCK =
  /^(?:Dr|Prof|Mr|Ms|Mrs)\.?\s+(?:(?:[A-Z]\.\s*){0,5}[A-Za-z]+)(?:\s*\([^)]+\))?/i;
const BRACKETED_CODE_RE = /\(([A-Za-z0-9]+)\)/g;

export function branchKey(
  code: string,
  semester: number,
  section: string | null,
): string {
  return `${code}-${semester}-${section || "A"}`;
}

export function isCourseCodeToken(token: string): boolean {
  const c = token.trim().toUpperCase();
  if (!c || c === "NC" || c === "BREAK" || c === "LUNCH") return false;
  return /^[A-Z]{2,5}\d{1,4}[A-Z]?$/.test(c);
}

export function isValidFacultyName(name: string): boolean {
  const n = name.trim();
  if (n.length < 2) return false;
  if (!/[a-zA-Z]/.test(n)) return false;
  if (/^[^a-zA-Z0-9]+$/.test(n)) return false;
  return true;
}

export function splitFacultyNames(raw: string): string[] {
  return raw
    .split(FACULTY_SPLIT_REGEX)
    .map((s) => s.trim())
    .filter((s) => isValidFacultyName(s));
}

function parseRoomFromLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || /^break$/i.test(trimmed) || /^lunch$/i.test(trimmed))
    return null;
  if (/\b(?:dr|prof|mr|ms|mrs)\.?\b/i.test(trimmed)) return null;

  const labMatch = trimmed.match(/^lab\s*\d+/i);
  if (labMatch) return labMatch[0].replace(/\s+/g, " ");

  const slashRoom = trimmed.match(/^[/-]\s*([\w.]+)/);
  if (slashRoom) return slashRoom[1].trim();

  if (/^\d{2,3}[A-Za-z]?$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^[\w.\s-]{1,24}$/.test(trimmed)) return trimmed;

  return null;
}

function peelFacultyFromCourseLine(beforeBracket: string): {
  faculty: string[];
  courseName: string;
} {
  let rest = beforeBracket.trim();
  const faculty: string[] = [];

  if (!rest) return { faculty, courseName: "" };
  if (!/^(?:Dr|Prof|Mr|Ms|Mrs)\.?\s/i.test(rest)) {
    return { faculty, courseName: rest };
  }

  while (/^(?:Dr|Prof|Mr|Ms|Mrs)\.?\s/i.test(rest)) {
    const match = rest.match(SINGLE_FACULTY_BLOCK);
    if (!match) break;
    faculty.push(...splitFacultyNames(match[0].trim()));
    rest = rest.slice(match[0].length).trim();
    const andSep = rest.match(/^(?:and|&)\s+/i);
    if (andSep) rest = rest.slice(andSep[0].length).trim();
    else break;
  }

  return { faculty, courseName: rest.trim() };
}

function findBracketedCourse(line: string): {
  code: string;
  nameBefore: string;
  after: string;
} | null {
  let match: RegExpExecArray | null;
  const re = new RegExp(BRACKETED_CODE_RE.source, "g");
  while ((match = re.exec(line)) !== null) {
    const code = match[1].trim().toUpperCase();
    if (!isCourseCodeToken(code)) continue;
    return {
      code,
      nameBefore: line.slice(0, match.index).trim(),
      after: line.slice(match.index + match[0].length).trim(),
    };
  }
  return null;
}

function parseLegacyCodeLine(mainPart: string): {
  courseCode: string | null;
  roomId: string | null;
} {
  const dashMatch = mainPart.match(/^([A-Z]{2,}\d{0,4}[A-Z]?)\s*[-/]\s*(.+)/i);
  if (dashMatch) {
    const courseCode = dashMatch[1].trim().toUpperCase();
    if (!isCourseCodeToken(courseCode))
      return { courseCode: null, roomId: null };
    const roomId = dashMatch[2]
      .trim()
      .replace(/\s*\(.*/, "")
      .split(/[\s,/]/)[0];
    return { courseCode, roomId };
  }

  const codeMatch = mainPart.match(/^([A-Z]{2,}\d{0,4}[A-Z]?)/i);
  if (codeMatch) {
    const courseCode = codeMatch[1].toUpperCase();
    if (!isCourseCodeToken(courseCode))
      return { courseCode: null, roomId: null };
    return { courseCode, roomId: null };
  }

  return { courseCode: null, roomId: null };
}

export function parseCellContent(cell: string): {
  courseCode: string | null;
  courseName: string | null;
  roomId: string | null;
  facultyName: string | null;
} {
  const trimmed = cell.trim();
  if (
    !trimmed ||
    trimmed === "-" ||
    /^break$/i.test(trimmed) ||
    /^lunch$/i.test(trimmed) ||
    /^NC$/i.test(trimmed)
  ) {
    return {
      courseCode: null,
      courseName: null,
      roomId: null,
      facultyName: null,
    };
  }

  const lines = trimmed
    .split(/[\n\r]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const facultyParts: string[] = [];
  let courseCode: string | null = null;
  let courseName: string | null = null;
  let roomId: string | null = null;
  let courseLineIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const bracketed = findBracketedCourse(lines[i]);
    if (!bracketed) continue;

    courseLineIdx = i;
    courseCode = bracketed.code;
    const peeled = peelFacultyFromCourseLine(bracketed.nameBefore);
    facultyParts.push(...peeled.faculty);
    courseName = peeled.courseName || null;

    const roomAfter = parseRoomFromLine(
      bracketed.after.replace(/^[/-]\s*/, "").trim(),
    );
    if (roomAfter) roomId = roomAfter;
    break;
  }

  if (!courseCode) {
    const legacy = parseLegacyCodeLine(lines[0]?.replace(/\s+/g, " ") || "");
    courseCode = legacy.courseCode;
    roomId = legacy.roomId;
    courseName = courseCode;
    if (lines.length > 1) {
      facultyParts.push(...splitFacultyNames(lines.slice(1).join(" ")));
    }
  } else {
    for (let i = 0; i < courseLineIdx; i++) {
      facultyParts.push(...splitFacultyNames(lines[i]));
    }
    if (!roomId && courseLineIdx >= 0 && courseLineIdx + 1 < lines.length) {
      roomId = parseRoomFromLine(lines[courseLineIdx + 1]);
    }
  }

  const facultyName = facultyParts.length > 0 ? facultyParts.join(" & ") : null;

  return {
    courseCode,
    courseName: courseName || courseCode,
    roomId,
    facultyName,
  };
}

export function parseBranchHeader(line: string): {
  name: string;
  code: string;
  semester: number;
  section: string | null;
  key: string;
} | null {
  const normalized = line.replace(/\s+/g, " ").trim();

  const patterns = [
    /([A-Za-z.&\s]+?)\s+(?:Section\s+)?([A-D])\s*[-–—]\s*Semester\s+([IVXLCDM]+|\d+)/i,
    /(CS|AIML|MCA|M\.?\s*TECH|MTECH)\s+(?:Section\s+)?([A-D])?\s*[-–—]\s*Sem(?:ester)?\.?\s*([IVXLCDM]+|\d+)/i,
    /(CS|AIML|MCA|MTECH)\s+([A-D])\s+Sem\s*([IVXLCDM]+|\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;

    let nameRaw = match[1].trim();
    const section = (match[2] || "A").toUpperCase();
    const semesterStr = match[3].toUpperCase();
    const semester = ROMAN_MAP[semesterStr] || parseInt(semesterStr, 10) || 0;

    let code = nameRaw.replace(/\s+/g, "").toUpperCase();
    if (/M\.?\s*TECH/i.test(nameRaw)) {
      code = "MTECH";
      nameRaw = "M.Tech";
    }
    if (/^AI/i.test(code) || code === "AIML") code = "AIML";
    if (code === "CS" || /^COMPUTER/i.test(nameRaw)) {
      code = "CS";
      nameRaw = "Computer Science";
    }

    if (semester <= 0) continue;

    return {
      name: nameRaw,
      code,
      semester,
      section,
      key: branchKey(code, semester, section),
    };
  }
  return null;
}
