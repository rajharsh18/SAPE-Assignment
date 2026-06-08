import { cn } from "@/lib/cn";
import { HTMLAttributes } from "react";

interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  maxHeight?: number | string;
  fade?: boolean;
}

export function ScrollArea({
  children,
  className,
  maxHeight = 400,
  fade = true,
  style,
  ...props
}: ScrollAreaProps) {
  const heightStyle = {
    maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight,
    ...style,
  };

  return (
    <div className={cn("relative", fade && "scroll-fade-bottom")}>
      <div
        className={cn("overflow-auto overscroll-contain", className)}
        style={heightStyle}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}
