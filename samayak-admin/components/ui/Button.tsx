import { cn } from "@/lib/cn";
import { ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "utility" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
}

const variants: Record<ButtonVariant, string> = {
  primary: "brand-gradient text-white border-none hover:opacity-95",
  secondary:
    "bg-surface-1 text-text-primary border border-border hover:bg-surface-2",
  utility: "bg-text-primary text-white border-none hover:opacity-90",
  ghost:
    "bg-transparent text-brand-primary border border-border hover:bg-surface-3",
  danger: "bg-danger/10 text-danger border border-danger/20 hover:bg-danger/15",
};

const sizes = {
  sm: "px-4 py-2 text-[13px] gap-2 rounded-[10px]",
  md: "px-4 py-2.5 text-sm gap-2 rounded-xl",
  lg: "px-5 py-3 text-sm gap-2 rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      disabled,
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center font-semibold transition-all duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
Button.displayName = "Button";
