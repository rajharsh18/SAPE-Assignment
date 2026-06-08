"use client";

import { useState, useCallback, useEffect } from "react";
import {
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  Clock,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/tables/DataTable";
import { Card } from "@/components/ui/Card";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { ImportReport } from "@/components/import/BulkImport";
import { notifyAnalyticsRefresh } from "@/lib/analytics-events";
import { cn } from "@/lib/cn";

type JobStatus =
  | "QUEUED"
  | "PARSING"
  | "OCR_REVIEW"
  | "INTEGRATING"
  | "DONE"
  | "FAILED";

interface OcrPageSummary {
  pageNumber: number;
  charCount: number;
  preview: string;
  branch: string | null;
  slotsFound: number;
  coursesFound: number;
}

interface JobMetadata {
  parseMethod?: "text" | "ocr" | "llm" | "ocr+llm";
  ocrProgress?: { current: number; total: number };
  pages?: OcrPageSummary[];
  autoImported?: boolean;
}

interface JobData {
  jobId: string;
  status: JobStatus;
  fileName: string;
  createdCount: number;
  matchedCount: number;
  failedCount: number;
  errors: Array<{ row: number; reason: string }> | null;
  metadata?: JobMetadata | null;
}

interface QueueJob {
  jobId: string;
  status: JobStatus;
  fileName: string;
  createdCount: number;
  matchedCount: number;
  failedCount: number;
  errors: unknown;
  createdAt: string;
  updatedAt: string;
  ocrProgress: { current: number; total: number } | null;
  parseMethod: string | null;
}

interface QueueSummary {
  total: number;
  queued: number;
  parsing: number;
  processing: number;
  integrating: number;
}

interface QueueResponse {
  summary: QueueSummary;
  bullMq: { waiting: number; active: number; delayed: number };
  active: QueueJob[];
  recent: QueueJob[];
}

interface ProcessLogEntry {
  time: string;
  message: string;
}

function formatLogTime(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getJobProgress(data: JobData): number {
  switch (data.status) {
    case "QUEUED":
      return 10;
    case "PARSING": {
      const ocr = data.metadata?.ocrProgress;
      if (ocr && ocr.total > 0) {
        return Math.round(20 + (ocr.current / ocr.total) * 30);
      }
      return 15;
    }
    case "OCR_REVIEW":
      return 55;
    case "INTEGRATING":
      return 75;
    case "DONE":
    case "FAILED":
      return 100;
    default:
      return 0;
  }
}

function getJobStatusLabel(data: JobData): string {
  if (data.status === "PARSING") {
    return data.metadata?.ocrProgress ? "Scanning Pages" : "Reading PDF";
  }
  return statusConfig[data.status].label;
}

function buildJobLogMessage(
  data: JobData,
  prev: JobData | null,
): string | null {
  if (!prev || prev.status !== data.status) {
    switch (data.status) {
      case "QUEUED":
        return `Job queued — waiting for worker (${data.fileName})`;
      case "PARSING":
        if (data.metadata?.ocrProgress) {
          const ocr = data.metadata.ocrProgress;
          return `Scanning pages (${ocr.current} of ${ocr.total})`;
        }
        return "Reading PDF — checking for extractable text";
      case "OCR_REVIEW":
        return "Processing extracted timetable data";
      case "INTEGRATING":
        return "Inserting departments, rooms, courses, slots, and faculty into database";
      case "DONE":
        return `Complete — created ${data.createdCount}, matched ${data.matchedCount}, failed ${data.failedCount}`;
      case "FAILED":
        return `Failed — ${data.errors?.[0]?.reason || "unknown error"}`;
      default:
        return null;
    }
  }

  const prevOcr = prev.metadata?.ocrProgress;
  const nextOcr = data.metadata?.ocrProgress;
  if (
    data.status === "PARSING" &&
    nextOcr &&
    (!prevOcr || prevOcr.current !== nextOcr.current)
  ) {
    if (!prevOcr) {
      return `No text layer found — scanning pages (${nextOcr.current} of ${nextOcr.total})`;
    }
    return `Scanning page ${nextOcr.current} of ${nextOcr.total}`;
  }

  if (
    data.status === "INTEGRATING" &&
    (prev.createdCount !== data.createdCount ||
      prev.matchedCount !== data.matchedCount ||
      prev.failedCount !== data.failedCount)
  ) {
    return `Integration progress — created ${data.createdCount}, matched ${data.matchedCount}`;
  }

  return null;
}

const statusConfig: Record<JobStatus, { label: string; progress: number }> = {
  QUEUED: { label: "Queued", progress: 10 },
  PARSING: { label: "Parsing", progress: 50 },
  OCR_REVIEW: { label: "Processing", progress: 55 },
  INTEGRATING: { label: "Inserting Data", progress: 75 },
  DONE: { label: "Complete", progress: 100 },
  FAILED: { label: "Failed", progress: 100 },
};

const statusChipClass: Record<JobStatus, string> = {
  QUEUED: "bg-text-secondary/10 text-text-secondary",
  PARSING: "bg-info/10 text-info",
  OCR_REVIEW: "bg-info/10 text-info",
  INTEGRATING: "bg-brand-primary-light/15 text-brand-primary-light",
  DONE: "bg-success/10 text-success",
  FAILED: "bg-danger/10 text-danger",
};

const statusDotClass: Record<JobStatus, string> = {
  QUEUED: "bg-text-secondary",
  PARSING: "bg-info",
  OCR_REVIEW: "bg-info",
  INTEGRATING: "bg-brand-primary-light",
  DONE: "bg-success",
  FAILED: "bg-danger",
};

const statusIconClass: Record<JobStatus, string> = {
  QUEUED: "text-text-secondary",
  PARSING: "text-info",
  OCR_REVIEW: "text-info",
  INTEGRATING: "text-brand-primary-light",
  DONE: "text-success",
  FAILED: "text-danger",
};

export default function PdfIngestionPage() {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [showOcrLog, setShowOcrLog] = useState(false);
  const [processLog, setProcessLog] = useState<ProcessLogEntry[]>([]);
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);

  const appendLog = useCallback((message: string) => {
    setProcessLog((prev) => [...prev, { time: formatLogTime(), message }]);
  }, []);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/pdf-ingestion/queue");
      if (res.ok) setQueue(await res.json());
    } catch {
      /* ignore */
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 3000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const subscribeToJob = useCallback(
    (jobId: string) => {
      appendLog(`Subscribed to live status stream (job ${jobId.slice(0, 8)}…)`);
      const eventSource = new EventSource(`/api/pdf-ingestion/status/${jobId}`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as JobData;
          setJobData((prev) => {
            const logMessage = buildJobLogMessage(data, prev);
            if (logMessage) appendLog(logMessage);
            return data;
          });

          if (data.status === "DONE" || data.status === "FAILED") {
            eventSource.close();
            fetchQueue();

            if (data.status === "DONE") {
              toast.success(
                `Imported ${data.createdCount} records — dashboard updating`,
              );
              notifyAnalyticsRefresh();
            } else {
              toast.error(data.errors?.[0]?.reason || "PDF ingestion failed");
            }
          }
        } catch {
          /* ignore */
        }
      };
      eventSource.onerror = () => {
        appendLog("Status stream closed");
        eventSource.close();
      };
    },
    [fetchQueue, appendLog],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        toast.error("Only PDF files are accepted");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File must be under 10MB");
        return;
      }

      setUploading(true);
      setJobData(null);
      setShowOcrLog(false);
      setProcessLog([]);
      appendLog(
        `Upload started — ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
      );

      const formData = new FormData();
      formData.append("file", file);

      try {
        appendLog("Sending file to server…");
        const res = await fetch("/api/pdf-ingestion/upload", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const err = (await res.json()).error || "Upload failed";
          appendLog(`Upload failed — ${err}`);
          toast.error(err);
          setUploading(false);
          return;
        }

        const { jobId } = await res.json();
        appendLog(`Upload accepted — job ${jobId.slice(0, 8)}… queued`);
        toast.success("PDF uploaded — added to processing queue");
        setUploading(false);
        fetchQueue();
        subscribeToJob(jobId);
      } catch {
        appendLog("Upload failed — network error");
        toast.error("Failed to upload file");
        setUploading(false);
      }
    },
    [subscribeToJob, fetchQueue, appendLog],
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const handleFileSelect = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) uploadFile(file);
    };
    input.click();
  };

  const ocrProgress = jobData?.metadata?.ocrProgress;
  const jobProgress = jobData ? getJobProgress(jobData) : 0;
  const ocrPages = jobData?.metadata?.pages ?? [];
  const isActive = jobData && !["DONE", "FAILED"].includes(jobData.status);
  const summary = queue?.summary;
  const recentJobs = queue?.recent ?? [];

  return (
    <div className="page-section">
      <PageHeader
        title="PDF Ingestion"
        description="Scanned PDFs are OCR'd with Tesseract, parsed, and inserted automatically"
      />

      {/* Processing queue */}
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-primary/10 flex items-center justify-center">
              <Layers size={18} className="text-brand-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Processing Queue
              </h3>
              <p className="text-xs text-text-muted">
                {queueLoading
                  ? "Loading..."
                  : summary && summary.total > 0
                    ? `${summary.total} PDF${summary.total === 1 ? "" : "s"} in queue`
                    : "No PDFs currently processing"}
              </p>
            </div>
          </div>
          {queue?.bullMq &&
            (queue.bullMq.waiting > 0 || queue.bullMq.active > 0) && (
              <p className="text-[11px] text-text-muted">
                Worker: {queue.bullMq.active} active · {queue.bullMq.waiting}{" "}
                waiting
              </p>
            )}
        </div>

        {summary && summary.total > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {summary.queued > 0 && (
              <QueueStatChip
                label="Queued"
                count={summary.queued}
                status="QUEUED"
              />
            )}
            {summary.parsing > 0 && (
              <QueueStatChip
                label="Parsing"
                count={summary.parsing}
                status="PARSING"
              />
            )}
            {summary.processing > 0 && (
              <QueueStatChip
                label="Processing"
                count={summary.processing}
                status="OCR_REVIEW"
              />
            )}
            {summary.integrating > 0 && (
              <QueueStatChip
                label="Inserting"
                count={summary.integrating}
                status="INTEGRATING"
              />
            )}
          </div>
        )}

        {queueLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="skeleton h-14 rounded-xl" />
            ))}
          </div>
        ) : queue && queue.active.length > 0 ? (
          <ScrollArea
            maxHeight="min(280px, 35vh)"
            fade={queue.active.length > 3}
          >
            <div className="flex flex-col gap-2 p-1">
              {queue.active.map((job, index) => (
                <QueueJobRow
                  key={job.jobId}
                  job={job}
                  position={index + 1}
                  highlighted={job.jobId === jobData?.jobId}
                />
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex items-center gap-3 py-6 px-4 rounded-xl bg-surface-2 border border-border/60">
            <Clock size={18} className="text-text-muted shrink-0" />
            <p className="text-sm text-text-muted">
              Upload a timetable PDF to add it to the queue. Multiple files can
              be processed in order.
            </p>
          </div>
        )}
      </Card>

      {/* Upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={handleFileSelect}
        className={cn(
          "border-2 border-dashed rounded-[20px] p-12 text-center cursor-pointer transition-all bg-surface-1 shadow-sm border-border/60",
          dragOver
            ? "border-brand-secondary bg-brand-secondary/5"
            : "hover:border-brand-primary/30",
          uploading && "opacity-60 cursor-not-allowed",
        )}
      >
        <div className="w-16 h-16 rounded-xl bg-brand-primary/10 flex items-center justify-center mx-auto mb-4">
          {uploading ? (
            <Loader2 size={28} className="text-brand-primary animate-spin" />
          ) : (
            <FileText size={28} className="text-brand-primary" />
          )}
        </div>
        <p className="text-base font-semibold text-text-primary">
          {uploading ? "Uploading..." : "Drop your timetable PDF here"}
        </p>
        <p className="text-sm text-text-secondary mt-1.5">
          Image PDFs → Tesseract OCR → auto-insert • Text PDFs import directly •
          Max 10MB
        </p>
      </div>

      {/* Active job detail (tracked via SSE) */}
      {jobData && (
        <Card padding="md" className="animate-fade-in">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
            Current Upload
          </p>
          <div className="flex items-center gap-3 mb-5">
            <div className={cn("shrink-0", statusIconClass[jobData.status])}>
              {isActive ? (
                <Loader2 size={18} className="animate-spin" />
              ) : jobData.status === "DONE" ? (
                <CheckCircle size={18} />
              ) : (
                <AlertCircle size={18} />
              )}
            </div>
            <div className="flex-1">
              <p className="font-semibold">{getJobStatusLabel(jobData)}</p>
              <p className="text-xs text-text-secondary">{jobData.fileName}</p>
              {jobData.status === "PARSING" && !ocrProgress && (
                <p className="text-xs text-text-muted mt-0.5">
                  Checking for extractable text…
                </p>
              )}
              {jobData.status === "PARSING" && ocrProgress && (
                <p className="text-xs text-brand-primary mt-0.5">
                  Page {ocrProgress.current} of {ocrProgress.total}
                </p>
              )}
              {jobData.metadata?.parseMethod && jobData.status === "DONE" && (
                <p className="text-xs text-text-muted mt-0.5">
                  Method: {jobData.metadata.parseMethod}
                </p>
              )}
            </div>
          </div>

          <div className="h-2 rounded-full bg-surface-3 overflow-hidden mb-5">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                jobData.status === "FAILED" ? "bg-danger" : "brand-gradient",
              )}
              style={{ width: `${jobProgress}%` }}
            />
          </div>

          <div className="flex justify-between mb-4">
            {(["QUEUED", "PARSING", "INTEGRATING", "DONE"] as JobStatus[]).map(
              (step, idx) => {
                const sc = statusConfig[step];
                const isStepActive =
                  step === jobData.status ||
                  (step === "PARSING" && jobData.status === "OCR_REVIEW");
                const isPast = jobProgress > sc.progress;
                return (
                  <div
                    key={step}
                    className="flex flex-col items-center gap-1.5 flex-1"
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold",
                        isPast || isStepActive
                          ? "bg-brand-primary/15 text-brand-primary"
                          : "bg-surface-3 text-text-muted",
                      )}
                    >
                      {isPast ? <CheckCircle size={16} /> : idx + 1}
                    </div>
                    <span
                      className={cn(
                        "text-[11px] text-center",
                        isStepActive
                          ? "text-brand-primary font-semibold"
                          : "text-text-muted",
                      )}
                    >
                      {sc.label}
                    </span>
                  </div>
                );
              },
            )}
          </div>

          {ocrPages.length > 0 && (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setShowOcrLog((v) => !v)}
                className="text-xs text-brand-primary font-medium hover:underline cursor-pointer bg-transparent border-none"
              >
                {showOcrLog ? "Hide" : "Show"} OCR log ({ocrPages.length} pages)
              </button>
              {showOcrLog && (
                <ScrollArea
                  maxHeight={192}
                  fade={ocrPages.length > 4}
                  className="mt-2"
                >
                  <div className="flex flex-col gap-1.5 p-1">
                    {ocrPages.map((p) => (
                      <div
                        key={p.pageNumber}
                        className="text-[11px] p-2 rounded-lg bg-surface-2 font-mono"
                      >
                        <span className="font-semibold text-text-primary">
                          Page {p.pageNumber}
                        </span>
                        {p.branch && (
                          <span className="text-brand-primary ml-2">
                            {p.branch}
                          </span>
                        )}
                        <span className="text-text-muted ml-2">
                          {p.slotsFound} slots • {p.coursesFound} courses
                        </span>
                        <p className="text-text-secondary mt-1 line-clamp-2">
                          {p.preview}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}

          {processLog.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                Process log
              </p>
              <ScrollArea maxHeight={160} fade={processLog.length > 5}>
                <div className="flex flex-col gap-1 p-1 rounded-xl bg-surface-2 border border-border/50 font-mono text-[11px]">
                  {processLog.map((entry, i) => (
                    <div
                      key={`${entry.time}-${i}`}
                      className="flex gap-2 px-2 py-1"
                    >
                      <span className="text-text-muted shrink-0">
                        {entry.time}
                      </span>
                      <span className="text-text-secondary">
                        {entry.message}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {(jobData.status === "DONE" || jobData.status === "FAILED") && (
            <ImportReport
              created={jobData.createdCount}
              matched={jobData.matchedCount}
              failed={jobData.failedCount}
              errors={jobData.errors || undefined}
            />
          )}
        </Card>
      )}

      {recentJobs.length > 0 && (
        <Card padding="md">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-semibold text-text-primary">
              Recent Imports
            </h3>
            <span className="text-xs text-text-muted">
              {recentJobs.length} shown · scroll for more
            </span>
          </div>
          <ScrollArea maxHeight="min(320px, 40vh)" fade={recentJobs.length > 4}>
            <div className="flex flex-col gap-2 p-1">
              {recentJobs.map((job) => (
                <div
                  key={job.jobId}
                  className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-border/40"
                >
                  <div className={statusIconClass[job.status]}>
                    {job.status === "DONE" ? (
                      <CheckCircle size={16} />
                    ) : (
                      <AlertCircle size={16} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {job.fileName}
                    </p>
                    <p className="text-[11px] text-text-muted">
                      Created: {job.createdCount} • Matched: {job.matchedCount}{" "}
                      • Failed: {job.failedCount}
                      <span className="mx-1.5">·</span>
                      {new Date(job.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge status={job.status} />
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}

function QueueStatChip({
  label,
  count,
  status,
}: {
  label: string;
  count: number;
  status: JobStatus;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
        statusChipClass[status],
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", statusDotClass[status])}
      />
      {count} {label}
    </span>
  );
}

function QueueJobRow({
  job,
  position,
  highlighted,
}: {
  job: QueueJob;
  position: number;
  highlighted?: boolean;
}) {
  const sc = statusConfig[job.status];
  const isRunning = !["QUEUED", "DONE", "FAILED"].includes(job.status);

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl border transition-colors",
        highlighted
          ? "bg-brand-primary/6 border-brand-primary/25"
          : "bg-surface-2 border-border/40",
      )}
    >
      <div className="w-7 h-7 rounded-lg bg-surface-1 border border-border flex items-center justify-center text-xs font-bold text-text-muted shrink-0">
        {position}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-text-primary">
          {job.fileName}
        </p>
        <p className="text-[11px] text-text-muted">
          Added {new Date(job.createdAt).toLocaleTimeString()}
          {job.status === "PARSING" && job.ocrProgress && (
            <span className="text-brand-primary ml-1.5">
              · Page {job.ocrProgress.current}/{job.ocrProgress.total}
            </span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isRunning && (
          <Loader2 size={14} className="animate-spin text-brand-primary" />
        )}
        <StatusBadge status={job.status} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        statusChipClass[status],
      )}
    >
      {statusConfig[status].label}
    </span>
  );
}
