"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getApp,
  getCrashStats,
  getCrashGroups,
  updateCrashGroup,
  getErrorMessage,
} from "@/lib/api";
import type { CrashGroup, CrashGroupStatus } from "@/lib/types";
import { Page } from "@/components/header";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  EmptyState,
  PageSpinner,
} from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { AppNav } from "@/components/app-nav";
import {
  AlertTriangle,
  Bug,
  Users,
  TrendingDown,
  Clock,
  ChevronRight,
  Filter,
  MoreVertical,
  CheckCircle,
  Search as SearchIcon,
  EyeOff,
  Loader2,
  ChevronDown,
  BarChart3,
} from "lucide-react";
import { formatRelativeTime, cn } from "@/lib/utils";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Select from "@radix-ui/react-select";

const statusColors: Record<CrashGroupStatus, string> = {
  new: "border-red-500/30 bg-red-500/15 text-red-300",
  investigating: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  resolved: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  ignored: "border-gray-500/30 bg-gray-500/15 text-gray-300",
};

const statusLabels: Record<CrashGroupStatus, string> = {
  new: "New",
  investigating: "Investigating",
  resolved: "Resolved",
  ignored: "Ignored",
};

type PeriodOption = "24h" | "7d" | "30d" | "90d";

const periodLabels: Record<PeriodOption, string> = {
  "24h": "Last 24 Hours",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  "90d": "Last 90 Days",
};

export default function CrashesPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const appId = params.appId as string;

  const [period, setPeriod] = React.useState<PeriodOption>("7d");
  const [statusFilter, setStatusFilter] = React.useState<CrashGroupStatus | "all">("all");
  const [sortBy, setSortBy] = React.useState<"count" | "last_seen" | "first_seen">("last_seen");
  const [page, setPage] = React.useState(1);

  const { data: app, isLoading: appLoading, error: appError } = useQuery({
    queryKey: ["app", appId],
    queryFn: () => getApp(appId),
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["crash-stats", appId, period],
    queryFn: () => getCrashStats(appId, period),
  });

  const { data: crashGroupsData, isLoading: groupsLoading } = useQuery({
    queryKey: ["crash-groups", appId, page, statusFilter, sortBy],
    queryFn: () => getCrashGroups(appId, {
      page,
      limit: 20,
      status: statusFilter !== "all" ? statusFilter : undefined,
      sort: sortBy,
      order: "desc",
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ groupId, status }: { groupId: string; status: CrashGroupStatus }) =>
      updateCrashGroup(appId, groupId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crash-groups", appId] });
      queryClient.invalidateQueries({ queryKey: ["crash-stats", appId] });
      toast.success("Crash group updated", "Status has been changed.");
    },
    onError: (err) => {
      toast.error("Failed to update crash group", getErrorMessage(err));
    },
  });

  const crashGroups = crashGroupsData?.items || [];
  const pagination = crashGroupsData?.pagination;

  if (appLoading) {
    return (
      <Page title="Loading...">
        <PageSpinner />
      </Page>
    );
  }

  if (appError || !app) {
    return (
      <Page
        title="Application Not Found"
        breadcrumbs={[{ label: "Apps", href: "/apps" }, { label: "Not Found" }]}
      >
        <Card>
          <CardContent className="p-6">
            <p className="text-[hsl(var(--destructive))]">
              {appError ? getErrorMessage(appError) : "Application not found."}
            </p>
          </CardContent>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title="Crash Analytics"
      description={`Crash reports and analytics for ${app.name}`}
      currentAppId={appId}
      breadcrumbs={[
        { label: "Apps", href: "/apps" },
        { label: app.name, href: `/apps/${appId}` },
        { label: "Crashes" },
      ]}
    >
      {/* App Navigation */}
      <AppNav appId={appId} />

      {/* Period Selector */}
      <div className="flex items-center justify-end mb-4">
        <Select.Root value={period} onValueChange={(value) => setPeriod(value as PeriodOption)}>
          <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] min-w-[150px] hover:bg-[hsl(var(--muted))]">
            <Select.Value />
            <Select.Icon>
              <ChevronDown className="h-4 w-4" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg z-50">
              <Select.Viewport className="p-1">
                {Object.entries(periodLabels).map(([value, label]) => (
                  <Select.Item
                    key={value}
                    value={value}
                    className="px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                  >
                    <Select.ItemText>{label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <Bug className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-[hsl(var(--foreground-muted))]">Total Crashes</p>
                <p className="text-2xl font-semibold text-[hsl(var(--foreground))]">
                  {statsLoading ? "..." : stats?.totalCrashes ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-[hsl(var(--foreground-muted))]">Crash Groups</p>
                <p className="text-2xl font-semibold text-[hsl(var(--foreground))]">
                  {statsLoading ? "..." : stats?.totalGroups ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <TrendingDown className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-[hsl(var(--foreground-muted))]">Crash-Free Rate</p>
                <p className="text-2xl font-semibold text-[hsl(var(--foreground))]">
                  {statsLoading ? "..." : stats?.crashFreeRate ? `${stats.crashFreeRate.toFixed(1)}%` : "N/A"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[hsl(var(--primary))]/10">
                <BarChart3 className="h-5 w-5 text-[hsl(var(--primary))]" />
              </div>
              <div>
                <p className="text-sm text-[hsl(var(--foreground-muted))]">Period</p>
                <p className="text-2xl font-semibold text-[hsl(var(--foreground))]">
                  {periodLabels[period]}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Crashes Quick View */}
      {stats?.topCrashGroups && stats.topCrashGroups.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Top Crashes
            </CardTitle>
            <CardDescription>
              Most frequent crashes in the selected period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topCrashGroups.slice(0, 5).map((crash, index) => (
                <div
                  key={crash.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--muted))]/50 hover:bg-[hsl(var(--muted))] cursor-pointer transition-colors"
                  onClick={() => router.push(`/apps/${appId}/crashes/groups/${crash.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold text-[hsl(var(--foreground-muted))] w-6">
                      #{index + 1}
                    </span>
                    <div>
                      <p className="font-medium text-[hsl(var(--foreground))]">
                        {crash.errorType}
                      </p>
                      <p className="text-sm text-[hsl(var(--foreground-muted))] line-clamp-1">
                        {crash.errorMessage}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-red-400">
                      {crash.count} occurrences
                    </span>
                    <ChevronRight className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />

              <Select.Root
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as CrashGroupStatus | "all");
                  setPage(1);
                }}
              >
                <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] min-w-[140px] hover:bg-[hsl(var(--muted))]">
                  <Select.Value placeholder="Status" />
                  <Select.Icon>
                    <ChevronDown className="h-4 w-4" />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg z-50">
                    <Select.Viewport className="p-1">
                      <Select.Item value="all" className="px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                        <Select.ItemText>All Status</Select.ItemText>
                      </Select.Item>
                      <Select.Item value="new" className="px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                        <Select.ItemText>New</Select.ItemText>
                      </Select.Item>
                      <Select.Item value="investigating" className="px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                        <Select.ItemText>Investigating</Select.ItemText>
                      </Select.Item>
                      <Select.Item value="resolved" className="px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                        <Select.ItemText>Resolved</Select.ItemText>
                      </Select.Item>
                      <Select.Item value="ignored" className="px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                        <Select.ItemText>Ignored</Select.ItemText>
                      </Select.Item>
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>

              <Select.Root
                value={sortBy}
                onValueChange={(value) => {
                  setSortBy(value as "count" | "last_seen" | "first_seen");
                  setPage(1);
                }}
              >
                <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] min-w-[140px] hover:bg-[hsl(var(--muted))]">
                  <Select.Value placeholder="Sort By" />
                  <Select.Icon>
                    <ChevronDown className="h-4 w-4" />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg z-50">
                    <Select.Viewport className="p-1">
                      <Select.Item value="last_seen" className="px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                        <Select.ItemText>Most Recent</Select.ItemText>
                      </Select.Item>
                      <Select.Item value="count" className="px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                        <Select.ItemText>Most Occurrences</Select.ItemText>
                      </Select.Item>
                      <Select.Item value="first_seen" className="px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                        <Select.ItemText>Oldest First</Select.ItemText>
                      </Select.Item>
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Crash Groups List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-[hsl(var(--primary))]" />
            Crash Groups
          </CardTitle>
          <CardDescription>
            Similar crashes grouped by error fingerprint
          </CardDescription>
        </CardHeader>
        <CardContent>
          {groupsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
            </div>
          ) : crashGroups.length === 0 ? (
            <EmptyState
              icon={Bug}
              title="No crashes recorded"
              description={statusFilter !== "all"
                ? "No crashes match your filters."
                : "Your app is crash-free! Crashes will appear here when reported."}
            />
          ) : (
            <>
              <div className="space-y-3">
                {crashGroups.map((group) => (
                  <CrashGroupRow
                    key={group.id}
                    group={group}
                    appId={appId}
                    onStatusChange={(status) =>
                      updateMutation.mutate({ groupId: group.id, status })
                    }
                    isUpdating={updateMutation.isPending}
                  />
                ))}
              </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-[hsl(var(--border))]">
                  <p className="text-sm text-[hsl(var(--foreground-muted))]">
                    Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, pagination.total)} of {pagination.total} groups
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-[hsl(var(--foreground-muted))]">
                      Page {page} of {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                      disabled={page >= pagination.totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}

interface CrashGroupRowProps {
  group: CrashGroup;
  appId: string;
  onStatusChange: (status: CrashGroupStatus) => void;
  isUpdating: boolean;
}

function CrashGroupRow({ group, appId, onStatusChange, isUpdating }: CrashGroupRowProps) {
  const router = useRouter();

  const handleRowClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("[role='menu']")) {
      return;
    }
    router.push(`/apps/${appId}/crashes/groups/${group.id}`);
  };

  return (
    <div
      onClick={handleRowClick}
      className={cn(
        "flex items-start justify-between p-4 rounded-lg border border-[hsl(var(--border))]",
        "cursor-pointer hover:bg-[hsl(var(--muted))]/50 hover:border-[hsl(var(--primary))]/30",
        "transition-all duration-150 group"
      )}
    >
      <div className="flex items-start gap-4 flex-1 min-w-0">
        <div className="p-2 rounded-lg bg-red-500/10 shrink-0">
          <Bug className="h-5 w-5 text-red-500" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors">
              {group.errorType}
            </span>
            <Badge className={statusColors[group.status]}>
              {statusLabels[group.status]}
            </Badge>
          </div>

          <p className="text-sm text-[hsl(var(--foreground-muted))] line-clamp-2 mb-2">
            {group.errorMessage}
          </p>

          <div className="flex items-center gap-4 text-sm text-[hsl(var(--foreground-muted))]">
            <span className="flex items-center gap-1 text-red-400 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              {group.occurrenceCount} occurrences
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {group.affectedUsersCount} users affected
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Last seen {formatRelativeTime(group.lastSeenAt)}
            </span>
          </div>

          {group.affectedVersions.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-[hsl(var(--foreground-muted))]">Versions:</span>
              {group.affectedVersions.slice(0, 3).map((version) => (
                <Badge key={version} variant="outline" className="text-xs">
                  v{version}
                </Badge>
              ))}
              {group.affectedVersions.length > 3 && (
                <span className="text-xs text-[hsl(var(--foreground-muted))]">
                  +{group.affectedVersions.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 ml-4">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/apps/${appId}/crashes/groups/${group.id}`);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          View Details
        </Button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className={cn(
                "z-50 min-w-[180px] overflow-hidden rounded-lg",
                "bg-[hsl(var(--card))] border border-[hsl(var(--border))]",
                "shadow-lg p-1",
                "animate-scale-up"
              )}
              align="end"
              sideOffset={5}
            >
              <DropdownMenu.Label className="px-3 py-1.5 text-xs font-medium text-[hsl(var(--foreground-muted))]">
                Change Status
              </DropdownMenu.Label>

              {group.status !== "new" && (
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                  onSelect={() => onStatusChange("new")}
                  disabled={isUpdating}
                >
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Mark as New
                </DropdownMenu.Item>
              )}

              {group.status !== "investigating" && (
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                  onSelect={() => onStatusChange("investigating")}
                  disabled={isUpdating}
                >
                  <SearchIcon className="h-4 w-4 text-amber-500" />
                  Mark as Investigating
                </DropdownMenu.Item>
              )}

              {group.status !== "resolved" && (
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                  onSelect={() => onStatusChange("resolved")}
                  disabled={isUpdating}
                >
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  Mark as Resolved
                </DropdownMenu.Item>
              )}

              {group.status !== "ignored" && (
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                  onSelect={() => onStatusChange("ignored")}
                  disabled={isUpdating}
                >
                  <EyeOff className="h-4 w-4 text-gray-500" />
                  Ignore
                </DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  );
}
