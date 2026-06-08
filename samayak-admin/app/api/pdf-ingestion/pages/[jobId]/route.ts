import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { parsePdfJobMetadata } from "@/lib/pdf-job-metadata";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const pageParam = req.nextUrl.searchParams.get("page");
  const full = req.nextUrl.searchParams.get("full") === "1";

  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const metadata = parsePdfJobMetadata(job.metadata);

  if (pageParam && full) {
    const pageNumber = parseInt(pageParam, 10);
    const page = metadata?.pages?.find((p) => p.pageNumber === pageNumber);
    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    return NextResponse.json({
      pageNumber: page.pageNumber,
      ocrText: page.ocrText,
      preview: page.preview,
    });
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    fileName: job.fileName,
    createdCount: job.createdCount,
    matchedCount: job.matchedCount,
    failedCount: job.failedCount,
    errors: job.errors,
    metadata,
    updatedAt: job.updatedAt.toISOString(),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const body = await req.json();
  const { pageNumber, confirmed, rejected, confirmAll } = body as {
    pageNumber?: number;
    confirmed?: boolean;
    rejected?: boolean;
    confirmAll?: boolean;
  };

  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "OCR_REVIEW") {
    return NextResponse.json(
      { error: "Job is not awaiting OCR review" },
      { status: 400 }
    );
  }

  const metadata = parsePdfJobMetadata(job.metadata);
  if (!metadata?.pages?.length) {
    return NextResponse.json({ error: "No OCR pages on this job" }, { status: 400 });
  }

  if (confirmAll) {
    metadata.pages = metadata.pages.map((p) => ({
      ...p,
      confirmed: true,
      rejected: false,
    }));
  } else if (typeof pageNumber === "number") {
    metadata.pages = metadata.pages.map((p) => {
      if (p.pageNumber !== pageNumber) return p;
      return {
        ...p,
        confirmed: rejected ? false : (confirmed ?? p.confirmed),
        rejected: rejected ?? false,
      };
    });
  } else {
    return NextResponse.json({ error: "pageNumber or confirmAll required" }, { status: 400 });
  }

  const updated = await prisma.importJob.update({
    where: { id: jobId },
    data: { metadata: metadata as unknown as Prisma.InputJsonValue },
  });

  const confirmedCount = metadata.pages.filter((p) => p.confirmed && !p.rejected).length;

  return NextResponse.json({
    jobId: updated.id,
    status: updated.status,
    confirmedCount,
    totalPages: metadata.pages.length,
    pages: metadata.pages.map((p) => ({
      pageNumber: p.pageNumber,
      charCount: p.charCount,
      preview: p.preview,
      branch: p.branch,
      slotsFound: p.slotsFound,
      coursesFound: p.coursesFound,
      confirmed: p.confirmed,
      rejected: p.rejected,
    })),
  });
}
