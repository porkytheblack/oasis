import { z } from "zod";

// ============================================================================
// Enums and Constants
// ============================================================================

/**
 * Supported Tauri target platforms
 * Format: {os}-{arch}
 */
export const PLATFORMS = [
  "darwin-aarch64",
  "darwin-x86_64",
  "linux-x86_64",
  "linux-aarch64",
  "windows-x86_64",
  "windows-aarch64",
] as const;

export type Platform = (typeof PLATFORMS)[number];

/**
 * Supported installer platforms
 * Superset of artifact platforms - allows additional formats like universal binaries
 */
export const INSTALLER_PLATFORMS = [
  // Standard platforms (same as artifacts)
  "darwin-aarch64",
  "darwin-x86_64",
  "linux-x86_64",
  "linux-aarch64",
  "windows-x86_64",
  "windows-aarch64",
  // Additional installer-specific platforms
  "darwin-universal", // Universal binary for macOS (Intel + Apple Silicon)
  "windows-x86",      // 32-bit Windows
  "linux-armv7",      // 32-bit ARM Linux
] as const;

export type InstallerPlatform = (typeof INSTALLER_PLATFORMS)[number];

/**
 * Release lifecycle statuses
 */
export const RELEASE_STATUSES = ["draft", "published", "archived"] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

/**
 * API key permission scopes
 */
export const API_KEY_SCOPES = ["ci", "admin"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * App slug validation: lowercase letters, numbers, and hyphens
 * Must start with a letter and be between 2-50 characters
 */
export const appSlugSchema = z
  .string()
  .min(2, "Slug must be at least 2 characters")
  .max(50, "Slug must be at most 50 characters")
  .regex(
    /^[a-z][a-z0-9-]*[a-z0-9]$/,
    "Slug must start with a letter, end with a letter or number, and contain only lowercase letters, numbers, and hyphens"
  )
  .refine((s) => !s.includes("--"), "Slug cannot contain consecutive hyphens");

/**
 * Semantic version validation
 */
export const semverSchema = z
  .string()
  .regex(
    /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/,
    "Version must be a valid semantic version (e.g., 1.0.0, 1.0.0-beta.1)"
  );

/**
 * Platform validation schema
 */
export const platformSchema = z.enum(PLATFORMS);

/**
 * Release status validation schema
 */
export const releaseStatusSchema = z.enum(RELEASE_STATUSES);

/**
 * API key scope validation schema
 */
export const apiKeyScopeSchema = z.enum(API_KEY_SCOPES);

/**
 * ULID validation schema
 * ULIDs are 26 characters in Crockford's Base32 format
 */
export const ulidSchema = z
  .string()
  .length(26, "ID must be exactly 26 characters")
  .regex(
    /^[0-9A-HJKMNP-TV-Z]{26}$/i,
    "ID must be a valid ULID format"
  );

// ============================================================================
// Request/Response DTOs
// ============================================================================

/**
 * Create app request schema
 */
export const createAppSchema = z.object({
  slug: appSlugSchema,
  name: z.string().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
  description: z.string().max(1000, "Description must be at most 1000 characters").optional(),
  publicKey: z.string().optional(),
});

export type CreateAppDto = z.infer<typeof createAppSchema>;

/**
 * Update app request schema
 */
export const updateAppSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be at most 100 characters")
    .optional(),
  description: z
    .string()
    .max(1000, "Description must be at most 1000 characters")
    .nullable()
    .optional(),
  publicKey: z.string().nullable().optional(),
});

export type UpdateAppDto = z.infer<typeof updateAppSchema>;

/**
 * App response DTO
 */
export interface AppDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  publicKey: string | null;
  createdAt: string;
  updatedAt: string;
  /** Total number of releases for this app */
  releaseCount: number;
  /** Version string of the latest published release, or null if none */
  latestVersion: string | null;
}

/**
 * Create release request schema
 */
export const createReleaseSchema = z.object({
  version: semverSchema,
  notes: z.string().max(10000, "Notes must be at most 10000 characters").optional(),
  status: releaseStatusSchema.optional().default("draft"),
});

export type CreateReleaseDto = z.infer<typeof createReleaseSchema>;

/**
 * Update release request schema
 */
export const updateReleaseSchema = z.object({
  notes: z.string().max(10000, "Notes must be at most 10000 characters").nullable().optional(),
  status: releaseStatusSchema.optional(),
  pubDate: z.string().datetime().nullable().optional(),
});

export type UpdateReleaseDto = z.infer<typeof updateReleaseSchema>;

/**
 * Release response DTO
 */
export interface ReleaseDto {
  id: string;
  appId: string;
  version: string;
  notes: string | null;
  pubDate: string | null;
  status: ReleaseStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create artifact request schema
 */
export const createArtifactSchema = z.object({
  platform: platformSchema,
  signature: z.string().optional(),
  r2Key: z.string().optional(),
  downloadUrl: z.string().url("Download URL must be a valid URL").optional(),
  fileSize: z.number().int().positive("File size must be a positive integer").optional(),
  checksum: z.string().optional(),
});

export type CreateArtifactDto = z.infer<typeof createArtifactSchema>;

/**
 * Create API key request schema
 */
export const createApiKeySchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be at most 100 characters"),
  scope: apiKeyScopeSchema,
  appId: ulidSchema.optional().nullable(),
});

export type CreateApiKeyDto = z.infer<typeof createApiKeySchema>;

/**
 * API key response DTO
 * The actual key value is never exposed after creation.
 */
export interface ApiKeyDto {
  id: string;
  name: string;
  scope: ApiKeyScope;
  appId: string | null;
  /** First characters of the key for identification (e.g., "uk_live_********") */
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

/**
 * Response returned when creating a new API key.
 * This is the ONLY time the full key is returned.
 */
export interface ApiKeyCreateResponse {
  /** The full API key - store this securely, it will not be shown again */
  key: string;
  /** The key details (without the full key) */
  apiKey: ApiKeyDto;
}

/**
 * List releases query schema with optional status filter
 */
export const listReleasesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: releaseStatusSchema.optional(),
});

export type ListReleasesQuery = z.infer<typeof listReleasesQuerySchema>;

/**
 * Artifact response DTO
 */
export interface ArtifactDto {
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

// ============================================================================
// Installer Types and Schemas
// ============================================================================

/**
 * Installer platform validation schema
 */
export const installerPlatformSchema = z.enum(INSTALLER_PLATFORMS);

/**
 * Installer response DTO
 */
export interface InstallerDto {
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
 * Create installer request schema (with direct URL)
 */
export const createInstallerSchema = z.object({
  platform: installerPlatformSchema,
  filename: z
    .string()
    .min(1, "Filename is required")
    .max(255, "Filename must be at most 255 characters")
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Filename can only contain letters, numbers, dots, underscores, and hyphens"
    ),
  displayName: z
    .string()
    .max(100, "Display name must be at most 100 characters")
    .optional(),
  downloadUrl: z.string().url("Download URL must be a valid URL").optional(),
  fileSize: z.number().int().positive("File size must be a positive integer").optional(),
  checksum: z.string().optional(),
});

export type CreateInstallerDto = z.infer<typeof createInstallerSchema>;

/**
 * Request schema for generating a presigned upload URL for an installer.
 */
export const presignInstallerSchema = z.object({
  platform: installerPlatformSchema,
  filename: z
    .string()
    .min(1, "Filename is required")
    .max(255, "Filename must be at most 255 characters")
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Filename can only contain letters, numbers, dots, underscores, and hyphens"
    ),
  displayName: z
    .string()
    .max(100, "Display name must be at most 100 characters")
    .optional(),
  contentType: z.string().optional(),
  replaceExisting: z.boolean().optional().default(false),
});

export type PresignInstallerDto = z.infer<typeof presignInstallerSchema>;

/**
 * Response returned when generating a presigned upload URL for an installer.
 */
export interface PresignInstallerResponse {
  presignedUrl: string;
  r2Key: string;
  installerId: string;
}

/**
 * Request schema for confirming an installer upload.
 */
export const confirmInstallerUploadSchema = z.object({
  checksum: z.string().optional(),
});

export type ConfirmInstallerUploadDto = z.infer<typeof confirmInstallerUploadSchema>;

/**
 * Response returned when confirming an installer upload.
 */
export interface ConfirmInstallerUploadResponse {
  confirmed: boolean;
  installer: InstallerDto;
}

// ============================================================================
// Tauri Update Response
// ============================================================================

/**
 * Tauri updater expects this response format
 * See: https://tauri.app/v1/guides/distribution/updater
 */
export interface TauriUpdateResponse {
  /** The version being served */
  version: string;
  /** Release notes in markdown format */
  notes?: string;
  /** Publication date in RFC 3339 format */
  pub_date?: string;
  /** Direct download URL for the update artifact */
  url: string;
  /** Signature for verifying the update (required if public key is set) */
  signature?: string;
}

// ============================================================================
// API Response Wrappers
// ============================================================================

/**
 * Standard success response format
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Standard error response format
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Combined API response type
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Pagination parameters schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

/**
 * Paginated response format
 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================================
// Error Codes
// ============================================================================

export const ErrorCodes = {
  // Client errors (4xx)
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",

  // Server errors (5xx)
  INTERNAL_ERROR: "INTERNAL_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ============================================================================
// R2 Presigned Upload Types
// ============================================================================

/**
 * Request schema for generating a presigned upload URL.
 *
 * Used to request a URL that allows direct upload to R2 storage.
 */
export const presignArtifactSchema = z.object({
  /** Target platform for the artifact */
  platform: platformSchema,
  /** Filename for the artifact (e.g., "app-1.2.0-darwin-aarch64.tar.gz") */
  filename: z
    .string()
    .min(1, "Filename is required")
    .max(255, "Filename must be at most 255 characters")
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Filename can only contain letters, numbers, dots, underscores, and hyphens"
    ),
  /** Optional content type hint (e.g., "application/gzip") */
  contentType: z.string().optional(),
  /** If true, replaces any existing artifact for the same platform */
  replaceExisting: z.boolean().optional().default(false),
});

export type PresignArtifactDto = z.infer<typeof presignArtifactSchema>;

/**
 * Response returned when generating a presigned upload URL.
 */
export interface PresignArtifactResponse {
  /** The presigned URL for uploading the artifact directly to R2 */
  presignedUrl: string;
  /** The R2 object key where the file will be stored */
  r2Key: string;
  /** The artifact ID created in pending state */
  artifactId: string;
}

/**
 * Request schema for confirming an artifact upload.
 *
 * After uploading directly to R2, the client must call this endpoint
 * to verify the upload and activate the artifact.
 */
export const confirmUploadSchema = z.object({
  /** Optional signature for the artifact (base64-encoded) */
  signature: z.string().optional(),
  /** Optional checksum for verification (e.g., "sha256:abc123...") */
  checksum: z.string().optional(),
});

export type ConfirmUploadDto = z.infer<typeof confirmUploadSchema>;

/**
 * Response returned when confirming an artifact upload.
 */
export interface ConfirmUploadResponse {
  /** Whether the upload was successfully confirmed */
  confirmed: boolean;
  /** The confirmed artifact details */
  artifact: ArtifactDto;
}

// ============================================================================
// CI Integration Types
// ============================================================================

/**
 * Single artifact input for CI release creation.
 *
 * Represents an artifact that has already been uploaded to R2.
 * The CI pipeline uploads files first, then calls the CI endpoint with this data.
 */
export interface CiArtifactInput {
  /** Target platform for this artifact */
  platform: Platform;
  /** Base64-encoded signature for update verification */
  signature: string;
  /** The R2 key where the artifact was uploaded */
  r2_key: string;
}

/**
 * Zod schema for validating CI artifact input.
 */
export const ciArtifactInputSchema = z.object({
  platform: platformSchema,
  signature: z.string().min(1, "Signature is required"),
  r2_key: z.string().min(1, "R2 key is required"),
});

/**
 * Single installer input for CI release creation.
 *
 * Represents an installer that has already been uploaded to R2.
 */
export interface CiInstallerInput {
  /** Target platform for this installer */
  platform: InstallerPlatform;
  /** Filename of the installer (e.g., "MyApp-1.2.0.dmg") */
  filename: string;
  /** Optional friendly display name */
  display_name?: string;
  /** The R2 key where the installer was uploaded */
  r2_key: string;
}

/**
 * Zod schema for validating CI installer input.
 */
export const ciInstallerInputSchema = z.object({
  platform: installerPlatformSchema,
  filename: z
    .string()
    .min(1, "Filename is required")
    .max(255, "Filename must be at most 255 characters")
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Filename can only contain letters, numbers, dots, underscores, and hyphens"
    ),
  display_name: z.string().max(100, "Display name must be at most 100 characters").optional(),
  r2_key: z.string().min(1, "R2 key is required"),
});

/**
 * Request schema for CI release creation.
 *
 * This is a convenience endpoint that creates a release AND registers
 * artifacts in one call. CI uploads files to R2 first, then calls this
 * endpoint with the release info.
 */
export const ciReleaseSchema = z.object({
  /** Semantic version string (e.g., "1.2.0") */
  version: semverSchema,
  /** Release notes in markdown format */
  notes: z.string().max(10000, "Notes must be at most 10000 characters").optional(),
  /** Array of artifact definitions */
  artifacts: z.array(ciArtifactInputSchema).min(1, "At least one artifact is required"),
  /** Optional array of installer definitions */
  installers: z.array(ciInstallerInputSchema).optional(),
  /** If true, publishes the release immediately after creation */
  auto_publish: z.boolean().optional().default(false),
});

export type CiReleaseDto = z.infer<typeof ciReleaseSchema>;

/**
 * Artifact in CI release response format.
 */
export interface CiReleaseArtifact {
  id: string;
  platform: Platform;
  signature: string;
  r2Key: string;
  downloadUrl: string | null;
  fileSize: number | null;
  createdAt: string;
}

/**
 * Installer in CI release response format.
 */
export interface CiReleaseInstaller {
  id: string;
  platform: InstallerPlatform;
  filename: string;
  displayName: string | null;
  r2Key: string;
  downloadUrl: string | null;
  fileSize: number | null;
  createdAt: string;
}

/**
 * Response returned when creating a release via the CI endpoint.
 */
export interface CiReleaseResponse {
  /** The created release details */
  release: {
    id: string;
    appId: string;
    version: string;
    notes: string | null;
    pubDate: string | null;
    status: ReleaseStatus;
    createdAt: string;
    updatedAt: string;
  };
  /** The created artifact records */
  artifacts: CiReleaseArtifact[];
  /** The created installer records (if any) */
  installers?: CiReleaseInstaller[];
}

// ============================================================================
// Analytics Types
// ============================================================================

/**
 * Supported time periods for analytics time series data
 */
export const TIME_SERIES_PERIODS = ["24h", "7d", "30d", "90d"] as const;
export type TimeSeriesPeriod = (typeof TIME_SERIES_PERIODS)[number];

/**
 * Time series period validation schema
 */
export const timeSeriesPeriodSchema = z.enum(TIME_SERIES_PERIODS);

/**
 * Query parameters for fetching download statistics
 */
export const downloadStatsQuerySchema = z.object({
  /** Start date for filtering (ISO 8601 format) */
  startDate: z.string().datetime().optional(),
  /** End date for filtering (ISO 8601 format) */
  endDate: z.string().datetime().optional(),
  /** Whether to include country breakdown in response */
  includeCountries: z
    .string()
    .transform((val) => val === "true")
    .optional(),
});

export type DownloadStatsQuery = z.infer<typeof downloadStatsQuerySchema>;

/**
 * Options for querying download statistics
 */
export interface DownloadStatsOptions {
  /** Start date for filtering (ISO 8601 format) */
  startDate?: string;
  /** End date for filtering (ISO 8601 format) */
  endDate?: string;
  /** Whether to include country breakdown */
  includeCountries?: boolean;
}

/**
 * Download statistics broken down by version
 */
export interface VersionDownloadStats {
  /** The version string */
  version: string;
  /** Total downloads for this version */
  count: number;
}

/**
 * Download statistics broken down by platform
 */
export interface PlatformDownloadStats {
  /** The platform identifier */
  platform: string;
  /** Total downloads for this platform */
  count: number;
}

/**
 * Download statistics broken down by country
 */
export interface CountryDownloadStats {
  /** The ISO country code or "Unknown" */
  country: string;
  /** Total downloads from this country */
  count: number;
}

/**
 * Complete download statistics response
 */
export interface DownloadStatsResponse {
  /** Total number of downloads */
  totalDownloads: number;
  /** Downloads broken down by version */
  byVersion: VersionDownloadStats[];
  /** Downloads broken down by platform */
  byPlatform: PlatformDownloadStats[];
  /** Downloads broken down by country (optional) */
  byCountry?: CountryDownloadStats[];
  /** The time period for these statistics */
  period: {
    start: string | null;
    end: string | null;
  };
}

/**
 * Single data point in a time series
 */
export interface TimeSeriesDataPoint {
  /** The timestamp for this bucket (ISO 8601 format) */
  timestamp: string;
  /** The count of downloads in this bucket */
  count: number;
}

/**
 * Query parameters for time series data
 */
export const timeSeriesQuerySchema = z.object({
  /** The time period to retrieve */
  period: timeSeriesPeriodSchema.optional().default("7d"),
});

export type TimeSeriesQuery = z.infer<typeof timeSeriesQuerySchema>;

/**
 * Time series response format
 */
export interface TimeSeriesResponse {
  /** The requested time period */
  period: TimeSeriesPeriod;
  /** Array of data points */
  data: TimeSeriesDataPoint[];
  /** Total downloads in this period */
  total: number;
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

/**
 * Rate limit configuration for an endpoint type
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

/**
 * Rate limit endpoint type configuration
 */
export interface RateLimitOptions {
  /** Configuration for public endpoints (update checks) */
  public: RateLimitConfig;
  /** Configuration for admin endpoints */
  admin: RateLimitConfig;
  /** Configuration for CI endpoints */
  ci: RateLimitConfig;
}

/**
 * Rate limit info returned in response headers
 */
export interface RateLimitInfo {
  /** Maximum requests allowed in window */
  limit: number;
  /** Remaining requests in current window */
  remaining: number;
  /** Timestamp when the window resets (Unix epoch seconds) */
  reset: number;
}

/**
 * Rate limit error response
 */
export interface RateLimitErrorResponse {
  success: false;
  error: {
    code: "RATE_LIMIT_EXCEEDED";
    message: string;
    retryAfter: number;
  };
}

// ============================================================================
// Health Check Types
// ============================================================================

/**
 * Basic health check response
 */
export interface HealthCheckResponse {
  /** Current health status */
  status: "healthy" | "unhealthy" | "degraded";
  /** Current server timestamp */
  timestamp: string;
  /** Server version */
  version: string;
}

/**
 * Detailed health check response with system metrics
 */
export interface DetailedHealthResponse extends HealthCheckResponse {
  /** Server uptime in seconds */
  uptime: number;
  /** Memory usage statistics */
  memory: {
    /** Used heap memory in bytes */
    heapUsed: number;
    /** Total heap memory in bytes */
    heapTotal: number;
    /** Resident set size in bytes */
    rss: number;
    /** External memory in bytes */
    external: number;
  };
  /** Database connection status */
  database: {
    /** Whether the database is connected */
    connected: boolean;
    /** Response time in milliseconds (if connected) */
    responseTimeMs?: number;
  };
}

/**
 * Readiness check response
 */
export interface ReadinessResponse {
  /** Whether the service is ready to accept traffic */
  ready: boolean;
  /** Individual check results */
  checks: {
    /** Database connectivity check */
    database: boolean;
  };
}

/**
 * Liveness check response
 */
export interface LivenessResponse {
  /** Whether the service is alive */
  alive: boolean;
  /** Current timestamp */
  timestamp: string;
}

// ============================================================================
// Release Download Statistics Types
// ============================================================================

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
