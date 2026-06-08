import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parsePdfJobMetadata } from "@/lib/pdf-job-metadata";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "OCR_REVIEW") {
    return NextResponse.json(
      { error: "Job is not ready for integration" },
      { status: 400 }
    );
  }

  const metadata = parsePdfJobMetadata(job.metadata);
  const confirmedCount =
    metadata?.pages?.filter((p) => p.confirmed && !p.rejected).length ?? 0;

  if (confirmedCount === 0) {
    return NextResponse.json(
      { error: "Confirm at least one page before importing" },
      { status: 400 }
    );
  }

  const { pdfIngestionQueue } = await import("@/lib/queues");
  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: "INTEGRATING" },
  });

  await pdfIngestionQueue.add(
    "integrate-pdf",
    { importJobId: jobId },
    { jobId: `integrate-${jobId}` }
  );

  return NextResponse.json(
    { jobId, status: "INTEGRATING", confirmedPages: confirmedCount },
    { status: 202 }
  );
}
