import { cn } from "@/lib/cn";

type BadgeVariant =
  | "admin"
  | "hod"
  | "dean"
  | "coordinator"
  | "professor"
  | "classroom"
  | "lab"
  | "other"
  | "lecture"
  | "tutorial"
  | "warning"
  | "brand";

const variantClass: Record<BadgeVariant, string> = {
  admin: "badge-admin",
  hod: "badge-hod",
  dean: "badge-dean",
  coordinator: "badge-coordinator",
  professor: "badge-professor",
  classroom: "badge-classroom",
  lab: "badge-lab",
  other: "badge-other",
  lecture: "badge-lecture",
  tutorial: "badge-tutorial",
  warning: "badge-warning",
  brand: "bg-brand-primary/10 text-brand-primary",
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "brand", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold",
        variantClass[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function roleBadgeVariant(role: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    ADMIN: "admin",
    HOD: "hod",
    DEAN: "dean",
    COORDINATOR: "coordinator",
    PROFESSOR: "professor",
  };
  return map[role] ?? "professor";
}

export function roomBadgeVariant(type: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    CLASSROOM: "classroom",
    LAB: "lab",
    OTHER: "other",
  };
  return map[type] ?? "other";
}
