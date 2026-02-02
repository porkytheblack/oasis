"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Box, Key, Settings, Home, Sparkles } from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  {
    label: "Overview",
    href: "/",
    icon: Home,
  },
  {
    label: "Apps",
    href: "/apps",
    icon: Box,
  },
  {
    label: "API Keys",
    href: "/api-keys",
    icon: Key,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string): boolean => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  };

  return (
    <aside className="fixed left-0 top-0 z-30 h-screen w-64 bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))] flex flex-col">
      {/* Logo / Brand - hex.tech inspired gradient */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[hsl(var(--sidebar-border))]">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--accent))] shadow-lg shadow-[hsl(var(--accent))]/20">
          <Box className="h-5 w-5 text-white" />
          {/* Subtle glow effect */}
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/10 to-transparent" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-[hsl(var(--sidebar-foreground))] tracking-tight">
            Oasis
          </h1>
          <p className="text-xs text-[hsl(var(--foreground-subtle))] font-medium">
            Update Server
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
                    active
                      ? "bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-accent-foreground))] shadow-sm"
                      : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))]/50 hover:text-[hsl(var(--sidebar-foreground))]"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0 transition-colors duration-200",
                      active
                        ? "text-[hsl(var(--accent))]"
                        : "text-[hsl(var(--foreground-muted))] group-hover:text-[hsl(var(--accent))]"
                    )}
                  />
                  {item.label}
                  {/* Active indicator line */}
                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Decorative divider */}
        <div className="my-4 h-px bg-gradient-to-r from-transparent via-[hsl(var(--sidebar-border))] to-transparent" />

        {/* Pro tip or feature highlight - hex.tech style */}
        <div className="mx-1 rounded-lg bg-gradient-to-br from-[hsl(var(--primary))]/10 to-[hsl(var(--accent))]/10 border border-[hsl(var(--border))]/50 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-[hsl(var(--accent))]">
            <Sparkles className="h-3.5 w-3.5" />
            Pro Tip
          </div>
          <p className="mt-1.5 text-xs text-[hsl(var(--foreground-muted))] leading-relaxed">
            Use the API to automate your release workflow with CI/CD.
          </p>
        </div>
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-[hsl(var(--sidebar-border))]">
        <Link
          href="/settings"
          className={cn(
            "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
            pathname === "/settings"
              ? "bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-accent-foreground))]"
              : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))]/50"
          )}
        >
          <Settings
            className={cn(
              "h-5 w-5 transition-colors duration-200",
              pathname === "/settings"
                ? "text-[hsl(var(--accent))]"
                : "text-[hsl(var(--foreground-muted))] group-hover:text-[hsl(var(--accent))]"
            )}
          />
          Settings
        </Link>

        {/* Version badge */}
        <div className="mt-3 mx-3 flex items-center justify-between">
          <span className="text-[10px] font-medium text-[hsl(var(--foreground-subtle))] uppercase tracking-wider">
            Version
          </span>
          <span className="text-[10px] font-mono text-[hsl(var(--foreground-muted))]">
            0.1.0
          </span>
        </div>
      </div>
    </aside>
  );
}
