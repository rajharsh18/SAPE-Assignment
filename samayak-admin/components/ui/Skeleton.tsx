import { cn } from "@/lib/cn";

interface SkeletonProps {
  className?: string;
  height?: string;
}

export function Skeleton({ className, height = "20px" }: SkeletonProps) {
  return (
    <div className={cn("skeleton w-full", className)} style={{ height }} />
  );
}

export function TableSkeleton({
  rows = 5,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          <td colSpan={cols} className="p-4">
            <Skeleton />
          </td>
        </tr>
      ))}
    </>
  );
}
