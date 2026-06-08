import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parsePdfJobMetadata } from "@/lib/pdf-job-metadata";
import { ImportStatus } from "@prisma/client";

const ACTIVE_STATUSES: ImportStatus[] = [
  "QUEUED",
  "PARSING",
  "OCR_REVIEW",
  "INTEGRATING",
];

function serializeJob(job: {
  id: string;
  status: ImportStatus;
  fileName: string;
  createdCount: number;
  matchedCount: number;
  failedCount: number;
  errors: unknown;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  const metadata = parsePdfJobMetadata(job.metadata);
  return {
    jobId: job.id,
    status: job.status,
    fileName: job.fileName,
    createdCount: job.createdCount,
    matchedCount: job.matchedCount,
    failedCount: job.failedCount,
    errors: job.errors,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    ocrProgress: metadata?.ocrProgress ?? null,
    parseMethod: metadata?.parseMethod ?? null,
  };
}

export async function GET() {
  try {
    const [activeJobs, recentJobs] = await Promise.all([
      prisma.importJob.findMany({
        where: { type: "PDF", status: { in: ACTIVE_STATUSES } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.importJob.findMany({
        where: { type: "PDF", status: { in: ["DONE", "FAILED"] } },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
    ]);

    const summary = {
      total: activeJobs.length,
      queued: activeJobs.filter((j) => j.status === "QUEUED").length,
      parsing: activeJobs.filter((j) => j.status === "PARSING").length,
      processing: activeJobs.filter((j) => j.status === "OCR_REVIEW").length,
      integrating: activeJobs.filter((j) => j.status === "INTEGRATING").length,
    };

    let bullMq = { waiting: 0, active: 0, delayed: 0 };
    try {
      const { pdfIngestionQueue } = await import("@/lib/queues");
      const counts = await pdfIngestionQueue.getJobCounts(
        "waiting",
        "active",
        "delayed"
      );
      bullMq = {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
      };
    } catch {
      /* Redis unavailable — DB counts still work */
    }

    return NextResponse.json({
      summary,
      bullMq,
      active: activeJobs.map(serializeJob),
      recent: recentJobs.map(serializeJob),
    });
  } catch (error) {
    console.error("[pdf-ingestion/queue] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch processing queue" },
      { status: 500 }
    );
  }
}
