import { Worker } from "bullmq";
import { processPdfIngestion } from "./pdf-ingestion.worker";
import { processBulkImport } from "./bulk-import.worker";

const connectionConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || "T9vL2mQ8xZ7pR4nW",
  maxRetriesPerRequest: null,
};

const pdfWorker = new Worker("pdf-ingestion", processPdfIngestion, {
  connection: connectionConfig,
  concurrency: 2,
});

const bulkWorker = new Worker("bulk-import", processBulkImport, {
  connection: connectionConfig,
  concurrency: 3,
});

pdfWorker.on("completed", (job) => {
  console.log(`[pdf-ingestion] Job ${job.id} completed`);
});

pdfWorker.on("failed", (job, err) => {
  console.error(`[pdf-ingestion] Job ${job?.id} failed:`, err.message);
});

bulkWorker.on("completed", (job) => {
  console.log(`[bulk-import] Job ${job.id} completed`);
});

bulkWorker.on("failed", (job, err) => {
  console.error(`[bulk-import] Job ${job?.id} failed:`, err.message);
});

console.log(`[workers] Started on node ${process.env.WS_NODE_ID || "unknown"}`);

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[workers] Shutting down...");
  await pdfWorker.close();
  await bulkWorker.close();
  process.exit(0);
});
