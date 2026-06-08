"use client";

import { cn } from "@/lib/cn";
import { Upload } from "lucide-react";
import { useState } from "react";

interface BulkImportProps {
  accept?: string;
  hint: string;
  onUpload: (file: File) => void | Promise<void>;
  disabled?: boolean;
}

export function BulkImport({
  accept = ".csv,.xlsx,.xls",
  hint,
  onUpload,
  disabled,
}: BulkImportProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
    }
  };

  const openPicker = () => {
    if (disabled || uploading) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) void handleFile(file);
    };
    input.click();
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!disabled && e.dataTransfer.files[0])
          void handleFile(e.dataTransfer.files[0]);
      }}
      onClick={openPicker}
      className={cn(
        "border-2 border-dashed rounded-[22px] p-8 text-center transition-all cursor-pointer",
        dragOver
          ? "border-brand-secondary bg-brand-secondary/5"
          : "border-border bg-surface-2/50 hover:border-brand-primary/40",
        (disabled || uploading) && "opacity-60 cursor-not-allowed",
      )}
    >
      <Upload size={32} className="mx-auto mb-3 text-text-muted" />
      <p className="text-sm font-medium text-text-primary">
        {uploading ? "Uploading..." : "Drop file here or click to upload"}
      </p>
      <p className="text-xs text-text-muted mt-2">{hint}</p>
    </div>
  );
}

interface ImportReportProps {
  created: number;
  matched: number;
  failed: number;
  errors?: Array<{ row: number; reason: string }>;
}

export function ImportReport({
  created,
  matched,
  failed,
  errors,
}: ImportReportProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-[14px] bg-success/8 text-center">
          <p className="text-2xl font-bold text-success">{created}</p>
          <p className="text-xs text-success mt-1 font-medium">Created</p>
        </div>
        <div className="p-4 rounded-[14px] bg-info/8 text-center">
          <p className="text-2xl font-bold text-info">{matched}</p>
          <p className="text-xs text-info mt-1 font-medium">Matched</p>
        </div>
        <div className="p-4 rounded-[14px] bg-warning/8 text-center">
          <p className="text-2xl font-bold text-warning">{failed}</p>
          <p className="text-xs text-warning mt-1 font-medium">Failed</p>
        </div>
      </div>
      {errors && errors.length > 0 && (
        <div className="p-4 rounded-[14px] bg-danger/5 border border-danger/10 max-h-48 overflow-auto">
          <p className="text-sm font-semibold text-danger mb-2">Parse Errors</p>
          {errors.map((err, i) => (
            <p
              key={i}
              className="text-xs text-text-secondary py-1 border-b border-surface-3 last:border-0"
            >
              <span className="font-medium">Row {err.row}:</span> {err.reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
