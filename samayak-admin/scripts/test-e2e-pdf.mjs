import { PrismaClient } from "@prisma/client";
import { processPdfIngestion } from "../dist/workers/pdf-ingestion.worker.js";

const prisma = new PrismaClient();
const filePath =
  process.argv[2] ||
  "/data/samayak-uploads/210cadd3-867c-4d11-baba-075a8e0bab24.pdf";

const job = await prisma.importJob.create({
  data: { type: "PDF", fileName: "CSE-test.pdf", status: "QUEUED" },
});

const mockJob = {
  data: { filePath, importJobId: job.id },
  updateProgress: async () => {},
  name: "ingest-pdf",
};

try {
  const result = await processPdfIngestion(mockJob);
  const updated = await prisma.importJob.findUnique({ where: { id: job.id } });
  console.log(
    JSON.stringify({
      created: result.created,
      matched: result.matched,
      failed: result.failed,
      status: updated?.status,
    }),
  );
} catch (e) {
  const updated = await prisma.importJob.findUnique({ where: { id: job.id } });
  console.error("FAILED:", e.message);
  console.log(
    JSON.stringify({ status: updated?.status, errors: updated?.errors }),
  );
}

await prisma.$disconnect();
