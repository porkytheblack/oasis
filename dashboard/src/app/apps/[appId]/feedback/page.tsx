"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getApp,
  getFeedback,
  getFeedbackStats,
  updateFeedback,
  deleteFeedback,
  getErrorMessage,
} from "@/lib/api";
import type { Feedback, FeedbackCategory, FeedbackStatus } from "@/lib/types";
import { Page } from "@/components/header";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Input,
  EmptyState,
  PageSpinner,
} from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { AppNav } from "@/components/app-nav";
import {
  MessageSquare,
  Bug,
  Lightbulb,
  MessageCircle,
  Search,
  Filter,
  ChevronDown,
  Mail,
  Clock,
  Tag,
  MoreVertical,
  CheckCircle,
  Loader2,
  Trash2,
} from "lucide-react";
import { formatRelativeTime, cn } from "@/lib/utils";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Select from "@radix-ui/react-select";

const categoryIcons: Record<FeedbackCategory, React.ElementType> = {
  bug: Bug,
  feature: Lightbulb,
  general: MessageCircle,
};

const categoryColors: Record<FeedbackCategory, string> = {
  bug: "border-red-500/30 bg-red-500/15 text-red-300",
  feature: "border-violet-500/30 bg-violet-500/15 text-violet-300",
  general: "border-blue-500/30 bg-blue-500/15 text-blue-300",
};

const statusColors: Record<FeedbackStatus, string> = {
  open: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  in_progress: "border-blue-500/30 bg-blue-500/15 text-blue-300",
  closed: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
};

const statusLabels: Record<FeedbackStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  closed: "Closed",
};

export default function FeedbackPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const appId = params.appId as string;

  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<FeedbackStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = React.useState<FeedbackCategory | "all">("all");
  const [page, setPage] = React.useState(1);

  const { data: app, isLoading: appLoading, error: appError } = useQuery({
    queryKey: ["app", appId],
    queryFn: () => getApp(appId),
  });

  const { data: feedbackData, isLoading: feedbackLoading } = useQuery({
    queryKey: ["feedback", appId, page, statusFilter, categoryFilter, searchQuery],
    queryFn: () => getFeedback(appId, {
      page,
      limit: 20,
      status: statusFilter !== "all" ? statusFilter : undefined,
      category: categoryFilter !== "all" ? categoryFilter : undefined,
      search: searchQuery || undefined,
    }),
  });

  const { data: stats } = useQuery({
    queryKey: ["feedback-stats", appId],
    queryFn: () => getFeedbackStats(appId),
  });

  const updateMutation = useMutation({
    mutationFn: ({ feedbackId, status }: { feedbackId: string; status: FeedbackStatus }) =>
      updateFeedback(appId, feedbackId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback", appId] });
      queryClient.invalidateQueries({ queryKey: ["feedback-stats", appId] });
      toast.success("Feedback updated", "Status has been changed.");
    },
    onError: (err) => {
      toast.error("Failed to update feedback", getErrorMessage(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (feedbackId: string) => deleteFeedback(appId, feedbackId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback", appId] });
      queryClient.invalidateQueries({ queryKey: ["feedback-stats", appId] });
      toast.success("Feedback deleted", "The feedback has been deleted.");
    },
    onError: (err) => {
      toast.error("Failed to delete feedback", getErrorMessage(err));
    },
  });

  const feedback = feedbackData?.items || [];
  const pagination = feedbackData?.pagination;

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
      title="Feedback"
      description={`User feedback for ${app.name}`}
      currentAppId={appId}
      breadcrumbs={[
        { label: "Apps", href: "/apps" },
        { label: app.name, href: `/apps/${appId}` },
        { label: "Feedback" },
      ]}
    >
      {/* App Navigation */}
      <AppNav appId={appId} />

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[hsl(var(--primary))]/10">
                <MessageSquare className="h-5 w-5 text-[hsl(var(--primary))]" />
              </div>
              <div>
                <p className="text-sm text-[hsl(var(--foreground-muted))]">Total Feedback</p>
                <p className="text-2xl font-semibold text-[hsl(var(--foreground))]">
                  {stats?.total ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-[hsl(var(--foreground-muted))]">Open</p>
                <p className="text-2xl font-semibold text-[hsl(var(--foreground))]">
                  {stats?.byStatus?.open ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <Bug className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-[hsl(var(--foreground-muted))]">Bug Reports</p>
                <p className="text-2xl font-semibold text-[hsl(var(--foreground))]">
                  {stats?.byCategory?.bug ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/10">
                <Lightbulb className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <p className="text-sm text-[hsl(var(--foreground-muted))]">Feature Requests</p>
                <p className="text-2xl font-semibold text-[hsl(var(--foreground))]">
                  {stats?.byCategory?.feature ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--foreground-muted))]" />
                <Input
                  placeholder="Search feedback..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />

              <Select.Root
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as FeedbackStatus | "all");
                  setPage(1);
                }}
              >
                <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] min-w-[120px] hover:bg-[hsl(var(--muted))]">
                  <Select.Value placeholder="Status" />
                  <Select.Icon>
                    <ChevronDown className="h-4 w-4" />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg">
                    <Select.Viewport className="p-1">
                      <Select.Item value="all" className="px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                        <Select.ItemText>All Status</Select.ItemText>
                      </Select.Item>
                      <Select.Item value="open" className="px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                        <Select.ItemText>Open</Select.ItemText>
                      </Select.Item>
                      <Select.Item value="in_progress" className="px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                        <Select.ItemText>In Progress</Select.ItemText>
                      </Select.Item>
                      <Select.Item value="closed" className="px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                        <Select.ItemText>Closed</Select.ItemText>
                      </Select.Item>
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>

              <Select.Root
                value={categoryFilter}
                onValueChange={(value) => {
                  setCategoryFilter(value as FeedbackCategory | "all");
                  setPage(1);
                }}
              >
                <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] min-w-[140px] hover:bg-[hsl(var(--muted))]">
                  <Select.Value placeholder="Category" />
                  <Select.Icon>
                    <ChevronDown className="h-4 w-4" />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg">
                    <Select.Viewport className="p-1">
                      <Select.Item value="all" className="px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                        <Select.ItemText>All Categories</Select.ItemText>
                      </Select.Item>
                      <Select.Item value="bug" className="px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                        <Select.ItemText>Bug Reports</Select.ItemText>
                      </Select.Item>
                      <Select.Item value="feature" className="px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                        <Select.ItemText>Feature Requests</Select.ItemText>
                      </Select.Item>
                      <Select.Item value="general" className="px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                        <Select.ItemText>General</Select.ItemText>
                      </Select.Item>
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feedback List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-[hsl(var(--primary))]" />
            Feedback
          </CardTitle>
          <CardDescription>
            User feedback and feature requests
          </CardDescription>
        </CardHeader>
        <CardContent>
          {feedbackLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
            </div>
          ) : feedback.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No feedback yet"
              description={searchQuery || statusFilter !== "all" || categoryFilter !== "all"
                ? "No feedback matches your filters."
                : "Feedback from users will appear here."}
            />
          ) : (
            <>
              <div className="space-y-3">
                {feedback.map((item) => (
                  <FeedbackRow
                    key={item.id}
                    feedback={item}
                    appId={appId}
                    onStatusChange={(status) =>
                      updateMutation.mutate({ feedbackId: item.id, status })
                    }
                    onDelete={() => deleteMutation.mutate(item.id)}
                    isUpdating={updateMutation.isPending}
                  />
                ))}
              </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-[hsl(var(--border))]">
                  <p className="text-sm text-[hsl(var(--foreground-muted))]">
                    Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, pagination.total)} of {pagination.total} results
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

interface FeedbackRowProps {
  feedback: Feedback;
  appId: string;
  onStatusChange: (status: FeedbackStatus) => void;
  onDelete: () => void;
  isUpdating: boolean;
}

function FeedbackRow({ feedback, appId, onStatusChange, onDelete, isUpdating }: FeedbackRowProps) {
  const router = useRouter();
  const Icon = categoryIcons[feedback.category];

  const handleRowClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("[role='menu']")) {
      return;
    }
    router.push(`/apps/${appId}/feedback/${feedback.id}`);
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
        <div className={cn(
          "p-2 rounded-lg shrink-0",
          feedback.category === "bug" && "bg-red-500/10",
          feedback.category === "feature" && "bg-violet-500/10",
          feedback.category === "general" && "bg-blue-500/10"
        )}>
          <Icon className={cn(
            "h-5 w-5",
            feedback.category === "bug" && "text-red-500",
            feedback.category === "feature" && "text-violet-500",
            feedback.category === "general" && "text-blue-500"
          )} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Badge className={categoryColors[feedback.category]}>
              {feedback.category === "bug" ? "Bug Report" :
               feedback.category === "feature" ? "Feature Request" : "General"}
            </Badge>
            <Badge className={statusColors[feedback.status]}>
              {statusLabels[feedback.status]}
            </Badge>
            <span className="text-xs text-[hsl(var(--foreground-muted))]">
              v{feedback.appVersion}
            </span>
          </div>

          <p className="text-[hsl(var(--foreground))] line-clamp-2 mb-2 group-hover:text-[hsl(var(--primary))] transition-colors">
            {feedback.message}
          </p>

          <div className="flex items-center gap-4 text-sm text-[hsl(var(--foreground-muted))]">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatRelativeTime(feedback.createdAt)}
            </span>
            {feedback.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {feedback.email}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Tag className="h-3.5 w-3.5" />
              {feedback.platform}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-4">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/apps/${appId}/feedback/${feedback.id}`);
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

              {feedback.status !== "open" && (
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                  onSelect={() => onStatusChange("open")}
                  disabled={isUpdating}
                >
                  <Clock className="h-4 w-4 text-amber-500" />
                  Mark as Open
                </DropdownMenu.Item>
              )}

              {feedback.status !== "in_progress" && (
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                  onSelect={() => onStatusChange("in_progress")}
                  disabled={isUpdating}
                >
                  <Loader2 className="h-4 w-4 text-blue-500" />
                  Mark as In Progress
                </DropdownMenu.Item>
              )}

              {feedback.status !== "closed" && (
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                  onSelect={() => onStatusChange("closed")}
                  disabled={isUpdating}
                >
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  Mark as Closed
                </DropdownMenu.Item>
              )}

              <DropdownMenu.Separator className="h-px bg-[hsl(var(--border))] my-1" />

              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-red-500/10 text-[hsl(var(--destructive))]"
                onSelect={onDelete}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  );
}
