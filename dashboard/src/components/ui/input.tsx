"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-lg",
            "bg-[hsl(var(--input))] px-3 py-2",
            "border border-[hsl(var(--border))]",
            "text-sm text-[hsl(var(--foreground))]",
            "placeholder:text-[hsl(var(--foreground-subtle))]",
            "transition-all duration-200",
            // Focus states - hex.tech inspired glow
            "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:ring-offset-1 focus:ring-offset-[hsl(var(--background))]",
            "focus:border-[hsl(var(--ring))]",
            // Disabled state
            "disabled:cursor-not-allowed disabled:opacity-50",
            // Error state
            error && "border-[hsl(var(--destructive))] focus:ring-[hsl(var(--destructive))]",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-xs text-[hsl(var(--destructive))]">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
