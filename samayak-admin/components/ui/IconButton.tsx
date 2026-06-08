import { cn } from "@/lib/cn";
import { ButtonHTMLAttributes } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "danger" | "success";
}

export function IconButton({
  className,
  variant = "default",
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      className={cn(
        "p-2 rounded-[10px] border-none bg-transparent cursor-pointer transition-colors",
        variant === "default" && "text-text-secondary hover:text-text-primary hover:bg-surface-3",
        variant === "danger" && "text-danger hover:bg-danger/10",
        variant === "success" && "text-success hover:bg-success/10",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
