"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getApps } from "@/lib/api";
import type { App } from "@/lib/types";
import { ChevronDown, Box, Check, Plus } from "lucide-react";

interface AppSwitcherProps {
  currentAppId?: string;
  className?: string;
}

export function AppSwitcher({ currentAppId, className }: AppSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["apps"],
    queryFn: getApps,
    staleTime: 30000,
  });

  const currentApp = apps.find((app) => app.id === currentAppId);

  const handleSelectApp = (app: App) => {
    router.push(`/apps/${app.id}`);
    setOpen(false);
  };

  const handleCreateApp = () => {
    router.push("/apps?create=true");
    setOpen(false);
  };

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg",
          "bg-[hsl(var(--muted))] hover:bg-[hsl(var(--muted))]/80",
          "border border-[hsl(var(--border))]",
          "text-sm font-medium text-[hsl(var(--foreground))]",
          "transition-colors duration-200 cursor-pointer",
          "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:ring-offset-2 focus:ring-offset-[hsl(var(--background))]",
          className
        )}
      >
        <Box className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
        <span className="max-w-[160px] truncate">
          {isLoading ? "Loading..." : currentApp?.name || "Select App"}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[hsl(var(--foreground-muted))] transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cn(
            "z-50 min-w-[220px] overflow-hidden rounded-lg",
            "bg-[hsl(var(--card))] border border-[hsl(var(--border))]",
            "shadow-lg",
            "animate-scale-up"
          )}
          sideOffset={8}
          align="start"
        >
          {apps.length > 0 && (
            <>
              <DropdownMenu.Label className="px-3 py-2 text-xs font-medium text-[hsl(var(--foreground-muted))]">
                Switch Application
              </DropdownMenu.Label>
              <DropdownMenu.Separator className="h-px bg-[hsl(var(--border))] mx-2" />
            </>
          )}

          <div className="py-1 max-h-[300px] overflow-y-auto">
            {apps.length === 0 && !isLoading && (
              <div className="px-3 py-4 text-center text-sm text-[hsl(var(--foreground-muted))]">
                No applications yet
              </div>
            )}

            {apps.map((app) => (
              <DropdownMenu.Item
                key={app.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 mx-1 rounded-md cursor-pointer",
                  "text-sm text-[hsl(var(--foreground))]",
                  "outline-none transition-colors duration-150",
                  "hover:bg-[hsl(var(--muted))] focus:bg-[hsl(var(--muted))]",
                  app.id === currentAppId && "bg-[hsl(var(--muted))]"
                )}
                onSelect={() => handleSelectApp(app)}
              >
                <Box className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{app.name}</p>
                  <p className="text-xs text-[hsl(var(--foreground-muted))] truncate">
                    {app.slug}
                  </p>
                </div>
                {app.id === currentAppId && (
                  <Check className="h-4 w-4 text-[hsl(var(--secondary))]" />
                )}
              </DropdownMenu.Item>
            ))}
          </div>

          <DropdownMenu.Separator className="h-px bg-[hsl(var(--border))] mx-2" />

          <DropdownMenu.Item
            className={cn(
              "flex items-center gap-3 px-3 py-2 mx-1 my-1 rounded-md cursor-pointer",
              "text-sm text-[hsl(var(--foreground))]",
              "outline-none transition-colors duration-150",
              "hover:bg-[hsl(var(--muted))] focus:bg-[hsl(var(--muted))]"
            )}
            onSelect={handleCreateApp}
          >
            <Plus className="h-4 w-4 text-[hsl(var(--secondary))]" />
            <span>Create New App</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
