import { cn } from "@/lib/cn";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className="block text-[13px] font-medium text-text-secondary mb-2"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(
          "w-full px-4 py-3 rounded-xl text-sm bg-surface-1 border border-border text-text-primary",
          "placeholder:text-text-muted outline-none transition-colors",
          "focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/20",
          error && "border-danger bg-danger/5",
          className,
        )}
        {...props}
      />
      {error && (
        <p className="mt-1.5 text-xs text-danger font-medium">{error}</p>
      )}
    </div>
  ),
);
Input.displayName = "Input";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, id, children, ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className="block text-[13px] font-medium text-text-secondary mb-2"
        >
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={id}
        className={cn(
          "w-full px-4 py-3 rounded-xl text-sm bg-surface-1 border border-border text-text-primary outline-none",
          "focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/20",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  ),
);
Select.displayName = "Select";

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export function SearchInput({ className, icon, ...props }: SearchInputProps) {
  return (
    <div className="relative max-w-md">
      {icon && (
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
          {icon}
        </span>
      )}
      <input
        className={cn(
          "w-full pl-10 pr-4 py-3 rounded-xl text-sm bg-surface-1 border border-border",
          "focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/20 outline-none",
          className,
        )}
        {...props}
      />
    </div>
  );
}
