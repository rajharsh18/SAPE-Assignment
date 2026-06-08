import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getUploadDir } from "@/lib/upload-dir";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileName = file.name;
    const ext = path.extname(fileName).toLowerCase();

    if (![".csv", ".xlsx", ".xls"].includes(ext)) {
      return NextResponse.json(
        { error: "Only CSV and Excel files are supported" },
        { status: 400 }
      );
    }

    const tmpDir = getUploadDir();
    await mkdir(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, `${uuidv4()}${ext}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const importJob = await prisma.importJob.create({
      data: { type: ext === ".csv" ? "CSV" : "EXCEL", fileName, status: "QUEUED" },
    });

    const { bulkImportQueue } = await import("@/lib/queues");
    await bulkImportQueue.add("import-rooms", {
      filePath,
      importJobId: importJob.id,
      entityType: "rooms",
      fileType: ext === ".csv" ? "CSV" : "EXCEL",
    });

    return NextResponse.json({ jobId: importJob.id }, { status: 202 });
  } catch (error) {
    console.error("[rooms/import] Error:", error);
    return NextResponse.json({ error: "Failed to process import" }, { status: 500 });
  }
}
