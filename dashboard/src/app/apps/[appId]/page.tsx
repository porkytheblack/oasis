"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getApp,
  getReleases,
  createRelease,
  publishRelease,
  archiveRelease,
  deleteRelease,
  getErrorMessage,
} from "@/lib/api";
import type { CreateReleaseRequest, Release } from "@/lib/types";
import { Page } from "@/components/header";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Textarea,
  Label,
  StatusBadge,
  PlatformBadge,
  EmptyState,
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
  Plus,
  Package,
  Send,
  Archive,
  Trash2,
  MoreVertical,
} from "lucide-react";
import { formatRelativeTime, isValidSemver } from "@/lib/utils";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export default function AppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const appId = params.appId as string;

  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [formData, setFormData] = React.useState<CreateReleaseRequest>({
    version: "",
    notes: "",
  });
  const [versionError, setVersionError] = React.useState<string | null>(null);

  const { data: app, isLoading: appLoading, error: appError } = useQuery({
    queryKey: ["app", appId],
    queryFn: () => getApp(appId),
  });

  const { data: releases = [], isLoading: releasesLoading, error: releasesError } = useQuery({
    queryKey: ["releases", appId],
    queryFn: () => getReleases(appId),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateReleaseRequest) => createRelease(appId, data),
    onSuccess: (newRelease) => {
      queryClient.invalidateQueries({ queryKey: ["releases", appId] });
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      toast.success("Release created", `Version ${newRelease.version} has been created.`);
      setIsCreateModalOpen(false);
      setFormData({ version: "", notes: "" });
      router.push(`/apps/${appId}/releases/${newRelease.id}`);
    },
    onError: (err) => {
      toast.error("Failed to create release", getErrorMessage(err));
    },
  });

  const publishMutation = useMutation({
    mutationFn: (releaseId: string) => publishRelease(appId, releaseId),
    onSuccess: (release) => {
      queryClient.invalidateQueries({ queryKey: ["releases", appId] });
      toast.success("Release published", `Version ${release.version} is now live.`);
    },
    onError: (err) => {
      toast.error("Failed to publish release", getErrorMessage(err));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (releaseId: string) => archiveRelease(appId, releaseId),
    onSuccess: (release) => {
      queryClient.invalidateQueries({ queryKey: ["releases", appId] });
      toast.success("Release archived", `Version ${release.version} has been archived.`);
    },
    onError: (err) => {
      toast.error("Failed to archive release", getErrorMessage(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (releaseId: string) => deleteRelease(appId, releaseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["releases", appId] });
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      toast.success("Release deleted", "The release has been deleted.");
    },
    onError: (err) => {
      toast.error("Failed to delete release", getErrorMessage(err));
    },
  });

  const handleVersionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const version = e.target.value;
    setFormData((prev) => ({ ...prev, version }));
    if (version && !isValidSemver(version)) {
      setVersionError("Please use semantic versioning (e.g., 1.0.0)");
    } else {
      setVersionError(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.version.trim()) {
      toast.error("Validation error", "Version is required.");
      return;
    }
    if (!isValidSemver(formData.version)) {
      toast.error("Validation error", "Please use semantic versioning.");
      return;
    }
    createMutation.mutate(formData);
  };

  if (appLoading || releasesLoading) {
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
      title={app.name}
      description={app.description || `Manage releases for ${app.slug}`}
      currentAppId={appId}
      breadcrumbs={[
        { label: "Apps", href: "/apps" },
        { label: app.name },
      ]}
      actions={
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Release
        </Button>
      }
    >
      {/* App Info Card */}
      <Card className="mb-6">
        <CardContent className="p-6">
          {(() => {
            const publishedReleases = releases.filter(r => r.status === "published");
            const latestPublished = publishedReleases.sort((a, b) =>
              new Date(b.pubDate || b.createdAt).getTime() - new Date(a.pubDate || a.createdAt).getTime()
            )[0];
            return (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <div>
                  <p className="text-sm text-[hsl(var(--foreground-muted))] mb-1">Slug</p>
                  <p className="font-mono text-[hsl(var(--foreground))]">{app.slug}</p>
                </div>
                <div>
                  <p className="text-sm text-[hsl(var(--foreground-muted))] mb-1">Published</p>
                  <p className="text-[hsl(var(--foreground))]">{publishedReleases.length}</p>
                </div>
                <div>
                  <p className="text-sm text-[hsl(var(--foreground-muted))] mb-1">Total Releases</p>
                  <p className="text-[hsl(var(--foreground))]">{releases.length}</p>
                </div>
                <div>
                  <p className="text-sm text-[hsl(var(--foreground-muted))] mb-1">Latest Version</p>
                  <p className="text-[hsl(var(--foreground))]">
                    {latestPublished ? `v${latestPublished.version}` : "No published releases"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[hsl(var(--foreground-muted))] mb-1">Update Endpoint</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-[hsl(var(--foreground))] bg-[hsl(var(--muted))] px-2 py-1 rounded">
                      /{app.slug}/update/&#123;target&#125;/&#123;current_version&#125;
                    </code>
                  </div>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Releases List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-[hsl(var(--primary))]" />
            Releases
          </CardTitle>
          <CardDescription>
            Manage versions and artifacts for {app.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {releasesError ? (
            <p className="text-[hsl(var(--destructive))] py-4">
              Failed to load releases: {getErrorMessage(releasesError)}
            </p>
          ) : releases.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No releases yet"
              description="Create your first release to start distributing updates."
              action={
                <Button onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Release
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {releases.map((release) => (
                <ReleaseRow
                  key={release.id}
                  release={release}
                  appId={appId}
                  onPublish={() => publishMutation.mutate(release.id)}
                  onArchive={() => archiveMutation.mutate(release.id)}
                  onDelete={() => deleteMutation.mutate(release.id)}
                  isPublishing={publishMutation.isPending}
                  isArchiving={archiveMutation.isPending}
                  isDeleting={deleteMutation.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Release Modal */}
      <Modal open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <ModalContent>
          <form onSubmit={handleSubmit}>
            <ModalHeader>
              <ModalTitle>Create New Release</ModalTitle>
              <ModalDescription>
                Create a new version of {app.name}. You can add artifacts after
                creating the release.
              </ModalDescription>
            </ModalHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="version" required>
                  Version
                </Label>
                <Input
                  id="version"
                  placeholder="1.0.0"
                  value={formData.version}
                  onChange={handleVersionChange}
                  error={versionError || undefined}
                  className="font-mono"
                  autoFocus
                />
                <p className="text-xs text-[hsl(var(--foreground-muted))]">
                  Use semantic versioning (e.g., 1.0.0, 2.1.0-beta.1)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Release Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="What's new in this release..."
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  rows={5}
                />
                <p className="text-xs text-[hsl(var(--foreground-muted))]">
                  Supports Markdown formatting.
                </p>
              </div>
            </div>

            <ModalFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={createMutation.isPending}
                disabled={!formData.version.trim() || !!versionError}
              >
                Create Release
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </Page>
  );
}

interface ReleaseRowProps {
  release: Release;
  appId: string;
  onPublish: () => void;
  onArchive: () => void;
  onDelete: () => void;
  isPublishing: boolean;
  isArchiving: boolean;
  isDeleting: boolean;
}

function ReleaseRow({
  release,
  appId,
  onPublish,
  onArchive,
  onDelete,
  isPublishing,
  isArchiving,
  isDeleting,
}: ReleaseRowProps) {
  const router = useRouter();
  const platforms = release.artifacts?.map((a) => a.platform) || [];
  const uniquePlatforms = [...new Set(platforms)];

  const handleRowClick = (e: React.MouseEvent) => {
    // Prevent navigation when clicking on buttons or dropdown
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("[role='menu']")) {
      return;
    }
    router.push(`/apps/${appId}/releases/${release.id}`);
  };

  return (
    <div
      onClick={handleRowClick}
      className={cn(
        "flex items-center justify-between p-4 rounded-lg border border-[hsl(var(--border))]",
        "cursor-pointer hover:bg-[hsl(var(--muted))]/50 hover:border-[hsl(var(--primary))]/30",
        "transition-all duration-150 group"
      )}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-lg font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors">
              v{release.version}
            </span>
            <StatusBadge status={release.status} />
          </div>
          <div className="flex items-center gap-4 text-sm text-[hsl(var(--foreground-muted))]">
            <span>{formatRelativeTime(release.createdAt)}</span>
            {release.artifactCount !== undefined && (
              <span>{release.artifactCount} artifact{release.artifactCount !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>

        {uniquePlatforms.length > 0 && (
          <div className="flex gap-2">
            {uniquePlatforms.slice(0, 3).map((platform) => (
              <PlatformBadge key={platform} platform={platform} />
            ))}
            {uniquePlatforms.length > 3 && (
              <span className="text-xs text-[hsl(var(--foreground-muted))]">
                +{uniquePlatforms.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 ml-4">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/apps/${appId}/releases/${release.id}`);
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
                "z-50 min-w-[160px] overflow-hidden rounded-lg",
                "bg-[hsl(var(--card))] border border-[hsl(var(--border))]",
                "shadow-lg p-1",
                "animate-scale-up"
              )}
              align="end"
              sideOffset={5}
            >
              {release.status === "draft" && (
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                  onSelect={onPublish}
                  disabled={isPublishing}
                >
                  <Send className="h-4 w-4 text-emerald-500" />
                  {isPublishing ? "Publishing..." : "Publish"}
                </DropdownMenu.Item>
              )}

              {release.status === "published" && (
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                  onSelect={onArchive}
                  disabled={isArchiving}
                >
                  <Archive className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
                  {isArchiving ? "Archiving..." : "Archive"}
                </DropdownMenu.Item>
              )}

              {release.status === "draft" && (
                <>
                  <DropdownMenu.Separator className="h-px bg-[hsl(var(--border))] my-1" />
                  <DropdownMenu.Item
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-md outline-none hover:bg-red-500/10 text-[hsl(var(--destructive))]"
                    onSelect={onDelete}
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-4 w-4" />
                    {isDeleting ? "Deleting..." : "Delete"}
                  </DropdownMenu.Item>
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  );
}
