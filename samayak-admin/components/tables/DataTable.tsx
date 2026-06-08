import { cn } from "@/lib/cn";
import { ScrollArea } from "@/components/ui/ScrollArea";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
        {description && (
          <p className="text-[13px] text-text-secondary mt-1">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

interface ScopeBannerProps {
  label: string;
}

export function ScopeBanner({ label }: ScopeBannerProps) {
  return (
    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary/8 border border-brand-primary/15 text-sm font-medium text-brand-primary">
      <span className="text-text-secondary font-normal">Showing:</span>
      {label}
    </div>
  );
}

interface EmptyStateProps {
  message: string;
  icon?: React.ReactNode;
}

export function EmptyState({ message, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-text-muted">
      {icon && <div className="mb-3 opacity-50">{icon}</div>}
      <p className="text-sm">{message}</p>
    </div>
  );
}

interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "center" | "right";
  render: (row: T, index: number) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  keyExtractor: (row: T) => string;
  emptyMessage?: string;
  maxHeight?: number | string | false;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  keyExtractor,
  emptyMessage = "No records found",
  maxHeight = "min(520px, 60vh)",
}: DataTableProps<T>) {
  const table = (
    <table className="w-full border-collapse text-[13px]">
      <thead className={cn(maxHeight !== false && "sticky-table-head")}>
        <tr className="border-b border-border">
          {columns.map((col) => (
            <th
              key={col.key}
              className={cn(
                "px-4 py-3 text-xs font-medium text-text-secondary uppercase tracking-wide whitespace-nowrap",
                col.align === "center" && "text-center",
                col.align === "right" && "text-right",
                (!col.align || col.align === "left") && "text-left"
              )}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td colSpan={columns.length} className="p-4">
                <div className="skeleton h-5 rounded-lg" />
              </td>
            </tr>
          ))
        ) : data.length === 0 ? (
          <tr>
            <td colSpan={columns.length}>
              <EmptyState message={emptyMessage} />
            </td>
          </tr>
        ) : (
          data.map((row, idx) => (
            <tr
              key={keyExtractor(row)}
              className="border-b border-surface-3 last:border-b-0 hover:bg-surface-2/50 transition-colors"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-4 py-3",
                    col.align === "center" && "text-center",
                    col.align === "right" && "text-right"
                  )}
                >
                  {col.render(row, idx)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  return (
    <div className="bg-surface-1 rounded-2xl border border-border overflow-hidden">
      {maxHeight !== false ? (
        <ScrollArea maxHeight={maxHeight} className="border-0 rounded-none" fade>
          <div className="overflow-x-auto">{table}</div>
        </ScrollArea>
      ) : (
        <div className="overflow-x-auto">{table}</div>
      )}
    </div>
  );
}

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex justify-center gap-2 py-4">
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={cn(
            "min-w-[32px] h-8 px-2 rounded-[10px] text-xs font-semibold border cursor-pointer transition-colors",
            page === p
              ? "brand-gradient text-white border-transparent"
              : "bg-surface-1 text-text-primary border-border hover:bg-surface-2"
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
