import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { pdfIngestionQueue } from "@/lib/queues";

export async function GET() {
  const checks: Record<string, string> = {
    database: "ok",
    redis: "ok",
    queue: "ok",
    timestamp: new Date().toISOString(),
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    checks.database = "error";
  }

  try {
    await redis.ping();
  } catch {
    checks.redis = "error";
  }

  try {
    await pdfIngestionQueue.getJobCounts();
  } catch {
    checks.queue = "error";
  }

  const healthy =
    checks.database === "ok" &&
    checks.redis === "ok" &&
    checks.queue === "ok";

  return NextResponse.json(checks, { status: healthy ? 200 : 503 });
}
