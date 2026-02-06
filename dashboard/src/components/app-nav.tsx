"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Package, MessageSquare, Bug, Key } from "lucide-react";

interface AppNavProps {
  appId: string;
  className?: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  pattern: RegExp;
}

export function AppNav({ appId, className }: AppNavProps) {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    {
      label: "Releases",
      href: `/apps/${appId}`,
      icon: Package,
      pattern: new RegExp(`^/apps/${appId}(/releases)?$`),
    },
    {
      label: "Feedback",
      href: `/apps/${appId}/feedback`,
      icon: MessageSquare,
      pattern: new RegExp(`^/apps/${appId}/feedback`),
    },
    {
      label: "Crashes",
      href: `/apps/${appId}/crashes`,
      icon: Bug,
      pattern: new RegExp(`^/apps/${appId}/crashes`),
    },
    {
      label: "SDK Keys",
      href: `/apps/${appId}/sdk-keys`,
      icon: Key,
      pattern: new RegExp(`^/apps/${appId}/sdk-keys`),
    },
  ];

  const isActive = (pattern: RegExp) => pattern.test(pathname);

  return (
    <nav className={cn("flex gap-1 mb-6 border-b border-[hsl(var(--border))] pb-4", className)}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.pattern);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
              active
                ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/20"
                : "text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4",
                active ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--foreground-muted))]"
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
