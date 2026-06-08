import { Job } from "bullmq";
import { PrismaClient, RoomType, CourseType } from "@prisma/client";
import IORedis from "ioredis";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import fs from "fs";

const prisma = new PrismaClient();
const redis = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

interface BulkImportJobData {
  filePath: string;
  importJobId: string;
  entityType: "departments" | "rooms" | "courses" | "faculty";
  fileType: "CSV" | "EXCEL";
}

function parseFile(filePath: string, fileType: string): Record<string, string>[] {
  const buffer = fs.readFileSync(filePath);

  if (fileType === "CSV") {
    const text = buffer.toString("utf-8");
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim().toLowerCase(),
    });
    return result.data as Record<string, string>[];
  } else {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet) as Record<string, string>[];
    // Normalize headers to lowercase
    return data.map((row) => {
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[key.trim().toLowerCase()] = String(value).trim();
      }
      return normalized;
    });
  }
}

async function importDepartments(rows: Record<string, string>[]) {
  let created = 0, matched = 0, failed = 0;
  const errors: Array<{ row: number; reason: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const type = (row.type || "department").toLowerCase();
      if (type === "department") {
        await prisma.department.upsert({
          where: { code: row.code },
          update: { name: row.name },
          create: { name: row.name, code: row.code },
        });
        created++;
      } else if (type === "branch") {
        const dept = await prisma.department.findUnique({
          where: { code: row.parentcode || row.parent_code || "" },
        });
        if (!dept) {
          errors.push({ row: i + 1, reason: `Parent department not found: ${row.parentcode}` });
          failed++;
          continue;
        }
        await prisma.branch.upsert({
          where: {
            departmentId_code_semester_section: {
              departmentId: dept.id,
              code: row.code,
              semester: parseInt(row.semester || "1"),
              section: row.section || "",
            },
          },
          update: { name: row.name },
          create: {
            name: row.name,
            code: row.code,
            departmentId: dept.id,
            semester: parseInt(row.semester || "1"),
            section: row.section || null,
          },
        });
        created++;
      }
    } catch (e) {
      failed++;
      errors.push({ row: i + 1, reason: (e as Error).message });
    }
  }

  return { created, matched, failed, errors };
}

async function importRooms(rows: Record<string, string>[]) {
  let created = 0, matched = 0, failed = 0;
  const errors: Array<{ row: number; reason: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const dept = await prisma.department.findUnique({
        where: { code: row.departmentcode || row.department_code || "" },
      });
      if (!dept) {
        errors.push({ row: i + 1, reason: `Department not found: ${row.departmentcode}` });
        failed++;
        continue;
      }

      const roomNumber = row.roomnumber || row.room_number || row.room || "";
      const capacity = parseInt(row.capacity || "0");
      const type = (row.type || "CLASSROOM").toUpperCase() as RoomType;

      const existing = await prisma.room.findUnique({
        where: { departmentId_roomNumber: { departmentId: dept.id, roomNumber } },
      });

      if (existing) {
        await prisma.room.update({
          where: { id: existing.id },
          data: { capacity, type },
        });
        matched++;
      } else {
        await prisma.room.create({
          data: { roomNumber, departmentId: dept.id, capacity, type },
        });
        created++;
      }
    } catch (e) {
      failed++;
      errors.push({ row: i + 1, reason: (e as Error).message });
    }
  }

  // Invalidate analytics cache
  await redis.del("analytics:all");

  return { created, matched, failed, errors };
}

async function importCourses(rows: Record<string, string>[]) {
  let created = 0, matched = 0, failed = 0;
  const errors: Array<{ row: number; reason: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const branchCode = row.branchcode || row.branch_code || "";
      const semester = parseInt(row.semester || "1");

      const branch = await prisma.branch.findFirst({
        where: { code: branchCode, semester },
        include: { department: true },
      });

      if (!branch) {
        errors.push({ row: i + 1, reason: `Branch not found: ${branchCode} Sem ${semester}` });
        failed++;
        continue;
      }

      const code = row.code || "";
      const name = row.name || "";
      const credits = parseInt(row.credits || "0");
      const type = (row.type || "LECTURE").toUpperCase() as CourseType;

      await prisma.course.upsert({
        where: { code_branchId: { code, branchId: branch.id } },
        update: { name, credits, type },
        create: {
          code,
          name,
          credits,
          type,
          departmentId: branch.departmentId,
          branchId: branch.id,
        },
      });
      created++;
    } catch (e) {
      failed++;
      errors.push({ row: i + 1, reason: (e as Error).message });
    }
  }

  return { created, matched, failed, errors };
}

async function importFaculty(rows: Record<string, string>[]) {
  let created = 0, matched = 0, failed = 0;
  const errors: Array<{ row: number; reason: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const email = row.email || "";
      const name = row.name || "";
      const role = (row.role || "PROFESSOR").toUpperCase();
      const deptCode = row.departmentcode || row.department_code || "";

      let departmentId: string | null = null;
      if (deptCode) {
        const dept = await prisma.department.findUnique({
          where: { code: deptCode },
        });
        if (dept) departmentId = dept.id;
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        matched++;
      } else {
        await prisma.user.create({
          data: {
            name,
            email,
            role: role as "ADMIN" | "COORDINATOR" | "PROFESSOR" | "HOD" | "DEAN",
            departmentId,
          },
        });
        created++;
      }
    } catch (e) {
      failed++;
      errors.push({ row: i + 1, reason: (e as Error).message });
    }
  }

  return { created, matched, failed, errors };
}

export async function processBulkImport(job: Job<BulkImportJobData>) {
  const { filePath, importJobId, entityType, fileType } = job.data;

  try {
    // Update status → PARSING
    await prisma.importJob.update({
      where: { id: importJobId },
      data: { status: "PARSING" },
    });
    await job.updateProgress(20);

    // Parse file
    const rows = parseFile(filePath, fileType);
    await job.updateProgress(40);

    // Update status → INTEGRATING
    await prisma.importJob.update({
      where: { id: importJobId },
      data: { status: "INTEGRATING" },
    });

    let result: { created: number; matched: number; failed: number; errors: Array<{ row: number; reason: string }> };

    switch (entityType) {
      case "departments":
        result = await importDepartments(rows);
        break;
      case "rooms":
        result = await importRooms(rows);
        break;
      case "courses":
        result = await importCourses(rows);
        break;
      case "faculty":
        result = await importFaculty(rows);
        break;
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }

    await job.updateProgress(90);

    // Update status → DONE
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: "DONE",
        createdCount: result.created,
        matchedCount: result.matched,
        failedCount: result.failed,
        errors: result.errors.length > 0 ? result.errors : undefined,
      },
    });

    await job.updateProgress(100);
    return result;
  } catch (e) {
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: "FAILED",
        errors: [{ row: 0, reason: `Job failed: ${(e as Error).message}` }],
      },
    });
    throw e;
  }
}
