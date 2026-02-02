"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <textarea
          className={cn(
            "flex min-h-[80px] w-full rounded-md",
            "bg-[hsl(var(--input))] px-3 py-2",
            "border border-[hsl(var(--border))]",
            "text-sm text-[hsl(var(--foreground))]",
            "placeholder:text-[hsl(var(--foreground-subtle))]",
            "transition-colors duration-200",
            "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:ring-offset-1 focus:ring-offset-[hsl(var(--background))]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "resize-y",
            error && "border-[hsl(var(--destructive))] focus:ring-[hsl(var(--destructive))]",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-[hsl(var(--destructive))]">{error}</p>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
