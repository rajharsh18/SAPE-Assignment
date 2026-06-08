import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { parsePdfJobMetadata } from "@/lib/pdf-job-metadata";

function jobPayload(job: {
  id: string;
  status: string;
  fileName: string;
  createdCount: number;
  matchedCount: number;
  failedCount: number;
  errors: unknown;
  metadata: unknown;
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
    metadata: metadata
      ? {
          parseMethod: metadata.parseMethod,
          ocrProgress: metadata.ocrProgress,
          pages: metadata.pages?.map((p) => ({
            pageNumber: p.pageNumber,
            charCount: p.charCount,
            preview: p.preview,
            branch: p.branch,
            slotsFound: p.slotsFound,
            coursesFound: p.coursesFound,
            confirmed: p.confirmed,
            rejected: p.rejected,
          })),
        }
      : null,
    updatedAt: job.updatedAt.toISOString(),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let lastFingerprint = "";
      let attempts = 0;
      const maxAttempts = 600;

      const poll = async () => {
        try {
          const job = await prisma.importJob.findUnique({
            where: { id: jobId },
          });

          if (!job) {
            sendEvent({ error: "Job not found" });
            controller.close();
            return;
          }

          const payload = jobPayload(job);
          const fingerprint = JSON.stringify({
            status: payload.status,
            progress: payload.metadata?.ocrProgress,
            confirmed: payload.metadata?.pages?.map((p) => p.confirmed),
            counts: [payload.createdCount, payload.matchedCount, payload.failedCount],
          });

          if (fingerprint !== lastFingerprint) {
            lastFingerprint = fingerprint;
            sendEvent(payload);
          }

          if (job.status === "DONE" || job.status === "FAILED") {
            controller.close();
            return;
          }

          if (job.status === "OCR_REVIEW") {
            attempts++;
            if (attempts >= maxAttempts) {
              sendEvent({ error: "Timeout waiting for page confirmation" });
              controller.close();
              return;
            }
            setTimeout(poll, 1500);
            return;
          }

          attempts++;
          if (attempts >= maxAttempts) {
            sendEvent({ error: "Timeout waiting for job completion" });
            controller.close();
            return;
          }

          setTimeout(poll, 1000);
        } catch {
          sendEvent({ error: "Failed to check job status" });
          controller.close();
        }
      };

      poll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
