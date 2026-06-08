import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getUploadDir } from "@/lib/upload-dir";
import { getCorrelationId } from "@/lib/correlation";

function logUpload(jobId: string, message: string, extra?: Record<string, unknown>) {
  const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[pdf-ingestion][${jobId}] ${message}${suffix}`);
}

export async function POST(req: NextRequest) {
  const correlationId = getCorrelationId(req.headers);

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are supported" },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    console.log(
      `[pdf-ingestion][upload][${correlationId}] Received "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`
    );

    const tmpDir = getUploadDir();
    await mkdir(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, `${uuidv4()}.pdf`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const importJob = await prisma.importJob.create({
      data: {
        type: "PDF",
        fileName: file.name,
        status: "QUEUED",
      },
    });

    logUpload(importJob.id, "File saved and job queued", {
      fileName: file.name,
      filePath,
      correlationId,
    });

    const { pdfIngestionQueue } = await import("@/lib/queues");
    await pdfIngestionQueue.add("ingest-pdf", {
      filePath,
      importJobId: importJob.id,
    });

    logUpload(importJob.id, "BullMQ job added to ingestion queue");

    return NextResponse.json(
      { jobId: importJob.id, status: "QUEUED" },
      { status: 202 }
    );
  } catch (error) {
    console.error("[pdf-ingestion/upload] Error:", error);
    return NextResponse.json(
      { error: "Failed to process upload" },
      { status: 500 }
    );
  }
}
