"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { AppSwitcher } from "./app-switcher";

interface Breadcrumb {
  label: string;
  href?: string;
}

interface HeaderProps {
  title?: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  currentAppId?: string;
  actions?: React.ReactNode;
}

export function Header({
  title,
  description,
  breadcrumbs,
  currentAppId,
  actions,
}: HeaderProps) {
  const pathname = usePathname();

  // Determine if we're in an app context
  const isAppContext = pathname.startsWith("/apps/") && currentAppId;

  // Determine if we need extra height for description
  const hasDescription = Boolean(description);
  const hasBreadcrumbs = breadcrumbs && breadcrumbs.length > 0;

  return (
    <header className="sticky top-0 z-20 bg-[hsl(var(--background))]/80 backdrop-blur-xl border-b border-[hsl(var(--border))]">
      {/* Subtle gradient line at top - hex.tech style */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--accent))]/20 to-transparent" />

      <div
        className={cn(
          "flex items-center justify-between px-6",
          hasDescription || hasBreadcrumbs ? "py-5" : "h-16"
        )}
      >
        <div className="flex items-center gap-4 min-w-0 flex-1">
          {/* App Switcher (shown when in app context) */}
          {isAppContext && (
            <div className="flex-shrink-0">
              <AppSwitcher currentAppId={currentAppId} />
            </div>
          )}

          {/* Title and Breadcrumbs */}
          <div className="flex flex-col gap-1.5 min-w-0">
            {hasBreadcrumbs && (
              <nav className="flex items-center gap-2 text-xs text-[hsl(var(--foreground-muted))]">
                {breadcrumbs.map((crumb, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && (
                      <span className="text-[hsl(var(--foreground-subtle))]">/</span>
                    )}
                    {crumb.href ? (
                      <a
                        href={crumb.href}
                        className="hover:text-[hsl(var(--accent))] transition-colors cursor-pointer"
                      >
                        {crumb.label}
                      </a>
                    ) : (
                      <span className="text-[hsl(var(--foreground))] font-medium">
                        {crumb.label}
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </nav>
            )}
            {title && (
              <h1 className="text-xl font-semibold text-[hsl(var(--foreground))] truncate tracking-tight">
                {title}
              </h1>
            )}
            {description && (
              <p className="text-sm text-[hsl(var(--foreground-muted))] line-clamp-1">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        {actions && (
          <div className="flex items-center gap-3 flex-shrink-0 ml-4">{actions}</div>
        )}
      </div>
    </header>
  );
}

/**
 * Page wrapper component that includes header and main content area.
 */
interface PageProps {
  title?: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  currentAppId?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Page({
  title,
  description,
  breadcrumbs,
  currentAppId,
  actions,
  children,
  className,
}: PageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(var(--background))] to-[hsl(var(--background-subtle))]">
      <Header
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
        currentAppId={currentAppId}
        actions={actions}
      />
      <main className={cn("p-6", className)}>{children}</main>
    </div>
  );
}
