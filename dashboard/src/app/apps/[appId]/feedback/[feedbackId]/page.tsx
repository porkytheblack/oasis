"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getApp,
  getFeedbackById,
  updateFeedback,
  deleteFeedback,
  getErrorMessage,
} from "@/lib/api";
import type { FeedbackCategory, FeedbackStatus, UpdateFeedbackRequest } from "@/lib/types";
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
  PageSpinner,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import {
  Bug,
  Lightbulb,
  MessageCircle,
  ArrowLeft,
  Mail,
  Clock,
  Tag,
  Monitor,
  Smartphone,
  Globe,
  Save,
  Trash2,
  CheckCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { formatRelativeTime, cn } from "@/lib/utils";
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

export default function FeedbackDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const appId = params.appId as string;
  const feedbackId = params.feedbackId as string;

  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [internalNotes, setInternalNotes] = React.useState("");
  const [selectedStatus, setSelectedStatus] = React.useState<FeedbackStatus | null>(null);
  const [hasChanges, setHasChanges] = React.useState(false);

  const { data: app, isLoading: appLoading, error: appError } = useQuery({
    queryKey: ["app", appId],
    queryFn: () => getApp(appId),
  });

  const { data: feedback, isLoading: feedbackLoading, error: feedbackError } = useQuery({
    queryKey: ["feedback-detail", appId, feedbackId],
    queryFn: () => getFeedbackById(appId, feedbackId),
  });

  // Initialize local state when feedback loads
  React.useEffect(() => {
    if (feedback) {
      setInternalNotes(feedback.internalNotes ?? "");
      setSelectedStatus(feedback.status);
    }
  }, [feedback]);

  // Track changes
  React.useEffect(() => {
    if (feedback) {
      const notesChanged = internalNotes !== (feedback.internalNotes ?? "");
      const statusChanged = selectedStatus !== null && selectedStatus !== feedback.status;
      setHasChanges(notesChanged || statusChanged);
    }
  }, [feedback, internalNotes, selectedStatus]);

  const updateMutation = useMutation({
    mutationFn: (data: UpdateFeedbackRequest) =>
      updateFeedback(appId, feedbackId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback-detail", appId, feedbackId] });
      queryClient.invalidateQueries({ queryKey: ["feedback", appId] });
      queryClient.invalidateQueries({ queryKey: ["feedback-stats", appId] });
      toast.success("Feedback updated", "Changes have been saved.");
      setHasChanges(false);
    },
    onError: (err) => {
      toast.error("Failed to update feedback", getErrorMessage(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteFeedback(appId, feedbackId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback", appId] });
      queryClient.invalidateQueries({ queryKey: ["feedback-stats", appId] });
      toast.success("Feedback deleted", "The feedback has been deleted.");
      router.push(`/apps/${appId}/feedback`);
    },
    onError: (err) => {
      toast.error("Failed to delete feedback", getErrorMessage(err));
    },
  });

  const handleSave = () => {
    const updates: UpdateFeedbackRequest = {};
    if (selectedStatus && selectedStatus !== feedback?.status) {
      updates.status = selectedStatus;
    }
    if (internalNotes !== (feedback?.internalNotes ?? "")) {
      updates.internalNotes = internalNotes || null;
    }
    updateMutation.mutate(updates);
  };

  if (appLoading || feedbackLoading) {
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

  if (feedbackError || !feedback) {
    return (
      <Page
        title="Feedback Not Found"
        breadcrumbs={[
          { label: "Apps", href: "/apps" },
          { label: app.name, href: `/apps/${appId}` },
          { label: "Feedback", href: `/apps/${appId}/feedback` },
          { label: "Not Found" },
        ]}
      >
        <Card>
          <CardContent className="p-6">
            <p className="text-[hsl(var(--destructive))]">
              {feedbackError ? getErrorMessage(feedbackError) : "Feedback not found."}
            </p>
          </CardContent>
        </Card>
      </Page>
    );
  }

  const Icon = categoryIcons[feedback.category];
  const deviceInfo = feedback.deviceInfo;

  return (
    <Page
      title="Feedback Details"
      description={`View and manage feedback`}
      currentAppId={appId}
      breadcrumbs={[
        { label: "Apps", href: "/apps" },
        { label: app.name, href: `/apps/${appId}` },
        { label: "Feedback", href: `/apps/${appId}/feedback` },
        { label: "Details" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/apps/${appId}/feedback`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
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
          {/* Feedback Message */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-lg",
                    feedback.category === "bug" && "bg-red-500/10",
                    feedback.category === "feature" && "bg-violet-500/10",
                    feedback.category === "general" && "bg-blue-500/10"
                  )}>
                    <Icon className={cn(
                      "h-6 w-6",
                      feedback.category === "bug" && "text-red-500",
                      feedback.category === "feature" && "text-violet-500",
                      feedback.category === "general" && "text-blue-500"
                    )} />
                  </div>
                  <div>
                    <CardTitle>
                      {feedback.category === "bug" ? "Bug Report" :
                       feedback.category === "feature" ? "Feature Request" : "General Feedback"}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Clock className="h-3.5 w-3.5" />
                      Submitted {formatRelativeTime(feedback.createdAt)}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={categoryColors[feedback.category]}>
                    {feedback.category}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="prose prose-invert max-w-none">
                <p className="text-[hsl(var(--foreground))] whitespace-pre-wrap leading-relaxed">
                  {feedback.message}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Device Information */}
          {deviceInfo && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-[hsl(var(--primary))]" />
                  Device Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {deviceInfo.userAgent && (
                    <div className="col-span-2 md:col-span-3">
                      <p className="text-sm text-[hsl(var(--foreground-muted))] mb-1">User Agent</p>
                      <p className="text-[hsl(var(--foreground))] font-mono text-xs break-all bg-[hsl(var(--muted))] p-2 rounded">
                        {deviceInfo.userAgent}
                      </p>
                    </div>
                  )}
                  {deviceInfo.screenWidth && deviceInfo.screenHeight && (
                    <div>
                      <p className="text-sm text-[hsl(var(--foreground-muted))] mb-1">Screen Size</p>
                      <p className="text-[hsl(var(--foreground))]">
                        {deviceInfo.screenWidth} x {deviceInfo.screenHeight}
                        {deviceInfo.pixelRatio && ` @${deviceInfo.pixelRatio}x`}
                      </p>
                    </div>
                  )}
                  {deviceInfo.cpuCores && (
                    <div>
                      <p className="text-sm text-[hsl(var(--foreground-muted))] mb-1">CPU Cores</p>
                      <p className="text-[hsl(var(--foreground))]">{deviceInfo.cpuCores}</p>
                    </div>
                  )}
                  {deviceInfo.memoryTotal && (
                    <div>
                      <p className="text-sm text-[hsl(var(--foreground-muted))] mb-1">Memory</p>
                      <p className="text-[hsl(var(--foreground))]">
                        {(deviceInfo.memoryTotal / (1024 * 1024 * 1024)).toFixed(1)} GB
                      </p>
                    </div>
                  )}
                  {deviceInfo.locale && (
                    <div>
                      <p className="text-sm text-[hsl(var(--foreground-muted))] mb-1">Locale</p>
                      <p className="text-[hsl(var(--foreground))]">{deviceInfo.locale}</p>
                    </div>
                  )}
                  {deviceInfo.timezone && (
                    <div>
                      <p className="text-sm text-[hsl(var(--foreground-muted))] mb-1">Timezone</p>
                      <p className="text-[hsl(var(--foreground))]">{deviceInfo.timezone}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Internal Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Internal Notes</CardTitle>
              <CardDescription>
                Add private notes for your team (not visible to the user)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Add notes about this feedback..."
                rows={5}
              />
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
                  value={selectedStatus ?? feedback.status}
                  onValueChange={(value) => setSelectedStatus(value as FeedbackStatus)}
                >
                  <Select.Trigger className="w-full inline-flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]">
                    <Select.Value />
                    <Select.Icon>
                      <ChevronDown className="h-4 w-4" />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg">
                      <Select.Viewport className="p-1">
                        <Select.Item value="open" className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                          <Clock className="h-4 w-4 text-amber-500" />
                          <Select.ItemText>Open</Select.ItemText>
                        </Select.Item>
                        <Select.Item value="in_progress" className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                          <Loader2 className="h-4 w-4 text-blue-500" />
                          <Select.ItemText>In Progress</Select.ItemText>
                        </Select.Item>
                        <Select.Item value="closed" className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                          <CheckCircle className="h-4 w-4 text-emerald-500" />
                          <Select.ItemText>Closed</Select.ItemText>
                        </Select.Item>
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>

              <div className="pt-2">
                <Badge className={cn("w-full justify-center py-1.5", statusColors[selectedStatus ?? feedback.status])}>
                  {statusLabels[selectedStatus ?? feedback.status]}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Tag className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
                <div>
                  <p className="text-sm text-[hsl(var(--foreground-muted))]">App Version</p>
                  <p className="text-[hsl(var(--foreground))] font-mono">v{feedback.appVersion}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Smartphone className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
                <div>
                  <p className="text-sm text-[hsl(var(--foreground-muted))]">Platform</p>
                  <p className="text-[hsl(var(--foreground))]">{feedback.platform}</p>
                </div>
              </div>

              {feedback.osVersion && (
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
                  <div>
                    <p className="text-sm text-[hsl(var(--foreground-muted))]">OS Version</p>
                    <p className="text-[hsl(var(--foreground))]">{feedback.osVersion}</p>
                  </div>
                </div>
              )}

              {feedback.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
                  <div>
                    <p className="text-sm text-[hsl(var(--foreground-muted))]">Contact Email</p>
                    <a
                      href={`mailto:${feedback.email}`}
                      className="text-[hsl(var(--primary))] hover:underline"
                    >
                      {feedback.email}
                    </a>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
                <div>
                  <p className="text-sm text-[hsl(var(--foreground-muted))]">Submitted</p>
                  <p className="text-[hsl(var(--foreground))]">
                    {new Date(feedback.createdAt).toLocaleDateString()} at{" "}
                    {new Date(feedback.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-red-500/30">
            <CardHeader>
              <CardTitle className="text-[hsl(var(--destructive))]">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setIsDeleteModalOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Feedback
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Delete Feedback</ModalTitle>
            <ModalDescription>
              Are you sure you want to delete this feedback? This action cannot be undone.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              loading={deleteMutation.isPending}
            >
              Delete Feedback
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Page>
  );
}
