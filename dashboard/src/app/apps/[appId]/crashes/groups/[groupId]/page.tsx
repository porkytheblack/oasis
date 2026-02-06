"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getApp,
  getCrashGroupById,
  getCrashReportsForGroup,
  updateCrashGroup,
  getErrorMessage,
} from "@/lib/api";
import type { CrashReport, CrashGroupStatus, CrashSeverity, UpdateCrashGroupRequest } from "@/lib/types";
import { Page } from "@/components/header";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Textarea,
  Label,
  EmptyState,
  PageSpinner,
} from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import {
  Bug,
  ArrowLeft,
  Clock,
  AlertTriangle,
  Monitor,
  Save,
  CheckCircle,
  Loader2,
  ChevronDown,
  Code,
  FileCode,
  ChevronRight,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { formatRelativeTime, cn } from "@/lib/utils";
import * as Select from "@radix-ui/react-select";
import * as Collapsible from "@radix-ui/react-collapsible";

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

const severityColors: Record<CrashSeverity, string> = {
  warning: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  error: "border-red-500/30 bg-red-500/15 text-red-300",
  fatal: "border-rose-600/30 bg-rose-600/15 text-rose-300",
};

const severityIcons: Record<CrashSeverity, React.ElementType> = {
  warning: AlertCircle,
  error: AlertTriangle,
  fatal: XCircle,
};

export default function CrashGroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const appId = params.appId as string;
  const groupId = params.groupId as string;

  const [resolutionNotes, setResolutionNotes] = React.useState("");
  const [selectedStatus, setSelectedStatus] = React.useState<CrashGroupStatus | null>(null);
  const [hasChanges, setHasChanges] = React.useState(false);
  const [page, setPage] = React.useState(1);

  const { data: app, isLoading: appLoading, error: appError } = useQuery({
    queryKey: ["app", appId],
    queryFn: () => getApp(appId),
  });

  const { data: group, isLoading: groupLoading, error: groupError } = useQuery({
    queryKey: ["crash-group", appId, groupId],
    queryFn: () => getCrashGroupById(appId, groupId),
  });

  const { data: reportsData, isLoading: reportsLoading } = useQuery({
    queryKey: ["crash-reports", appId, groupId, page],
    queryFn: () => getCrashReportsForGroup(appId, groupId, page, 10),
    enabled: !!group,
  });

  // Initialize local state when group loads
  React.useEffect(() => {
    if (group) {
      setResolutionNotes(group.resolutionNotes ?? "");
      setSelectedStatus(group.status);
    }
  }, [group]);

  // Track changes
  React.useEffect(() => {
    if (group) {
      const notesChanged = resolutionNotes !== (group.resolutionNotes ?? "");
      const statusChanged = selectedStatus !== null && selectedStatus !== group.status;
      setHasChanges(notesChanged || statusChanged);
    }
  }, [group, resolutionNotes, selectedStatus]);

  const updateMutation = useMutation({
    mutationFn: (data: UpdateCrashGroupRequest) =>
      updateCrashGroup(appId, groupId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crash-group", appId, groupId] });
      queryClient.invalidateQueries({ queryKey: ["crash-groups", appId] });
      queryClient.invalidateQueries({ queryKey: ["crash-stats", appId] });
      toast.success("Crash group updated", "Changes have been saved.");
      setHasChanges(false);
    },
    onError: (err) => {
      toast.error("Failed to update crash group", getErrorMessage(err));
    },
  });

  const handleSave = () => {
    const updates: UpdateCrashGroupRequest = {};
    if (selectedStatus && selectedStatus !== group?.status) {
      updates.status = selectedStatus;
    }
    if (resolutionNotes !== (group?.resolutionNotes ?? "")) {
      updates.resolutionNotes = resolutionNotes || null;
    }
    updateMutation.mutate(updates);
  };

  const reports = reportsData?.items || [];
  const pagination = reportsData?.pagination;

  if (appLoading || groupLoading) {
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

  if (groupError || !group) {
    return (
      <Page
        title="Crash Group Not Found"
        breadcrumbs={[
          { label: "Apps", href: "/apps" },
          { label: app.name, href: `/apps/${appId}` },
          { label: "Crashes", href: `/apps/${appId}/crashes` },
          { label: "Not Found" },
        ]}
      >
        <Card>
          <CardContent className="p-6">
            <p className="text-[hsl(var(--destructive))]">
              {groupError ? getErrorMessage(groupError) : "Crash group not found."}
            </p>
          </CardContent>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title={group.errorType}
      description="Crash group details"
      currentAppId={appId}
      breadcrumbs={[
        { label: "Apps", href: "/apps" },
        { label: app.name, href: `/apps/${appId}` },
        { label: "Crashes", href: `/apps/${appId}/crashes` },
        { label: group.errorType },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/apps/${appId}/crashes`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Crashes
          </Button>
          {hasChanges && (
            <Button onClick={handleSave} loading={updateMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Error Overview */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-500/10">
                    <Bug className="h-6 w-6 text-red-500" />
                  </div>
                  <div>
                    <CardTitle className="text-red-400">{group.errorType}</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      First seen {formatRelativeTime(group.firstSeenAt)}
                    </CardDescription>
                  </div>
                </div>
                <Badge className={statusColors[group.status]}>
                  {statusLabels[group.status]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-[hsl(var(--muted))] rounded-lg p-4 font-mono text-sm text-[hsl(var(--foreground))] overflow-x-auto">
                {group.errorMessage}
              </div>
            </CardContent>
          </Card>

          {/* Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-red-400">{group.occurrenceCount}</p>
                <p className="text-sm text-[hsl(var(--foreground-muted))]">Total Crashes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-amber-400">{group.affectedUsersCount}</p>
                <p className="text-sm text-[hsl(var(--foreground-muted))]">Users Affected</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-[hsl(var(--foreground))]">{group.affectedVersions.length}</p>
                <p className="text-sm text-[hsl(var(--foreground-muted))]">Versions</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-[hsl(var(--foreground))]">{group.affectedPlatforms.length}</p>
                <p className="text-sm text-[hsl(var(--foreground-muted))]">Platforms</p>
              </CardContent>
            </Card>
          </div>

          {/* Affected Versions & Platforms */}
          <Card>
            <CardHeader>
              <CardTitle>Affected Systems</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="mb-2 block">Versions</Label>
                <div className="flex flex-wrap gap-2">
                  {group.affectedVersions.map((version) => (
                    <Badge key={version} variant="outline">
                      v{version}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Platforms</Label>
                <div className="flex flex-wrap gap-2">
                  {group.affectedPlatforms.map((platform) => (
                    <Badge key={platform} variant="outline">
                      {platform}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resolution Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Resolution Notes</CardTitle>
              <CardDescription>
                Document the root cause, fix, and any relevant details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Add resolution notes..."
                rows={5}
              />
            </CardContent>
          </Card>

          {/* Recent Crash Reports */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-[hsl(var(--primary))]" />
                Recent Crash Reports
              </CardTitle>
              <CardDescription>
                Individual crash occurrences in this group
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reportsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--primary))]" />
                </div>
              ) : reports.length === 0 ? (
                <EmptyState
                  icon={Bug}
                  title="No crash reports"
                  description="Individual crash reports will appear here."
                />
              ) : (
                <>
                  <div className="space-y-4">
                    {reports.map((report) => (
                      <CrashReportCard key={report.id} report={report} />
                    ))}
                  </div>

                  {/* Pagination */}
                  {pagination && pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-[hsl(var(--border))]">
                      <p className="text-sm text-[hsl(var(--foreground-muted))]">
                        Showing {((page - 1) * 10) + 1} to {Math.min(page * 10, pagination.total)} of {pagination.total}
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
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Management */}
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Current Status</Label>
                <Select.Root
                  value={selectedStatus ?? group.status}
                  onValueChange={(value) => setSelectedStatus(value as CrashGroupStatus)}
                >
                  <Select.Trigger className="w-full inline-flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]">
                    <Select.Value />
                    <Select.Icon>
                      <ChevronDown className="h-4 w-4" />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg z-50">
                      <Select.Viewport className="p-1">
                        <Select.Item value="new" className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                          <Select.ItemText>New</Select.ItemText>
                        </Select.Item>
                        <Select.Item value="investigating" className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                          <Loader2 className="h-4 w-4 text-amber-500" />
                          <Select.ItemText>Investigating</Select.ItemText>
                        </Select.Item>
                        <Select.Item value="resolved" className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                          <CheckCircle className="h-4 w-4 text-emerald-500" />
                          <Select.ItemText>Resolved</Select.ItemText>
                        </Select.Item>
                        <Select.Item value="ignored" className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                          <XCircle className="h-4 w-4 text-gray-500" />
                          <Select.ItemText>Ignored</Select.ItemText>
                        </Select.Item>
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>

              <div className="pt-2">
                <Badge className={cn("w-full justify-center py-1.5", statusColors[selectedStatus ?? group.status])}>
                  {statusLabels[selectedStatus ?? group.status]}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
                <div>
                  <p className="text-sm text-[hsl(var(--foreground-muted))]">First Seen</p>
                  <p className="text-[hsl(var(--foreground))]">
                    {new Date(group.firstSeenAt).toLocaleDateString()} at{" "}
                    {new Date(group.firstSeenAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
                <div>
                  <p className="text-sm text-[hsl(var(--foreground-muted))]">Last Seen</p>
                  <p className="text-[hsl(var(--foreground))]">
                    {new Date(group.lastSeenAt).toLocaleDateString()} at{" "}
                    {new Date(group.lastSeenAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              {group.resolvedAt && (
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <div>
                    <p className="text-sm text-[hsl(var(--foreground-muted))]">Resolved At</p>
                    <p className="text-[hsl(var(--foreground))]">
                      {new Date(group.resolvedAt).toLocaleDateString()} at{" "}
                      {new Date(group.resolvedAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fingerprint */}
          <Card>
            <CardHeader>
              <CardTitle>Fingerprint</CardTitle>
              <CardDescription>
                Unique identifier for this crash group
              </CardDescription>
            </CardHeader>
            <CardContent>
              <code className="text-xs font-mono text-[hsl(var(--foreground-muted))] bg-[hsl(var(--muted))] p-2 rounded block break-all">
                {group.fingerprint}
              </code>
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  );
}

interface CrashReportCardProps {
  report: CrashReport;
}

function CrashReportCard({ report }: CrashReportCardProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const SeverityIcon = severityIcons[report.severity];

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
      <div className="border border-[hsl(var(--border))] rounded-lg overflow-hidden">
        <Collapsible.Trigger asChild>
          <button
            className={cn(
              "w-full flex items-center justify-between p-4 text-left",
              "hover:bg-[hsl(var(--muted))]/50 transition-colors"
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-1.5 rounded-lg",
                report.severity === "fatal" && "bg-rose-500/10",
                report.severity === "error" && "bg-red-500/10",
                report.severity === "warning" && "bg-amber-500/10"
              )}>
                <SeverityIcon className={cn(
                  "h-4 w-4",
                  report.severity === "fatal" && "text-rose-500",
                  report.severity === "error" && "text-red-500",
                  report.severity === "warning" && "text-amber-500"
                )} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[hsl(var(--foreground))]">
                    v{report.appVersion}
                  </span>
                  <Badge className={severityColors[report.severity]}>
                    {report.severity}
                  </Badge>
                  <span className="text-sm text-[hsl(var(--foreground-muted))]">
                    {report.platform}
                  </span>
                </div>
                <p className="text-sm text-[hsl(var(--foreground-muted))]">
                  {formatRelativeTime(report.createdAt)}
                </p>
              </div>
            </div>
            <ChevronRight className={cn(
              "h-5 w-5 text-[hsl(var(--foreground-muted))] transition-transform",
              isOpen && "rotate-90"
            )} />
          </button>
        </Collapsible.Trigger>

        <Collapsible.Content>
          <div className="border-t border-[hsl(var(--border))] p-4 space-y-4">
            {/* Stack Trace */}
            <div>
              <Label className="mb-2 block flex items-center gap-2">
                <Code className="h-4 w-4" />
                Stack Trace
              </Label>
              <div className="bg-[hsl(var(--muted))] rounded-lg p-3 font-mono text-xs overflow-x-auto max-h-64 overflow-y-auto">
                {report.stackTrace.map((frame, index) => (
                  <div key={index} className="py-0.5">
                    {frame.isNative ? (
                      <span className="text-[hsl(var(--foreground-muted))]">[native code]</span>
                    ) : (
                      <>
                        {frame.function && (
                          <span className="text-blue-400">{frame.function}</span>
                        )}
                        {frame.file && (
                          <span className="text-[hsl(var(--foreground-muted))]">
                            {frame.function ? " at " : ""}
                            {frame.file}
                            {frame.line !== undefined && `:${frame.line}`}
                            {frame.column !== undefined && `:${frame.column}`}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Breadcrumbs */}
            {report.breadcrumbs && report.breadcrumbs.length > 0 && (
              <div>
                <Label className="mb-2 block">Breadcrumbs</Label>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {report.breadcrumbs.map((crumb, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <span className="text-[hsl(var(--foreground-muted))] text-xs">
                        {new Date(crumb.timestamp).toLocaleTimeString()}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {crumb.type}
                      </Badge>
                      <span className="text-[hsl(var(--foreground))]">
                        {crumb.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Device Info */}
            {report.deviceInfo && (
              <div>
                <Label className="mb-2 block flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Device Info
                </Label>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {report.osVersion && (
                    <div>
                      <span className="text-[hsl(var(--foreground-muted))]">OS: </span>
                      <span className="text-[hsl(var(--foreground))]">{report.osVersion}</span>
                    </div>
                  )}
                  {report.deviceInfo.screenWidth && report.deviceInfo.screenHeight && (
                    <div>
                      <span className="text-[hsl(var(--foreground-muted))]">Screen: </span>
                      <span className="text-[hsl(var(--foreground))]">
                        {report.deviceInfo.screenWidth}x{report.deviceInfo.screenHeight}
                      </span>
                    </div>
                  )}
                  {report.deviceInfo.locale && (
                    <div>
                      <span className="text-[hsl(var(--foreground-muted))]">Locale: </span>
                      <span className="text-[hsl(var(--foreground))]">{report.deviceInfo.locale}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  );
}
