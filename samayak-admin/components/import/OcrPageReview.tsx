"use client";

import { useState } from "react";
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  XCircle,
  FileSearch,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

export interface OcrPageSummary {
  pageNumber: number;
  charCount: number;
  preview: string;
  branch: string | null;
  slotsFound: number;
  coursesFound: number;
  confirmed: boolean;
  rejected: boolean;
}

interface OcrPageReviewProps {
  jobId: string;
  pages: OcrPageSummary[];
  onPagesUpdated: (pages: OcrPageSummary[]) => void;
  onIntegrateStart: () => void;
}

export function OcrPageReview({
  jobId,
  pages,
  onPagesUpdated,
  onIntegrateStart,
}: OcrPageReviewProps) {
  const [expandedPage, setExpandedPage] = useState<number | null>(null);
  const [fullText, setFullText] = useState<Record<number, string>>({});
  const [loadingPage, setLoadingPage] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [integrating, setIntegrating] = useState(false);

  const confirmedCount = pages.filter((p) => p.confirmed && !p.rejected).length;

  const loadFullText = async (pageNumber: number) => {
    if (fullText[pageNumber]) return;
    setLoadingPage(pageNumber);
    try {
      const res = await fetch(
        `/api/pdf-ingestion/pages/${jobId}?page=${pageNumber}&full=1`,
      );
      if (!res.ok) throw new Error("Failed to load page text");
      const data = await res.json();
      setFullText((prev) => ({
        ...prev,
        [pageNumber]: data.ocrText || data.preview,
      }));
    } catch {
      toast.error(`Could not load OCR text for page ${pageNumber}`);
    } finally {
      setLoadingPage(null);
    }
  };

  const toggleExpand = async (pageNumber: number) => {
    if (expandedPage === pageNumber) {
      setExpandedPage(null);
      return;
    }
    setExpandedPage(pageNumber);
    await loadFullText(pageNumber);
  };

  const updatePage = async (opts: {
    pageNumber?: number;
    confirmed?: boolean;
    rejected?: boolean;
    confirmAll?: boolean;
  }) => {
    setConfirming(true);
    try {
      const res = await fetch(`/api/pdf-ingestion/pages/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      if (!res.ok) {
        toast.error((await res.json()).error || "Failed to update page");
        return;
      }
      const data = await res.json();
      onPagesUpdated(data.pages);
      if (opts.confirmAll) {
        toast.success(`All ${data.totalPages} pages confirmed`);
      } else if (opts.rejected) {
        toast.info(`Page ${opts.pageNumber} skipped`);
      } else {
        toast.success(`Page ${opts.pageNumber} confirmed`);
      }
    } catch {
      toast.error("Failed to update page confirmation");
    } finally {
      setConfirming(false);
    }
  };

  const handleIntegrate = async () => {
    if (confirmedCount === 0) {
      toast.error("Confirm at least one page before importing");
      return;
    }
    setIntegrating(true);
    try {
      const res = await fetch(`/api/pdf-ingestion/integrate/${jobId}`, {
        method: "POST",
      });
      if (!res.ok) {
        toast.error((await res.json()).error || "Failed to start import");
        setIntegrating(false);
        return;
      }
      toast.success(`Importing ${confirmedCount} confirmed page(s)...`);
      onIntegrateStart();
    } catch {
      toast.error("Failed to start import");
      setIntegrating(false);
    }
  };

  return (
    <Card padding="md" className="animate-fade-in border-brand-primary/20">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-[12px] bg-brand-primary/10 flex items-center justify-center shrink-0">
          <FileSearch size={20} className="text-brand-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-text-primary">
            Review Vision LLM Extraction — Page by Page
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            Each page was read directly by a vision LLM (Groq). Confirm pages
            whose extracted JSON looks correct before importing.
            <span className="ml-1 font-medium text-brand-primary">
              {confirmedCount}/{pages.length} confirmed
            </span>
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            disabled={confirming || pages.every((p) => p.confirmed)}
            onClick={() => updatePage({ confirmAll: true })}
          >
            Confirm All
          </Button>
          <Button
            size="sm"
            disabled={integrating || confirmedCount === 0}
            onClick={handleIntegrate}
          >
            {integrating ? "Starting..." : `Import ${confirmedCount} Page(s)`}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto pr-1">
        {pages.map((page) => (
          <div
            key={page.pageNumber}
            className={cn(
              "rounded-[14px] border transition-colors",
              page.confirmed && !page.rejected
                ? "border-success/40 bg-success/5"
                : page.rejected
                  ? "border-border bg-surface-2 opacity-60"
                  : "border-border bg-surface-1",
            )}
          >
            <div className="flex items-center gap-3 p-3">
              <span className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center text-xs font-bold shrink-0">
                {page.pageNumber}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">
                    Page {page.pageNumber}
                  </span>
                  {page.branch && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary">
                      {page.branch}
                    </span>
                  )}
                  <span className="text-[11px] text-text-muted">
                    {page.charCount} chars • {page.slotsFound} slots •{" "}
                    {page.coursesFound} courses
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-1 line-clamp-2 font-mono">
                  {page.preview}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {page.confirmed && !page.rejected ? (
                  <CheckCircle size={18} className="text-success" />
                ) : page.rejected ? (
                  <XCircle size={18} className="text-text-muted" />
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleExpand(page.pageNumber)}
                >
                  {expandedPage === page.pageNumber ? (
                    <ChevronUp size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </Button>
                {!page.rejected && (
                  <Button
                    variant={page.confirmed ? "secondary" : "primary"}
                    size="sm"
                    disabled={confirming}
                    onClick={() =>
                      updatePage({
                        pageNumber: page.pageNumber,
                        confirmed: !page.confirmed,
                      })
                    }
                  >
                    {page.confirmed ? "Undo" : "Confirm"}
                  </Button>
                )}
                {!page.confirmed && !page.rejected && (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={confirming}
                    onClick={() =>
                      updatePage({
                        pageNumber: page.pageNumber,
                        rejected: true,
                      })
                    }
                  >
                    Skip
                  </Button>
                )}
              </div>
            </div>

            {expandedPage === page.pageNumber && (
              <div className="px-3 pb-3">
                <pre className="text-[11px] leading-relaxed p-3 rounded-[10px] bg-surface-2 text-text-secondary overflow-x-auto max-h-[240px] overflow-y-auto whitespace-pre-wrap font-mono">
                  {loadingPage === page.pageNumber
                    ? "Loading OCR text..."
                    : fullText[page.pageNumber] || page.preview}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
