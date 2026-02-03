/**
 * Oasis Admin Dashboard - TypeScript Types
 *
 * These types define the data structures used throughout the dashboard
 * for interacting with the Oasis Tauri Update Server API.
 * All field names use camelCase to match server responses.
 */

/**
 * Release status enum representing the lifecycle of a release.
 */
export type ReleaseStatus = "draft" | "published" | "archived";

/**
 * Supported platforms for artifacts.
 */
export type Platform =
  | "darwin-aarch64"
  | "darwin-x86_64"
  | "windows-x86_64"
  | "windows-x86"
  | "linux-x86_64"
  | "linux-aarch64"
  | string;

/**
 * API Key scope - determines access level.
 */
export type ApiKeyScope = "admin" | "ci";

/**
 * App entity representing a Tauri application registered with the update server.
 */
export interface App {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  /** Total number of releases for this app */
  releaseCount: number;
  /** Version string of the latest published release, or null if none */
  latestVersion: string | null;
}

/**
 * Request payload for creating a new app.
 */
export interface CreateAppRequest {
  name: string;
  slug: string;
  description?: string;
}

/**
 * Request payload for updating an existing app.
 */
export interface UpdateAppRequest {
  name?: string;
  description?: string;
}

/**
 * Release entity representing a version of an application.
 */
export interface Release {
  id: string;
  appId: string;
  version: string;
  notes: string | null;
  status: ReleaseStatus;
  pubDate: string | null;
  createdAt: string;
  updatedAt: string;
  artifactCount?: number;
  artifacts?: Artifact[];
}

/**
 * Request payload for creating a new release.
 */
export interface CreateReleaseRequest {
  version: string;
  notes?: string;
}

/**
 * Request payload for updating an existing release.
 */
export interface UpdateReleaseRequest {
  notes?: string;
}

/**
 * Artifact entity representing a downloadable file for a specific platform.
 * Matches the server's ArtifactDto response structure.
 */
export interface Artifact {
  id: string;
  releaseId: string;
  platform: Platform;
  signature: string | null;
  r2Key: string | null;
  downloadUrl: string | null;
  fileSize: number | null;
  checksum: string | null;
  createdAt: string;
}

/**
 * Request payload for creating a new artifact via presigned upload.
 */
export interface CreateArtifactRequest {
  platform: Platform;
  arch?: string;
  fileName: string;
  fileSize: number;
  sha256: string;
  signature?: string;
}

/**
 * API Key entity for authenticating with the update server.
 */
export interface ApiKey {
  id: string;
  name: string;
  scope: ApiKeyScope;
  appId: string | null;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

/**
 * Request payload for creating a new API key.
 */
export interface CreateApiKeyRequest {
  name: string;
  scope: ApiKeyScope;
  appId?: string;
}

/**
 * Response from creating an API key (includes full key, shown only once).
 */
export interface CreateApiKeyResponse {
  apiKey: ApiKey;
  key: string;
}

/**
 * Pagination metadata for paginated responses.
 */
export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

/**
 * Generic paginated response wrapper matching server format.
 * Server returns: { success: true, data: { items: [...], pagination: {...} } }
 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

/**
 * API error response structure.
 */
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

/**
 * Generic API response that can be either success or error.
 */
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };

/**
 * Query parameters for listing apps.
 */
export interface ListAppsParams {
  page?: number;
  perPage?: number;
  search?: string;
}

/**
 * Query parameters for listing releases.
 */
export interface ListReleasesParams {
  page?: number;
  perPage?: number;
  status?: ReleaseStatus;
}

/**
 * Query parameters for listing API keys.
 */
export interface ListApiKeysParams {
  page?: number;
  perPage?: number;
  includeRevoked?: boolean;
}

/**
 * Dashboard statistics (for potential future use).
 */
export interface DashboardStats {
  totalApps: number;
  totalReleases: number;
  totalArtifacts: number;
  totalDownloads: number;
  activeApiKeys: number;
}

/**
 * Upload progress state for artifact uploads.
 */
export interface UploadProgress {
  fileName: string;
  progress: number;
  status: "pending" | "uploading" | "complete" | "error";
  error?: string;
}

/**
 * Toast notification types.
 */
export type ToastType = "success" | "error" | "warning" | "info";

/**
 * Toast notification state.
 */
export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

/**
 * Health check response from the server.
 */
export interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime: number;
}

/**
 * Detailed health check response with component status.
 */
export interface DetailedHealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime: number;
  components: {
    database: {
      status: "healthy" | "unhealthy";
      latencyMs: number;
    };
    storage: {
      status: "healthy" | "unhealthy";
      provider: string;
    };
  };
}

/**
 * Request payload for presigning an artifact upload.
 * Used to generate a presigned URL for direct upload to R2 storage.
 */
export interface PresignArtifactRequest {
  platform: Platform;
  filename: string;
  contentType?: string;
  /** If true, replaces any existing artifact for the same platform */
  replaceExisting?: boolean;
}

/**
 * Response from the presign artifact endpoint.
 * Contains the presigned URL and artifact metadata.
 */
export interface PresignArtifactResponse {
  presignedUrl: string;
  r2Key: string;
  artifactId: string;
}

/**
 * Request payload for confirming an artifact upload.
 * Called after successfully uploading to the presigned URL.
 */
export interface ConfirmUploadRequest {
  signature?: string;
  checksum?: string;
}

/**
 * Response from the confirm upload endpoint.
 * Contains the confirmed artifact details.
 */
export interface ConfirmUploadResponse {
  confirmed: boolean;
  artifact: Artifact;
}

// =============================================================================
// Installer Types
// =============================================================================

/**
 * Supported platforms for installers.
 * This is a superset of the artifact platforms, including universal and additional targets.
 */
export type InstallerPlatform =
  | "darwin-aarch64"
  | "darwin-x86_64"
  | "darwin-universal"
  | "windows-x86_64"
  | "windows-x86"
  | "windows-aarch64"
  | "linux-x86_64"
  | "linux-aarch64"
  | "linux-armv7";

/**
 * Installer entity representing a downloadable installer file for a specific platform.
 * Installers are standalone installation packages (e.g., .dmg, .exe, .msi) that users
 * can download and run to install the application, separate from the Tauri update mechanism.
 */
export interface Installer {
  id: string;
  releaseId: string;
  platform: InstallerPlatform;
  filename: string;
  displayName: string | null;
  r2Key: string | null;
  downloadUrl: string | null;
  fileSize: number | null;
  checksum: string | null;
  createdAt: string;
}

/**
 * Request payload for presigning an installer upload.
 * Used to generate a presigned URL for direct upload to R2 storage.
 */
export interface PresignInstallerRequest {
  platform: InstallerPlatform;
  filename: string;
  contentType: string;
  fileSize: number;
  displayName?: string;
  replaceExisting?: boolean;
}

/**
 * Response from the presign installer endpoint.
 * Contains the presigned URL and installer metadata.
 */
export interface PresignInstallerResponse {
  presignedUrl: string;
  r2Key: string;
  installerId: string;
}

/**
 * Request payload for confirming an installer upload.
 * Called after successfully uploading to the presigned URL.
 */
export interface ConfirmInstallerUploadRequest {
  checksum?: string;
}

/**
 * Response from the confirm installer upload endpoint.
 * Contains the confirmed installer details.
 */
export interface ConfirmInstallerUploadResponse {
  installer: Installer;
}

// =============================================================================
// Analytics Types
// =============================================================================

/**
 * Platform download statistics for analytics.
 */
export interface PlatformDownloadStats {
  /** The platform identifier */
  platform: string;
  /** Total downloads for this platform */
  count: number;
}

/**
 * Download statistics for a single release.
 * Breaks down downloads by type (update vs installer).
 */
export interface ReleaseDownloadStats {
  /** The release ID */
  releaseId: string;
  /** The version string */
  version: string;
  /** Total number of update downloads (Tauri updater) */
  updateDownloads: number;
  /** Total number of installer downloads (standalone installers) */
  installerDownloads: number;
  /** Combined total of all downloads */
  totalDownloads: number;
  /** Downloads broken down by platform */
  byPlatform: PlatformDownloadStats[];
}

/**
 * Per-version download breakdown for app summary.
 */
export interface VersionDownloadBreakdown {
  /** The version string */
  version: string;
  /** The release ID */
  releaseId: string;
  /** Number of update downloads for this version */
  updateDownloads: number;
  /** Number of installer downloads for this version */
  installerDownloads: number;
  /** Combined total of all downloads for this version */
  totalDownloads: number;
}

/**
 * Aggregate download statistics for an entire app.
 * Provides totals and per-version breakdown.
 */
export interface AppDownloadSummary {
  /** The app ID */
  appId: string;
  /** Total number of update downloads across all versions */
  totalUpdateDownloads: number;
  /** Total number of installer downloads across all versions */
  totalInstallerDownloads: number;
  /** Combined total of all downloads */
  totalDownloads: number;
  /** Downloads broken down by version */
  byVersion: VersionDownloadBreakdown[];
  /** Downloads broken down by platform */
  byPlatform: PlatformDownloadStats[];
}
