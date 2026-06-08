import { cn } from "@/lib/cn";
import { Search } from "lucide-react";
import { InputHTMLAttributes } from "react";

interface SearchBarProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string;
  wrapperClassName?: string;
}

export function SearchBar({ className, wrapperClassName, ...props }: SearchBarProps) {
  return (
    <div className={cn("relative w-full max-w-sm", wrapperClassName)}>
      <Search
        size={16}
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
      />
      <input
        type="text"
        className={cn(
          "w-full pl-10 pr-4 py-3 rounded-xl text-sm bg-surface-1 border border-border text-text-primary",
          "placeholder:text-text-muted outline-none transition-colors",
          "focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/20",
          className
        )}
        {...props}
      />
    </div>
  );
}
