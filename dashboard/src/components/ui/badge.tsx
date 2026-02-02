"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { ReleaseStatus } from "@/lib/types";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "draft"
    | "published"
    | "archived"
    | "gradient";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const baseStyles = [
    "inline-flex items-center rounded-full px-2.5 py-0.5",
    "text-xs font-medium",
    "transition-colors duration-200",
    "border",
  ].join(" ");

  const variantStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
    default:
      "border-transparent bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]",
    secondary:
      "border-transparent bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]",
    destructive:
      "border-transparent bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]",
    outline: "border-[hsl(var(--border))] text-[hsl(var(--foreground))]",
    // Status badges with hex.tech-inspired dark theme colors
    draft: "border-amber-500/30 bg-amber-500/15 text-amber-300",
    published: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
    archived: "border-[hsl(var(--foreground-subtle))]/30 bg-[hsl(var(--muted))] text-[hsl(var(--foreground-muted))]",
    // Hex.tech gradient badge
    gradient:
      "border-transparent bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--accent))] text-white",
  };

  return (
    <span
      className={cn(baseStyles, variantStyles[variant], className)}
      {...props}
    />
  );
}

/**
 * Status badge component that automatically selects the correct variant
 * based on the release status.
 */
interface StatusBadgeProps extends Omit<BadgeProps, "variant"> {
  status: ReleaseStatus;
}

function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const statusLabels: Record<ReleaseStatus, string> = {
    draft: "Draft",
    published: "Published",
    archived: "Archived",
  };

  return (
    <Badge variant={status} className={className} {...props}>
      {statusLabels[status]}
    </Badge>
  );
}

/**
 * Platform badge component for displaying platform indicators.
 */
interface PlatformBadgeProps extends Omit<BadgeProps, "variant"> {
  platform: string;
}

function PlatformBadge({ platform, className, ...props }: PlatformBadgeProps) {
  const lower = platform.toLowerCase();

  const getPlatformStyles = (): string => {
    if (lower.includes("darwin") || lower.includes("macos")) {
      return "border-gray-500/30 bg-gray-800/80 text-gray-200";
    }
    if (lower.includes("windows") || lower.includes("win")) {
      return "border-sky-500/30 bg-sky-500/20 text-sky-300";
    }
    return "border-amber-500/30 bg-amber-500/20 text-amber-300";
  };

  const getPlatformLabel = (): string => {
    if (lower.includes("darwin") || lower.includes("macos")) {
      if (lower.includes("aarch64") || lower.includes("arm")) {
        return "macOS ARM";
      }
      if (lower.includes("x86_64") || lower.includes("intel")) {
        return "macOS Intel";
      }
      return "macOS";
    }
    if (lower.includes("windows") || lower.includes("win")) {
      if (lower.includes("x86_64") || lower.includes("64")) {
        return "Windows 64";
      }
      if (lower.includes("x86") || lower.includes("32")) {
        return "Windows 32";
      }
      return "Windows";
    }
    if (lower.includes("aarch64") || lower.includes("arm")) {
      return "Linux ARM";
    }
    if (lower.includes("x86_64") || lower.includes("64")) {
      return "Linux 64";
    }
    return "Linux";
  };

  return (
    <Badge
      variant="outline"
      className={cn(getPlatformStyles(), className)}
      {...props}
    >
      {getPlatformLabel()}
    </Badge>
  );
}

export { Badge, StatusBadge, PlatformBadge };
