import { Queue } from "bullmq";

const connectionConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || "T9vL2mQ8xZ7pR4nW",
  maxRetriesPerRequest: null,
};

export const pdfIngestionQueue = new Queue("pdf-ingestion", {
  connection: connectionConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  },
});

export const bulkImportQueue = new Queue("bulk-import", {
  connection: connectionConfig,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 1000 },
  },
});
