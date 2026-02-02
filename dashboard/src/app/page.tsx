"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getApps, getApiKeys, checkHealth, getApiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Page } from "@/components/header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
} from "@/components/ui";
import { Box, Key, ArrowRight, Package, Activity, LogOut, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { logout } = useAuth();

  const { data: apps = [], isLoading: appsLoading } = useQuery({
    queryKey: ["apps"],
    queryFn: getApps,
  });

  const { data: apiKeys = [], isLoading: keysLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: getApiKeys,
  });

  const {
    data: healthData,
    isLoading: healthLoading,
    error: healthError,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: ["health"],
    queryFn: checkHealth,
    refetchInterval: 30000, // Refetch every 30 seconds
    retry: 1,
  });

  const totalReleases = apps.reduce(
    (sum, app) => sum + (app.releaseCount || 0),
    0
  );

  const activeApiKeys = apiKeys.filter((key) => !key.revokedAt).length;

  const stats = [
    {
      label: "Applications",
      value: apps.length,
      icon: Box,
      href: "/apps",
      loading: appsLoading,
      color: "from-violet-500 to-purple-600",
    },
    {
      label: "Total Releases",
      value: totalReleases,
      icon: Package,
      href: "/apps",
      loading: appsLoading,
      color: "from-emerald-500 to-teal-600",
    },
    {
      label: "Active API Keys",
      value: activeApiKeys,
      icon: Key,
      href: "/api-keys",
      loading: keysLoading,
      color: "from-amber-500 to-orange-600",
    },
  ];

  const serverStatus = healthError
    ? "offline"
    : healthData?.status === "healthy"
    ? "online"
    : healthData?.status === "degraded"
    ? "degraded"
    : healthLoading
    ? "checking"
    : "unknown";

  const serverStatusColor = {
    online: "bg-emerald-500",
    degraded: "bg-amber-500",
    offline: "bg-red-500",
    checking: "bg-blue-500 animate-pulse",
    unknown: "bg-gray-500",
  }[serverStatus];

  const serverStatusText = {
    online: "Online",
    degraded: "Degraded",
    offline: "Offline",
    checking: "Checking...",
    unknown: "Unknown",
  }[serverStatus];

  const apiEndpoint = getApiUrl();

  return (
    <Page
      title="Dashboard"
      description="Overview of your Oasis Update Server"
      actions={
        <Button variant="outline" onClick={logout}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      }
    >
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card
              interactive
              className="group overflow-hidden transition-all duration-200 hover:shadow-lg"
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[hsl(var(--foreground-muted))] mb-1">
                      {stat.label}
                    </p>
                    <p className="text-3xl font-bold text-[hsl(var(--foreground))]">
                      {stat.loading ? "..." : stat.value}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br",
                      stat.color
                    )}
                  >
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm text-[hsl(var(--foreground-muted))] group-hover:text-[hsl(var(--primary))]">
                  View details
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions & Recent Apps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Apps */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Box className="h-5 w-5 text-[hsl(var(--primary))]" />
              Recent Applications
            </CardTitle>
            <CardDescription>
              Your most recently updated applications
            </CardDescription>
          </CardHeader>
          <CardContent>
            {appsLoading ? (
              <div className="py-8 text-center text-[hsl(var(--foreground-muted))]">
                Loading...
              </div>
            ) : apps.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-[hsl(var(--foreground-muted))] mb-4">
                  No applications yet
                </p>
                <Link
                  href="/apps?create=true"
                  className="inline-flex items-center text-sm font-medium text-[hsl(var(--primary))] hover:underline cursor-pointer"
                >
                  Create your first app
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {apps.slice(0, 5).map((app) => (
                  <Link
                    key={app.id}
                    href={`/apps/${app.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-[hsl(var(--muted))] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--muted))]">
                        <Box className="h-5 w-5 text-[hsl(var(--foreground-muted))]" />
                      </div>
                      <div>
                        <p className="font-medium text-[hsl(var(--foreground))]">
                          {app.name}
                        </p>
                        <p className="text-xs text-[hsl(var(--foreground-muted))]">
                          {app.releaseCount || 0} release
                          {app.releaseCount !== 1 ? "s" : ""}
                          {app.latestVersion && ` - v${app.latestVersion}`}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Server Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-[hsl(var(--secondary))]" />
              Server Status
            </CardTitle>
            <CardDescription>Current server health and status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--muted))]">
                <div className="flex items-center gap-3">
                  <div className={cn("h-3 w-3 rounded-full", serverStatusColor)} />
                  <span className="font-medium text-[hsl(var(--foreground))]">
                    API Server
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-sm",
                      serverStatus === "online"
                        ? "text-emerald-500"
                        : serverStatus === "degraded"
                        ? "text-amber-500"
                        : serverStatus === "offline"
                        ? "text-red-500"
                        : "text-[hsl(var(--foreground-muted))]"
                    )}
                  >
                    {serverStatusText}
                  </span>
                  <button
                    onClick={() => refetchHealth()}
                    className="p-1 rounded hover:bg-[hsl(var(--background))] transition-colors cursor-pointer"
                    title="Refresh status"
                  >
                    <RefreshCw className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-[hsl(var(--muted))]">
                  <p className="text-xs text-[hsl(var(--foreground-muted))] mb-1">
                    API Endpoint
                  </p>
                  <p className="text-sm font-mono text-[hsl(var(--foreground))] truncate">
                    {apiEndpoint.replace(/^https?:\/\//, "")}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-[hsl(var(--muted))]">
                  <p className="text-xs text-[hsl(var(--foreground-muted))] mb-1">
                    Server Version
                  </p>
                  <p className="text-sm font-mono text-[hsl(var(--foreground))]">
                    {healthData?.version || "N/A"}
                  </p>
                </div>
              </div>

              {healthData && (
                <div className="p-3 rounded-lg bg-[hsl(var(--muted))]">
                  <p className="text-xs text-[hsl(var(--foreground-muted))] mb-1">
                    Uptime
                  </p>
                  <p className="text-sm font-mono text-[hsl(var(--foreground))]">
                    {formatUptime(healthData.uptime)}
                  </p>
                </div>
              )}

              <div className="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                <p className="text-sm text-[hsl(var(--foreground-muted))]">
                  The Oasis Update Server is running and ready to serve updates
                  to your Tauri applications. Configure your apps with the
                  server endpoint to enable automatic updates.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}

/**
 * Formats uptime in seconds to a human-readable string.
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ${minutes % 60}m`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
