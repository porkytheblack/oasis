"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getApp,
  getRelease,
  getArtifacts,
  presignArtifactUpload,
  uploadToPresignedUrl,
  confirmArtifactUpload,
  deleteArtifact,
  getInstallers,
  presignInstallerUpload,
  confirmInstallerUpload,
  deleteInstaller,
  publishRelease,
  archiveRelease,
  updateRelease,
  computeFileHash,
  getErrorMessage,
} from "@/lib/api";
import type {
  Artifact,
  PresignArtifactRequest,
  Installer,
  PresignInstallerRequest,
  InstallerPlatform,
} from "@/lib/types";
import { Page } from "@/components/header";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
  Upload,
  Package,
  Send,
  Archive,
  Trash2,
  FileDown,
  HardDrive,
  Copy,
  Check,
  Edit,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  FileSignature,
  Download,
} from "lucide-react";
import {
  formatFileSize,
  formatDate,
  copyToClipboard,
  cn,
  extractFilename,
  extractHash,
  isValidArtifactFile,
  getValidArtifactTypesDescription,
  sanitizeFilename,
  getContentTypeFromFilename,
  isValidInstallerFile,
  getValidInstallerTypesDescription,
  getInstallerContentType,
  detectPlatformFromFilename,
  formatInstallerPlatform,
} from "@/lib/utils";

interface UploadState {
  file: File;
  platform: string;
  progress: number;
  status: "pending" | "hashing" | "uploading" | "complete" | "error";
  error?: string;
}

interface InstallerUploadState {
  file: File;
  platform: InstallerPlatform;
  displayName: string | null;
  progress: number;
  status: "pending" | "hashing" | "uploading" | "complete" | "error";
  error?: string;
}

export default function ReleaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const appId = params.appId as string;
  const releaseId = params.releaseId as string;

  const [isUploadModalOpen, setIsUploadModalOpen] = React.useState(false);
  const [isEditingNotes, setIsEditingNotes] = React.useState(false);
  const [editedNotes, setEditedNotes] = React.useState("");
  const [uploads, setUploads] = React.useState<UploadState[]>([]);
  const [selectedPlatform, setSelectedPlatform] = React.useState("darwin-aarch64");
  const [replaceExisting, setReplaceExisting] = React.useState(false);
  const [signature, setSignature] = React.useState("");
  const [isSignatureSectionOpen, setIsSignatureSectionOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const sigFileInputRef = React.useRef<HTMLInputElement>(null);

  // Installer upload state
  const [isInstallerUploadModalOpen, setIsInstallerUploadModalOpen] = React.useState(false);
  const [installerUploads, setInstallerUploads] = React.useState<InstallerUploadState[]>([]);
  const [selectedInstallerPlatform, setSelectedInstallerPlatform] = React.useState<InstallerPlatform>("darwin-aarch64");
  const [installerDisplayName, setInstallerDisplayName] = React.useState("");
  const [installerReplaceExisting, setInstallerReplaceExisting] = React.useState(false);
  const installerFileInputRef = React.useRef<HTMLInputElement>(null);

  const { data: app, isLoading: appLoading } = useQuery({
    queryKey: ["app", appId],
    queryFn: () => getApp(appId),
  });

  const { data: release, isLoading: releaseLoading, error: releaseError } = useQuery({
    queryKey: ["release", appId, releaseId],
    queryFn: () => getRelease(appId, releaseId),
  });

  const { data: artifacts = [], isLoading: artifactsLoading } = useQuery({
    queryKey: ["artifacts", appId, releaseId],
    queryFn: () => getArtifacts(appId, releaseId),
  });

  const { data: installers = [], isLoading: installersLoading } = useQuery({
    queryKey: ["installers", appId, releaseId],
    queryFn: () => getInstallers(appId, releaseId),
  });

  const updateMutation = useMutation({
    mutationFn: (notes: string) => updateRelease(appId, releaseId, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["release", appId, releaseId] });
      toast.success("Notes updated", "Release notes have been saved.");
      setIsEditingNotes(false);
    },
    onError: (err) => {
      toast.error("Failed to update notes", getErrorMessage(err));
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => publishRelease(appId, releaseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["release", appId, releaseId] });
      queryClient.invalidateQueries({ queryKey: ["releases", appId] });
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      toast.success("Release published", "This release is now live.");
    },
    onError: (err) => {
      toast.error("Failed to publish", getErrorMessage(err));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveRelease(appId, releaseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["release", appId, releaseId] });
      queryClient.invalidateQueries({ queryKey: ["releases", appId] });
      toast.success("Release archived", "This release is no longer live.");
    },
    onError: (err) => {
      toast.error("Failed to archive", getErrorMessage(err));
    },
  });

  const deleteArtifactMutation = useMutation({
    mutationFn: (artifactId: string) => deleteArtifact(appId, releaseId, artifactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["artifacts", appId, releaseId] });
      toast.success("Artifact deleted", "The artifact has been removed.");
    },
    onError: (err) => {
      toast.error("Failed to delete artifact", getErrorMessage(err));
    },
  });

  const deleteInstallerMutation = useMutation({
    mutationFn: (installerId: string) => deleteInstaller(appId, releaseId, installerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installers", appId, releaseId] });
      toast.success("Installer deleted", "The installer has been removed.");
    },
    onError: (err) => {
      toast.error("Failed to delete installer", getErrorMessage(err));
    },
  });

  /**
   * Reads a .sig file and converts its contents to base64.
   * Handles both binary signature files and already-base64 encoded files.
   */
  const handleSigFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      // Check if the content is already valid base64 text
      // Base64 only contains A-Z, a-z, 0-9, +, /, and = (padding)
      // and optionally whitespace
      const textDecoder = new TextDecoder("utf-8", { fatal: true });
      let isAlreadyBase64 = false;
      let textContent = "";

      try {
        textContent = textDecoder.decode(bytes).trim();
        // Check if it looks like base64 (only valid base64 characters)
        const base64Regex = /^[A-Za-z0-9+/=\s]+$/;
        if (base64Regex.test(textContent)) {
          // Try to decode it to verify it's valid base64
          try {
            atob(textContent.replace(/\s/g, ""));
            isAlreadyBase64 = true;
          } catch {
            // Not valid base64, treat as binary
            isAlreadyBase64 = false;
          }
        }
      } catch {
        // Failed to decode as UTF-8, definitely binary
        isAlreadyBase64 = false;
      }

      if (isAlreadyBase64) {
        // Already base64, remove any whitespace and use as-is
        setSignature(textContent.replace(/\s/g, ""));
      } else {
        // Binary content, convert to base64
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        setSignature(base64);
      }

      toast.success("Signature loaded", `Loaded signature from ${file.name}`);
    } catch (err) {
      toast.error("Failed to read signature file", getErrorMessage(err));
    }

    // Reset file input
    if (sigFileInputRef.current) {
      sigFileInputRef.current.value = "";
    }
  };

  /**
   * Resets the upload modal state when closing.
   */
  const handleCloseUploadModal = () => {
    setIsUploadModalOpen(false);
    setSignature("");
    setIsSignatureSectionOpen(false);
    setReplaceExisting(false);
  };

  /**
   * Resets the installer upload modal state when closing.
   */
  const handleCloseInstallerUploadModal = () => {
    setIsInstallerUploadModalOpen(false);
    setInstallerDisplayName("");
    setInstallerReplaceExisting(false);
  };

  /**
   * Handles installer file selection and initiates the upload process.
   */
  const handleInstallerFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate file type
    if (!isValidInstallerFile(file.name)) {
      toast.error(
        "Invalid file type",
        `Please select a valid installer file. Supported types: ${getValidInstallerTypesDescription()}`
      );
      if (installerFileInputRef.current) {
        installerFileInputRef.current.value = "";
      }
      return;
    }

    // Capture current state values before async operations
    const currentPlatform = selectedInstallerPlatform;
    const currentDisplayName = installerDisplayName.trim() || null;
    const currentReplaceExisting = installerReplaceExisting;

    // Sanitize filename to comply with server requirements
    const sanitizedFilename = sanitizeFilename(file.name);

    // Determine content type from filename
    const contentType = getInstallerContentType(file.name);

    const newUpload: InstallerUploadState = {
      file,
      platform: currentPlatform,
      displayName: currentDisplayName,
      progress: 0,
      status: "pending",
    };

    // Add upload to the list first for visual feedback
    setInstallerUploads((prev) => [...prev, newUpload]);

    // Keep modal open briefly to show upload has started, then close and reset state
    setTimeout(() => {
      setIsInstallerUploadModalOpen(false);
      // Reset modal state for next upload
      setInstallerReplaceExisting(false);
      setInstallerDisplayName("");
    }, 500);

    try {
      // Update status to hashing
      setInstallerUploads((prev) =>
        prev.map((u) =>
          u.file === file ? { ...u, status: "hashing" as const } : u
        )
      );

      // Compute file hash for later confirmation
      const sha256 = await computeFileHash(file);

      // Step 1: Get presigned URL for upload
      const presignData: PresignInstallerRequest = {
        platform: currentPlatform,
        filename: sanitizedFilename,
        contentType,
        fileSize: file.size,
        displayName: currentDisplayName || undefined,
        replaceExisting: currentReplaceExisting,
      };

      let presignedResponse;
      try {
        presignedResponse = await presignInstallerUpload(appId, releaseId, presignData);
      } catch (presignError) {
        // Check for R2 configuration errors and provide helpful message
        const errorMessage = getErrorMessage(presignError);
        if (
          errorMessage.toLowerCase().includes("r2") ||
          errorMessage.toLowerCase().includes("storage") ||
          errorMessage.toLowerCase().includes("not configured") ||
          errorMessage.toLowerCase().includes("presign")
        ) {
          throw new Error(
            "Cloud storage (R2) is not configured on the server. " +
            "Please configure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, " +
            "and R2_BUCKET_NAME environment variables on the server."
          );
        }
        // Check for platform conflict error and provide helpful message
        if (errorMessage.toLowerCase().includes("already exists")) {
          throw new Error(
            `An installer for platform '${formatInstallerPlatform(currentPlatform)}' already exists. ` +
            "Enable 'Replace existing installer' option to overwrite it."
          );
        }
        throw presignError;
      }

      // Update status to uploading
      setInstallerUploads((prev) =>
        prev.map((u) =>
          u.file === file ? { ...u, status: "uploading" as const } : u
        )
      );

      // Step 2: Upload file directly to R2 using presigned URL
      await uploadToPresignedUrl(
        presignedResponse.presignedUrl,
        file,
        contentType,
        (progress) => {
          setInstallerUploads((prev) =>
            prev.map((u) => (u.file === file ? { ...u, progress } : u))
          );
        }
      );

      // Step 3: Confirm the upload with the server
      await confirmInstallerUpload(appId, releaseId, presignedResponse.installerId, {
        checksum: `sha256:${sha256}`,
      });

      // Mark as complete
      setInstallerUploads((prev) =>
        prev.map((u) =>
          u.file === file ? { ...u, status: "complete" as const, progress: 100 } : u
        )
      );

      // Refresh installers list
      queryClient.invalidateQueries({ queryKey: ["installers", appId, releaseId] });
      toast.success("Upload complete", `${file.name} has been uploaded.`);

      // Clear completed upload after delay
      setTimeout(() => {
        setInstallerUploads((prev) => prev.filter((u) => u.file !== file));
      }, 3000);
    } catch (err) {
      setInstallerUploads((prev) =>
        prev.map((u) =>
          u.file === file
            ? { ...u, status: "error" as const, error: getErrorMessage(err) }
            : u
        )
      );
      toast.error("Upload failed", getErrorMessage(err));
    }

    // Reset file input
    if (installerFileInputRef.current) {
      installerFileInputRef.current.value = "";
    }
  };

  /**
   * Handles installer file selection from the file input.
   * Detects platform from filename if possible and updates the selection.
   */
  const handleInstallerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Try to detect platform from filename
    const detectedPlatform = detectPlatformFromFilename(file.name);
    if (detectedPlatform) {
      setSelectedInstallerPlatform(detectedPlatform as InstallerPlatform);
    }

    // Now proceed with the actual upload
    handleInstallerFileSelect(e);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate file type
    if (!isValidArtifactFile(file.name)) {
      toast.error(
        "Invalid file type",
        `Please select a valid Tauri artifact file. Supported types: ${getValidArtifactTypesDescription()}`
      );
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    // Capture current state values before async operations
    const currentPlatform = selectedPlatform;
    const currentReplaceExisting = replaceExisting;
    const currentSignature = signature;

    // Sanitize filename to comply with server requirements (no spaces, special chars)
    const sanitizedFilename = sanitizeFilename(file.name);

    // Determine content type from filename (more reliable than browser's file.type)
    const contentType = getContentTypeFromFilename(file.name);

    const newUpload: UploadState = {
      file,
      platform: currentPlatform,
      progress: 0,
      status: "pending",
    };

    // Add upload to the list first for visual feedback
    setUploads((prev) => [...prev, newUpload]);

    // Keep modal open briefly to show upload has started, then close and reset state
    setTimeout(() => {
      setIsUploadModalOpen(false);
      // Reset modal state for next upload
      setReplaceExisting(false);
      setSignature("");
      setIsSignatureSectionOpen(false);
    }, 500);

    try {
      // Update status to hashing
      setUploads((prev) =>
        prev.map((u) =>
          u.file === file ? { ...u, status: "hashing" as const } : u
        )
      );

      // Compute file hash for later confirmation
      const sha256 = await computeFileHash(file);

      // Step 1: Get presigned URL for upload
      const presignData: PresignArtifactRequest = {
        platform: currentPlatform,
        filename: sanitizedFilename,
        contentType,
        replaceExisting: currentReplaceExisting,
      };

      let presignedResponse;
      try {
        presignedResponse = await presignArtifactUpload(appId, releaseId, presignData);
      } catch (presignError) {
        // Check for R2 configuration errors and provide helpful message
        const errorMessage = getErrorMessage(presignError);
        if (
          errorMessage.toLowerCase().includes("r2") ||
          errorMessage.toLowerCase().includes("storage") ||
          errorMessage.toLowerCase().includes("not configured") ||
          errorMessage.toLowerCase().includes("presign")
        ) {
          throw new Error(
            "Cloud storage (R2) is not configured on the server. " +
            "Please configure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, " +
            "and R2_BUCKET_NAME environment variables on the server."
          );
        }
        // Check for platform conflict error and provide helpful message
        if (errorMessage.toLowerCase().includes("already exists")) {
          throw new Error(
            `An artifact for platform '${currentPlatform}' already exists. ` +
            "Enable 'Replace existing artifact' option to overwrite it."
          );
        }
        throw presignError;
      }

      // Update status to uploading
      setUploads((prev) =>
        prev.map((u) =>
          u.file === file ? { ...u, status: "uploading" as const } : u
        )
      );

      // Step 2: Upload file directly to R2 using presigned URL
      // IMPORTANT: Content-Type must match what was used during presigning
      await uploadToPresignedUrl(
        presignedResponse.presignedUrl,
        file,
        contentType,
        (progress) => {
          setUploads((prev) =>
            prev.map((u) => (u.file === file ? { ...u, progress } : u))
          );
        }
      );

      // Step 3: Confirm the upload with the server
      // Include signature if provided by the user
      const confirmData: { checksum: string; signature?: string } = {
        checksum: `sha256:${sha256}`,
      };
      if (currentSignature) {
        confirmData.signature = currentSignature;
      }
      await confirmArtifactUpload(appId, releaseId, presignedResponse.artifactId, confirmData);

      // Mark as complete
      setUploads((prev) =>
        prev.map((u) =>
          u.file === file ? { ...u, status: "complete" as const, progress: 100 } : u
        )
      );

      // Refresh artifacts list
      queryClient.invalidateQueries({ queryKey: ["artifacts", appId, releaseId] });
      toast.success("Upload complete", `${file.name} has been uploaded.`);

      // Clear completed upload after delay
      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => u.file !== file));
      }, 3000);
    } catch (err) {
      setUploads((prev) =>
        prev.map((u) =>
          u.file === file
            ? { ...u, status: "error" as const, error: getErrorMessage(err) }
            : u
        )
      );
      toast.error("Upload failed", getErrorMessage(err));
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleEditNotes = () => {
    setEditedNotes(release?.notes || "");
    setIsEditingNotes(true);
  };

  const handleSaveNotes = () => {
    updateMutation.mutate(editedNotes);
  };

  if (appLoading || releaseLoading) {
    return (
      <Page title="Loading...">
        <PageSpinner />
      </Page>
    );
  }

  if (releaseError || !release) {
    return (
      <Page
        title="Release Not Found"
        breadcrumbs={[
          { label: "Apps", href: "/apps" },
          { label: "Not Found" },
        ]}
      >
        <Card>
          <CardContent className="p-6">
            <p className="text-[hsl(var(--destructive))]">
              {releaseError ? getErrorMessage(releaseError) : "Release not found."}
            </p>
          </CardContent>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title={`v${release.version}`}
      description={`Release details for ${app?.name || "Application"}`}
      currentAppId={appId}
      breadcrumbs={[
        { label: "Apps", href: "/apps" },
        { label: app?.name || "App", href: `/apps/${appId}` },
        { label: `v${release.version}` },
      ]}
      actions={
        <div className="flex items-center gap-2">
          {release.status === "draft" && (
            <Button
              onClick={() => publishMutation.mutate()}
              loading={publishMutation.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              Publish
            </Button>
          )}
          {release.status === "published" && (
            <Button
              variant="outline"
              onClick={() => archiveMutation.mutate()}
              loading={archiveMutation.isPending}
            >
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </Button>
          )}
        </div>
      }
    >
      {/* Upload Progress */}
      {uploads.length > 0 && (
        <div className="mb-6 space-y-3">
          {uploads.map((upload, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <Upload className="h-5 w-5 text-[hsl(var(--primary))]" />
                    <div>
                      <p className="font-medium text-[hsl(var(--foreground))]">
                        {upload.file.name}
                      </p>
                      <p className="text-xs text-[hsl(var(--foreground-muted))]">
                        {upload.status === "hashing" && "Computing file hash..."}
                        {upload.status === "uploading" && `Uploading... ${upload.progress}%`}
                        {upload.status === "complete" && "Upload complete"}
                        {upload.status === "error" && upload.error}
                      </p>
                    </div>
                  </div>
                  <PlatformBadge platform={upload.platform} />
                </div>
                {(upload.status === "hashing" || upload.status === "uploading") && (
                  <div className="w-full h-2 bg-[hsl(var(--muted))] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[hsl(var(--primary))] transition-all duration-300"
                      style={{
                        width: upload.status === "hashing" ? "10%" : `${upload.progress}%`,
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Release Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Release Information</CardTitle>
              <StatusBadge status={release.status} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-sm text-[hsl(var(--foreground-muted))] mb-1">Version</p>
                <p className="font-mono text-[hsl(var(--foreground))]">v{release.version}</p>
              </div>
              <div>
                <p className="text-sm text-[hsl(var(--foreground-muted))] mb-1">Created</p>
                <p className="text-[hsl(var(--foreground))]">{formatDate(release.createdAt)}</p>
              </div>
              {release.pubDate && (
                <div>
                  <p className="text-sm text-[hsl(var(--foreground-muted))] mb-1">Published</p>
                  <p className="text-[hsl(var(--foreground))]">{formatDate(release.pubDate)}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-[hsl(var(--foreground-muted))] mb-1">Artifacts</p>
                <p className="text-[hsl(var(--foreground))]">{artifacts.length}</p>
              </div>
            </div>

            {/* Release Notes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Release Notes</Label>
                {!isEditingNotes && release.status === "draft" && (
                  <Button variant="ghost" size="sm" onClick={handleEditNotes}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
              {isEditingNotes ? (
                <div className="space-y-3">
                  <Textarea
                    value={editedNotes}
                    onChange={(e) => setEditedNotes(e.target.value)}
                    rows={8}
                    placeholder="What's new in this release..."
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingNotes(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveNotes}
                      loading={updateMutation.isPending}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-[hsl(var(--muted))] min-h-[100px]">
                  {release.notes ? (
                    <div className="prose prose-sm prose-invert max-w-none">
                      <pre className="whitespace-pre-wrap font-sans text-sm text-[hsl(var(--foreground))]">
                        {release.notes}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-sm text-[hsl(var(--foreground-muted))] italic">
                      No release notes provided.
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {release.status === "draft" && (
              <>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => setIsUploadModalOpen(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Artifact
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => setIsInstallerUploadModalOpen(true)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Upload Installer
                </Button>
              </>
            )}
            <Button
              className="w-full justify-start"
              variant="outline"
              onClick={() => router.push(`/apps/${appId}`)}
            >
              <Package className="h-4 w-4 mr-2" />
              View All Releases
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Artifacts List */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-[hsl(var(--primary))]" />
                Artifacts
              </CardTitle>
              <CardDescription>
                Platform-specific binaries for this release
              </CardDescription>
            </div>
            {release.status === "draft" && (
              <Button onClick={() => setIsUploadModalOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {artifactsLoading ? (
            <div className="py-8 text-center text-[hsl(var(--foreground-muted))]">
              Loading artifacts...
            </div>
          ) : artifacts.length === 0 ? (
            <EmptyState
              icon={HardDrive}
              title="No artifacts yet"
              description="Upload platform-specific binaries for this release."
              action={
                release.status === "draft" ? (
                  <Button onClick={() => setIsUploadModalOpen(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Artifact
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              {artifacts.map((artifact) => (
                <ArtifactRow
                  key={artifact.id}
                  artifact={artifact}
                  canDelete={release.status === "draft"}
                  onDelete={() => deleteArtifactMutation.mutate(artifact.id)}
                  isDeleting={deleteArtifactMutation.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Installer Upload Progress */}
      {installerUploads.length > 0 && (
        <div className="mb-6 space-y-3">
          {installerUploads.map((upload, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <Download className="h-5 w-5 text-[hsl(var(--primary))]" />
                    <div>
                      <p className="font-medium text-[hsl(var(--foreground))]">
                        {upload.file.name}
                      </p>
                      <p className="text-xs text-[hsl(var(--foreground-muted))]">
                        {upload.status === "hashing" && "Computing file hash..."}
                        {upload.status === "uploading" && `Uploading installer... ${upload.progress}%`}
                        {upload.status === "complete" && "Upload complete"}
                        {upload.status === "error" && upload.error}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-md bg-[hsl(var(--muted))] text-[hsl(var(--foreground-muted))]">
                    {formatInstallerPlatform(upload.platform)}
                  </span>
                </div>
                {(upload.status === "hashing" || upload.status === "uploading") && (
                  <div className="w-full h-2 bg-[hsl(var(--muted))] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[hsl(var(--primary))] transition-all duration-300"
                      style={{
                        width: upload.status === "hashing" ? "10%" : `${upload.progress}%`,
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Installers List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5 text-[hsl(var(--primary))]" />
                Installers
              </CardTitle>
              <CardDescription>
                Downloadable installation packages for end users
              </CardDescription>
            </div>
            {release.status === "draft" && (
              <Button onClick={() => setIsInstallerUploadModalOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {installersLoading ? (
            <div className="py-8 text-center text-[hsl(var(--foreground-muted))]">
              Loading installers...
            </div>
          ) : installers.length === 0 ? (
            <EmptyState
              icon={Download}
              title="No installers yet"
              description="Upload installer packages (.dmg, .exe, .msi, etc.) for users to download."
              action={
                release.status === "draft" ? (
                  <Button onClick={() => setIsInstallerUploadModalOpen(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Installer
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              {installers.map((installer) => (
                <InstallerRow
                  key={installer.id}
                  installer={installer}
                  canDelete={release.status === "draft"}
                  onDelete={() => deleteInstallerMutation.mutate(installer.id)}
                  isDeleting={deleteInstallerMutation.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Modal */}
      <Modal open={isUploadModalOpen} onOpenChange={(open) => {
        if (!open) {
          handleCloseUploadModal();
        } else {
          setIsUploadModalOpen(true);
        }
      }}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Upload Artifact</ModalTitle>
            <ModalDescription>
              Select the target platform and choose a file to upload.
            </ModalDescription>
          </ModalHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Target Platform</Label>
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
                className={cn(
                  "w-full h-10 rounded-md px-3 cursor-pointer",
                  "bg-[hsl(var(--input))] border border-[hsl(var(--border))]",
                  "text-sm text-[hsl(var(--foreground))]",
                  "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                )}
              >
                <optgroup label="macOS">
                  <option value="darwin-aarch64">macOS (Apple Silicon)</option>
                  <option value="darwin-x86_64">macOS (Intel)</option>
                </optgroup>
                <optgroup label="Windows">
                  <option value="windows-x86_64">Windows (64-bit)</option>
                  <option value="windows-x86">Windows (32-bit)</option>
                </optgroup>
                <optgroup label="Linux">
                  <option value="linux-x86_64">Linux (64-bit)</option>
                  <option value="linux-aarch64">Linux (ARM64)</option>
                </optgroup>
              </select>
            </div>

            <div className="space-y-2">
              <Label>File</Label>
              <div
                className={cn(
                  "border-2 border-dashed border-[hsl(var(--border))] rounded-lg p-8",
                  "flex flex-col items-center justify-center gap-4",
                  "hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))]/50",
                  "transition-colors cursor-pointer"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-10 w-10 text-[hsl(var(--foreground-muted))]" />
                <div className="text-center">
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                    Click to select file
                  </p>
                  <p className="text-xs text-[hsl(var(--foreground-muted))]">
                    or drag and drop
                  </p>
                </div>
              </div>
              <p className="text-xs text-[hsl(var(--foreground-muted))]">
                Supported formats: {getValidArtifactTypesDescription()}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                accept=".tar.gz,.dmg,.msi,.exe,.AppImage,.deb,.zip,.sig"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="replaceExisting"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className={cn(
                  "h-4 w-4 rounded",
                  "border border-[hsl(var(--border))]",
                  "bg-[hsl(var(--input))]",
                  "text-[hsl(var(--primary))]",
                  "focus:ring-2 focus:ring-[hsl(var(--ring))] focus:ring-offset-0"
                )}
              />
              <label
                htmlFor="replaceExisting"
                className="text-sm text-[hsl(var(--foreground))] cursor-pointer"
              >
                Replace existing artifact for this platform
              </label>
            </div>
            <p className="text-xs text-[hsl(var(--foreground-muted))]">
              Enable this option to overwrite an existing artifact for the selected platform.
            </p>

            {/* Signature Section (Collapsible) */}
            <div className="border border-[hsl(var(--border))] rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setIsSignatureSectionOpen(!isSignatureSectionOpen)}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3",
                  "bg-[hsl(var(--muted))]/50 hover:bg-[hsl(var(--muted))]",
                  "transition-colors"
                )}
              >
                <div className="flex items-center gap-2">
                  <FileSignature className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
                  <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                    Signature (optional)
                  </span>
                  {signature && (
                    <span className="flex items-center gap-1 text-xs text-emerald-500">
                      <ShieldCheck className="h-3 w-3" />
                      Provided
                    </span>
                  )}
                </div>
                {isSignatureSectionOpen ? (
                  <ChevronUp className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-[hsl(var(--foreground-muted))]" />
                )}
              </button>

              {isSignatureSectionOpen && (
                <div className="px-4 py-4 space-y-4 border-t border-[hsl(var(--border))]">
                  <p className="text-xs text-[hsl(var(--foreground-muted))]">
                    Provide a cryptographic signature for update verification. Tauri uses this
                    to verify the authenticity of updates before installing them.
                  </p>

                  <div className="space-y-2">
                    <Label htmlFor="signatureInput">Paste Base64 Signature</Label>
                    <Textarea
                      id="signatureInput"
                      value={signature}
                      onChange={(e) => setSignature(e.target.value)}
                      placeholder="Paste your base64-encoded signature here..."
                      rows={3}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-[hsl(var(--border))]" />
                    <span className="text-xs text-[hsl(var(--foreground-muted))]">or</span>
                    <div className="flex-1 h-px bg-[hsl(var(--border))]" />
                  </div>

                  <div className="space-y-2">
                    <Label>Upload .sig File</Label>
                    <div
                      className={cn(
                        "border border-dashed border-[hsl(var(--border))] rounded-lg p-4",
                        "flex items-center justify-center gap-3",
                        "hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))]/30",
                        "transition-colors cursor-pointer"
                      )}
                      onClick={() => sigFileInputRef.current?.click()}
                    >
                      <Upload className="h-5 w-5 text-[hsl(var(--foreground-muted))]" />
                      <span className="text-sm text-[hsl(var(--foreground-muted))]">
                        Click to upload .sig file
                      </span>
                    </div>
                    <input
                      ref={sigFileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleSigFileSelect}
                      accept=".sig"
                    />
                  </div>

                  {signature && (
                    <div className="flex items-center justify-between p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                        <span className="text-sm text-emerald-500">Signature ready</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSignature("")}
                        className="text-xs text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))] transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <ModalFooter>
            <Button variant="outline" onClick={handleCloseUploadModal}>
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Installer Upload Modal */}
      <Modal open={isInstallerUploadModalOpen} onOpenChange={(open) => {
        if (!open) {
          handleCloseInstallerUploadModal();
        } else {
          setIsInstallerUploadModalOpen(true);
        }
      }}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Upload Installer</ModalTitle>
            <ModalDescription>
              Upload an installer package for end users to download and install your application.
            </ModalDescription>
          </ModalHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Target Platform</Label>
              <select
                value={selectedInstallerPlatform}
                onChange={(e) => setSelectedInstallerPlatform(e.target.value as InstallerPlatform)}
                className={cn(
                  "w-full h-10 rounded-md px-3 cursor-pointer",
                  "bg-[hsl(var(--input))] border border-[hsl(var(--border))]",
                  "text-sm text-[hsl(var(--foreground))]",
                  "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                )}
              >
                <optgroup label="macOS">
                  <option value="darwin-aarch64">macOS (Apple Silicon)</option>
                  <option value="darwin-x86_64">macOS (Intel)</option>
                  <option value="darwin-universal">macOS (Universal)</option>
                </optgroup>
                <optgroup label="Windows">
                  <option value="windows-x86_64">Windows (64-bit)</option>
                  <option value="windows-x86">Windows (32-bit)</option>
                  <option value="windows-aarch64">Windows (ARM64)</option>
                </optgroup>
                <optgroup label="Linux">
                  <option value="linux-x86_64">Linux (64-bit)</option>
                  <option value="linux-aarch64">Linux (ARM64)</option>
                  <option value="linux-armv7">Linux (ARMv7)</option>
                </optgroup>
              </select>
              <p className="text-xs text-[hsl(var(--foreground-muted))]">
                Platform will be auto-detected from filename if possible (e.g., arm64, x64, universal)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="installerDisplayName">Display Name (optional)</Label>
              <input
                id="installerDisplayName"
                type="text"
                value={installerDisplayName}
                onChange={(e) => setInstallerDisplayName(e.target.value)}
                placeholder="e.g., My App Installer for macOS"
                className={cn(
                  "w-full h-10 rounded-md px-3",
                  "bg-[hsl(var(--input))] border border-[hsl(var(--border))]",
                  "text-sm text-[hsl(var(--foreground))]",
                  "placeholder:text-[hsl(var(--foreground-muted))]",
                  "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                )}
              />
              <p className="text-xs text-[hsl(var(--foreground-muted))]">
                A friendly name to display instead of the filename
              </p>
            </div>

            <div className="space-y-2">
              <Label>File</Label>
              <div
                className={cn(
                  "border-2 border-dashed border-[hsl(var(--border))] rounded-lg p-8",
                  "flex flex-col items-center justify-center gap-4",
                  "hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))]/50",
                  "transition-colors cursor-pointer"
                )}
                onClick={() => installerFileInputRef.current?.click()}
              >
                <Download className="h-10 w-10 text-[hsl(var(--foreground-muted))]" />
                <div className="text-center">
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                    Click to select installer file
                  </p>
                  <p className="text-xs text-[hsl(var(--foreground-muted))]">
                    or drag and drop
                  </p>
                </div>
              </div>
              <p className="text-xs text-[hsl(var(--foreground-muted))]">
                Supported formats: {getValidInstallerTypesDescription()}
              </p>
              <input
                ref={installerFileInputRef}
                type="file"
                className="hidden"
                onChange={handleInstallerFileChange}
                accept=".dmg,.pkg,.exe,.msi,.deb,.rpm,.AppImage,.snap"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="installerReplaceExisting"
                checked={installerReplaceExisting}
                onChange={(e) => setInstallerReplaceExisting(e.target.checked)}
                className={cn(
                  "h-4 w-4 rounded",
                  "border border-[hsl(var(--border))]",
                  "bg-[hsl(var(--input))]",
                  "text-[hsl(var(--primary))]",
                  "focus:ring-2 focus:ring-[hsl(var(--ring))] focus:ring-offset-0"
                )}
              />
              <label
                htmlFor="installerReplaceExisting"
                className="text-sm text-[hsl(var(--foreground))] cursor-pointer"
              >
                Replace existing installer for this platform
              </label>
            </div>
            <p className="text-xs text-[hsl(var(--foreground-muted))]">
              Enable this option to overwrite an existing installer for the selected platform.
            </p>
          </div>

          <ModalFooter>
            <Button variant="outline" onClick={handleCloseInstallerUploadModal}>
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Page>
  );
}

interface ArtifactRowProps {
  artifact: Artifact;
  canDelete: boolean;
  onDelete: () => void;
  isDeleting: boolean;
}

function ArtifactRow({ artifact, canDelete, onDelete, isDeleting }: ArtifactRowProps) {
  const [copied, setCopied] = React.useState(false);

  const hash = extractHash(artifact.checksum);
  const filename = extractFilename(artifact.r2Key, artifact.downloadUrl);

  const handleCopyHash = async () => {
    if (!hash) return;
    const success = await copyToClipboard(hash);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/50 transition-colors">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <PlatformBadge platform={artifact.platform} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[hsl(var(--foreground))] truncate">
            {filename}
          </p>
          <div className="flex items-center gap-4 text-sm text-[hsl(var(--foreground-muted))]">
            {artifact.fileSize !== null && (
              <span>{formatFileSize(artifact.fileSize)}</span>
            )}
            {hash && (
              <button
                onClick={handleCopyHash}
                className="flex items-center gap-1 font-mono text-xs hover:text-[hsl(var(--foreground))] transition-colors"
                title="Copy SHA-256 hash"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {hash.slice(0, 8)}...
              </button>
            )}
            {artifact.signature && (
              <span
                className="flex items-center gap-1 text-emerald-500"
                title="This artifact has a cryptographic signature for update verification"
              >
                <ShieldCheck className="h-3 w-3" />
                <span className="text-xs">Signed</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-4">
        {artifact.downloadUrl && (
          <a
            href={artifact.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex"
          >
            <Button variant="ghost" size="sm">
              <FileDown className="h-4 w-4" />
            </Button>
          </a>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={isDeleting}
            className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))] hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface InstallerRowProps {
  installer: Installer;
  canDelete: boolean;
  onDelete: () => void;
  isDeleting: boolean;
}

function InstallerRow({ installer, canDelete, onDelete, isDeleting }: InstallerRowProps) {
  const [copied, setCopied] = React.useState(false);

  const hash = extractHash(installer.checksum);
  const displayName = installer.displayName || installer.filename;

  const handleCopyHash = async () => {
    if (!hash) return;
    const success = await copyToClipboard(hash);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/50 transition-colors">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <span className="text-xs px-2 py-1 rounded-md bg-[hsl(var(--muted))] text-[hsl(var(--foreground-muted))] whitespace-nowrap">
          {formatInstallerPlatform(installer.platform)}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[hsl(var(--foreground))] truncate">
            {displayName}
          </p>
          <div className="flex items-center gap-4 text-sm text-[hsl(var(--foreground-muted))]">
            {installer.displayName && (
              <span className="font-mono text-xs truncate max-w-[200px]" title={installer.filename}>
                {installer.filename}
              </span>
            )}
            {installer.fileSize !== null && (
              <span>{formatFileSize(installer.fileSize)}</span>
            )}
            {hash && (
              <button
                onClick={handleCopyHash}
                className="flex items-center gap-1 font-mono text-xs hover:text-[hsl(var(--foreground))] transition-colors"
                title="Copy SHA-256 hash"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {hash.slice(0, 8)}...
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-4">
        {installer.downloadUrl && (
          <a
            href={installer.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex"
          >
            <Button variant="ghost" size="sm">
              <FileDown className="h-4 w-4" />
            </Button>
          </a>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={isDeleting}
            className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))] hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
