import { Job } from "bullmq";
import { PrismaClient, RoomType, CourseType, Prisma } from "@prisma/client";
import IORedis from "ioredis";
import {
  parseTimetablePdfTextOnly,
  type ParsedBranch,
  type ParsedData,
} from "../lib/pdf-parser";
import { isValidFacultyName, splitFacultyNames as splitCellFacultyNames } from "../lib/pdf-parser-utils";
import { visionPdfPages, parseFromVisionPages } from "../lib/pdf-vision-parser";
import type { OcrPageResult, PdfJobMetadata } from "../lib/pdf-job-metadata";

const prisma = new PrismaClient();
const redis = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

function logJob(
  importJobId: string,
  message: string,
  extra?: Record<string, unknown>
) {
  const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[pdf-ingestion][${importJobId}] ${message}${suffix}`);
}

function normalizeRoomNumber(room: string): string {
  return room.trim().replace(/\s+/g, " ");
}

function inferRoomType(roomNum: string): RoomType {
  if (/lab/i.test(roomNum)) return RoomType.LAB;
  return RoomType.CLASSROOM;
}

function inferCourseType(code: string): CourseType {
  if (/\d{3}[lL]$/.test(code) || /lab/i.test(code)) return CourseType.LAB;
  if (/tutorial/i.test(code)) return CourseType.TUTORIAL;
  return CourseType.LECTURE;
}

function inferCredits(code: string): number {
  if (/^NC$/i.test(code)) return 0;
  if (/\d{3}[lL]$/.test(code)) return 2;
  return 3;
}

function branchLookupKey(b: ParsedBranch): string {
  return `${b.code}-${b.semester}-${b.section || "A"}`;
}

const DEPT_FROM_NAME_REGEXES: RegExp[] = [
  /\(?\s*(department of [a-z&\s-]+?)(?=\s*[,)\]\n]|$)/i,
  /\(?\s*(dept\.?\s+of\s+[a-z&\s-]+?)(?=\s*[,)\]\n]|$)/i,
  /\(?\s*([a-z&\s-]+? (?:department|dept\.?))(?=\s*[,)\]\n]|$)/i,
];

function isTutorialGroup(label: string): boolean {
  return /^group\s*\d+$/i.test(label.trim());
}

function normalizeDeptLabel(label: string): string {
  const trimmed = label.replace(/\s+/g, " ").trim();
  if (/department/i.test(trimmed)) {
    return trimmed.replace(/\bdept\.?\b/i, "Department").trim();
  }
  return trimmed;
}

function extractDepartmentFromName(raw: string): { name: string; dept: string | null } {
  let name = raw.trim();
  let dept: string | null = null;

  const bracketRegex = /\(([^)]+)\)/g;
  let bracketMatch: RegExpExecArray | null;
  const bracketSegments: Array<{ full: string; content: string }> = [];
  while ((bracketMatch = bracketRegex.exec(name)) !== null) {
    bracketSegments.push({ full: bracketMatch[0], content: bracketMatch[1].trim() });
  }
  for (const { full, content } of bracketSegments) {
    if (isTutorialGroup(content)) {
      name = name.replace(full, " ");
    } else if (!dept) {
      dept = normalizeDeptLabel(content);
      name = name.replace(full, " ");
    } else {
      name = name.replace(full, " ");
    }
  }

  for (const re of DEPT_FROM_NAME_REGEXES) {
    const m = name.match(re);
    if (m) {
      dept = m[1]
        .replace(/\bdept\.?\b/i, "Department")
        .replace(/\s+/g, " ")
        .trim();
      const trailing = dept.match(/^(.+?)\s+department$/i);
      if (trailing) dept = `Department of ${trailing[1].trim()}`;
      name = name.replace(m[0], " ");
      break;
    }
  }

  name = name
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { name, dept };
}

function splitFacultyNames(raw: string): string[] {
  return splitCellFacultyNames(raw);
}

function nameToEmail(name: string): string {
  const local = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // drop existing dots/punctuation
    .trim()
    .replace(/\s+/g, ".");
  return `${local}@bit.ac.in`;
}

function normalizeFacultyList(
  raw: string[],
  fallbackDepartment: string
): { faculty: Array<{ name: string; department: string }>; primaryDepartment: string } {
  const seen = new Map<string, { name: string; department: string }>();
  let primaryDepartment = fallbackDepartment;

  for (const entry of raw) {
    if (!entry) continue;
    for (const piece of splitFacultyNames(entry)) {
      const { name, dept } = extractDepartmentFromName(piece);
      if (!name || !isValidFacultyName(name)) continue;
      const department = dept || fallbackDepartment;
      if (dept && (!primaryDepartment || /computer science/i.test(primaryDepartment))) {
        // Prefer a department explicitly mentioned alongside a name if we only
        // have the generic CSE default so far.
        primaryDepartment = dept;
      }
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, { name, department });
    }
  }

  return { faculty: Array.from(seen.values()), primaryDepartment };
}

async function integrateParsedData(
  parsed: ParsedData,
  importJobId: string,
  job: Job
): Promise<{ created: number; matched: number; failed: number; errors: Array<{ row: number; reason: string }> }> {
  let created = 0;
  let matched = 0;
  let failed = 0;
  const errors: Array<{ row: number; reason: string }> = [...parsed.parseErrors];

  logJob(importJobId, "Integrating parsed data into database", {
    branches: parsed.branches.length,
    rooms: parsed.rooms.length,
    courses: parsed.courses.length,
    slots: parsed.slots.length,
    faculty: parsed.faculty.length,
    parseMethod: parsed.parseMethod,
  });

  await prisma.importJob.update({
    where: { id: importJobId },
    data: { status: "INTEGRATING" },
  });
  await job.updateProgress(55);

  const facultySources = [
    ...parsed.faculty,
    ...parsed.slots
      .map((s) => s.facultyName)
      .filter((n): n is string => Boolean(n)),
  ];
  const { faculty: normalizedFaculty, primaryDepartment } = normalizeFacultyList(
    facultySources,
    parsed.department
  );

  const effectiveDepartmentName = primaryDepartment || parsed.department || "Unknown Department";

  const deptCode =
    effectiveDepartmentName
      .replace(/department of/i, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 10) || "DEPT";

  const department = await prisma.department.upsert({
    where: { code: deptCode === "C" ? "CSE" : deptCode },
    update: {},
    create: {
      name: effectiveDepartmentName,
      code: deptCode === "C" ? "CSE" : deptCode,
    },
  });

  const branchMap = new Map<string, string>();
  for (const b of parsed.branches) {
    const key = branchLookupKey(b);
    try {
      const existing = await prisma.branch.findFirst({
        where: {
          departmentId: department.id,
          code: b.code,
          semester: b.semester,
          section: b.section || "A",
        },
      });
      if (existing) {
        branchMap.set(key, existing.id);
        matched++;
      } else {
        const branch = await prisma.branch.create({
          data: {
            name: b.name,
            code: b.code,
            departmentId: department.id,
            semester: b.semester,
            section: b.section || "A",
          },
        });
        branchMap.set(key, branch.id);
        created++;
      }
    } catch {
      matched++;
    }
  }

  const defaultBranchId =
    branchMap.values().next().value ||
    (
      await prisma.branch.findFirst({
        where: { departmentId: department.id },
      })
    )?.id;

  const roomMap = new Map<string, string>();
  for (const roomNum of parsed.rooms) {
    const normalized = normalizeRoomNumber(roomNum);
    const existing = await prisma.room.findFirst({
      where: {
        departmentId: department.id,
        roomNumber: normalized,
      },
    });
    if (existing) {
      roomMap.set(normalized, existing.id);
      roomMap.set(roomNum, existing.id);
      matched++;
    } else {
      const room = await prisma.room.create({
        data: {
          roomNumber: normalized,
          departmentId: department.id,
          capacity: inferRoomType(normalized) === RoomType.LAB ? 40 : 60,
          type: inferRoomType(normalized),
        },
      });
      roomMap.set(normalized, room.id);
      roomMap.set(roomNum, room.id);
      created++;
    }
  }

  await job.updateProgress(70);

  const courseMap = new Map<string, string>();
  for (const c of parsed.courses) {
    const branchId = c.branchKey
      ? branchMap.get(c.branchKey) || defaultBranchId
      : defaultBranchId;

    if (!branchId) {
      errors.push({ row: 0, reason: `No branch for course ${c.code}` });
      continue;
    }

    const existing = await prisma.course.findFirst({
      where: { code: c.code, branchId },
    });

    if (existing) {
      courseMap.set(`${c.code}-${branchId}`, existing.id);
      matched++;
    } else {
      const course = await prisma.course.create({
        data: {
          code: c.code,
          name: c.name,
          credits: inferCredits(c.code),
          type: inferCourseType(c.code),
          departmentId: department.id,
          branchId,
        },
      });
      courseMap.set(`${c.code}-${branchId}`, course.id);
      created++;
    }
  }

  await job.updateProgress(85);

  const slotKeys = new Set<string>();
  const courseFacultyLinks = new Map<string, Set<string>>();

  for (let i = 0; i < parsed.slots.length; i++) {
    const slot = parsed.slots[i];
    try {
      const branchId = slot.branchKey
        ? branchMap.get(slot.branchKey) || defaultBranchId
        : defaultBranchId;

      const courseId = slot.courseCode
        ? courseMap.get(`${slot.courseCode}-${branchId}`) ||
          (
            await prisma.course.findFirst({
              where: { code: slot.courseCode, branchId: branchId! },
            })
          )?.id
        : null;

      const roomId = slot.roomId
        ? roomMap.get(slot.roomId) ||
          roomMap.get(normalizeRoomNumber(slot.roomId))
        : null;

      if (!courseId && !roomId) continue;

      const dedupeKey = `${slot.day}-${slot.period}-${roomId}-${courseId}`;
      if (slotKeys.has(dedupeKey)) {
        matched++;
        continue;
      }
      slotKeys.add(dedupeKey);

      const existing = await prisma.timeSlot.findFirst({
        where: {
          day: slot.day,
          period: slot.period,
          roomId: roomId || undefined,
          courseId: courseId || undefined,
        },
      });

      if (existing) {
        matched++;
        continue;
      }

      await prisma.timeSlot.create({
        data: {
          day: slot.day,
          period: slot.period,
          startTime: slot.startTime,
          endTime: slot.endTime,
          courseId: courseId || null,
          roomId: roomId || null,
        },
      });
      created++;

      if (courseId && slot.facultyName) {
        if (!courseFacultyLinks.has(courseId)) {
          courseFacultyLinks.set(courseId, new Set());
        }
        const emails = courseFacultyLinks.get(courseId)!;
        for (const facultyPiece of splitFacultyNames(slot.facultyName)) {
          if (isValidFacultyName(facultyPiece)) {
            emails.add(nameToEmail(facultyPiece));
          }
        }
      }
    } catch (e) {
      failed++;
      errors.push({
        row: i + 1,
        reason: `Failed to create slot: ${(e as Error).message}`,
      });
    }
  }

  const facultyDeptCache = new Map<string, string>();
  facultyDeptCache.set(department.name.toLowerCase(), department.id);

  for (const { name, department: facultyDeptName } of normalizedFaculty) {
    if (!name) continue;

    const email = nameToEmail(name);

    let facultyDeptId = department.id;
    if (facultyDeptName && facultyDeptName.toLowerCase() !== department.name.toLowerCase()) {
      const cacheKey = facultyDeptName.toLowerCase();
      const cached = facultyDeptCache.get(cacheKey);
      if (cached) {
        facultyDeptId = cached;
      } else {
        const code =
          facultyDeptName
            .replace(/department of/i, "")
            .split(/\s+/)
            .filter(Boolean)
            .map((w) => w[0])
            .join("")
            .toUpperCase()
            .slice(0, 10) || "DEPT";
        const dept = await prisma.department.upsert({
          where: { code },
          update: {},
          create: { name: facultyDeptName, code },
        });
        facultyDeptId = dept.id;
        facultyDeptCache.set(cacheKey, dept.id);
      }
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      matched++;
      continue;
    }

    await prisma.user.create({
      data: {
        name,
        email,
        role: "PROFESSOR",
        departmentId: facultyDeptId,
      },
    });
    created++;
  }

  for (const [courseId, emails] of courseFacultyLinks) {
    const users = await prisma.user.findMany({
      where: { email: { in: [...emails] } },
      select: { id: true },
    });
    if (users.length === 0) continue;
    await prisma.course.update({
      where: { id: courseId },
      data: {
        faculty: { connect: users.map((u) => ({ id: u.id })) },
      },
    });
  }

  await job.updateProgress(95);

  await prisma.importJob.update({
    where: { id: importJobId },
    data: {
      status: "DONE",
      createdCount: created,
      matchedCount: matched,
      failedCount: failed,
      errors: errors.length > 0 ? errors : undefined,
    },
  });

  await redis.del("analytics:all");
  await job.updateProgress(100);

  logJob(importJobId, "Integration complete", { created, matched, failed });

  return { created, matched, failed, errors };
}

async function runVisionAndIntegrate(job: Job) {
  const { filePath, importJobId } = job.data;
  const pages: OcrPageResult[] = [];

  await prisma.importJob.update({
    where: { id: importJobId },
    data: { status: "PARSING" },
  });

  logJob(importJobId, "Starting vision-LLM pipeline (Groq)", { filePath });

  await visionPdfPages(filePath, async (page, current, total) => {
    logJob(importJobId, `Vision page ${current}/${total}`, {
      branch: page.branch,
      slotsFound: page.slotsFound,
      coursesFound: page.coursesFound,
    });
    pages.push(page);
    const metadata: PdfJobMetadata = {
      filePath,
      parseMethod: "vision",
      pages: pages.map((p) => ({ ...p, confirmed: true, rejected: false })),
      ocrProgress: { current, total },
    };

    await prisma.importJob.update({
      where: { id: importJobId },
      data: { metadata: metadata as unknown as Prisma.InputJsonValue },
    });

    await job.updateProgress(Math.round((current / total) * 45));
  });

  if (pages.length === 0) {
    throw new Error("Vision pipeline produced no pages — check that pdftoppm is installed");
  }

  pages.forEach((p) => {
    p.confirmed = true;
    p.rejected = false;
  });

  const parsed = parseFromVisionPages(pages);

  if (parsed.slots.length === 0 && parsed.courses.length === 0) {
    throw new Error(
      "Vision LLM completed but no timetable data could be extracted from this PDF."
    );
  }

  await prisma.importJob.update({
    where: { id: importJobId },
    data: {
      metadata: {
        filePath,
        parseMethod: parsed.parseMethod,
        pages,
        ocrProgress: { current: pages.length, total: pages.length },
        autoImported: true,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await job.updateProgress(50);
  return integrateParsedData(parsed, importJobId, job);
}

export async function processPdfIngestion(job: Job) {
  const { filePath, importJobId } = job.data;

  try {
    logJob(importJobId, "Worker picked up job", { filePath });

    await prisma.importJob.update({
      where: { id: importJobId },
      data: { status: "PARSING" },
    });
    await job.updateProgress(10);

    const textParsed = await parseTimetablePdfTextOnly(filePath);
    if (textParsed) {
      logJob(importJobId, "Text-based PDF parse succeeded", {
        branches: textParsed.branches.length,
        slots: textParsed.slots.length,
        courses: textParsed.courses.length,
      });
      await prisma.importJob.update({
        where: { id: importJobId },
        data: {
          metadata: { filePath, parseMethod: "text" } as unknown as Prisma.InputJsonValue,
        },
      });
      await job.updateProgress(40);
      return integrateParsedData(textParsed, importJobId, job);
    }

    logJob(importJobId, "No extractable text — falling back to vision LLM");
    return runVisionAndIntegrate(job);
  } catch (e) {
    logJob(importJobId, "Job failed", { error: (e as Error).message });
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: "FAILED",
        failedCount: 1,
        errors: [{ row: 0, reason: `Job failed: ${(e as Error).message}` }],
      },
    });
    throw e;
  }
}
