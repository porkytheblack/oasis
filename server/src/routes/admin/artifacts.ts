import { Hono } from "hono";
import { z } from "zod";
import {
  createArtifact,
  listArtifacts,
  getArtifactById,
  deleteArtifact,
  createPendingArtifact,
  confirmArtifactUpload,
  ArtifactNotFoundError,
  ArtifactPlatformConflictError,
  ReleaseNotFoundForArtifactError,
  ArtifactUploadNotFoundError,
  ArtifactNotPendingError,
} from "../../services/artifact.service.js";
import {
  success,
  created,
  notFound,
  conflict,
  zodValidationError,
  internalError,
  validationError,
} from "../../utils/response.js";
import {
  createArtifactSchema,
  ulidSchema,
  presignArtifactSchema,
  confirmUploadSchema,
} from "../../types/index.js";
import type {
  PresignArtifactResponse,
  ConfirmUploadResponse,
} from "../../types/index.js";
import type { AuthVariables } from "../../middleware/auth.js";
import { requireAppAccess } from "../../middleware/auth.js";
import { getAppById } from "../../services/app.service.js";
import { getReleaseById } from "../../services/release.service.js";
import {
  buildR2Key,
  generatePresignedUploadUrl,
  isR2Configured,
  R2Error,
  R2ConfigurationError,
} from "../../services/r2.service.js";

/**
 * Admin routes for managing artifacts.
 *
 * All routes require authentication via authMiddleware.
 * App-scoped keys can only access artifacts for releases belonging to their assigned app.
 */
export const artifactsRoutes = new Hono<{ Variables: AuthVariables }>();

// Apply app access middleware to all routes
artifactsRoutes.use("/:app_id/*", requireAppAccess("app_id"));

/**
 * GET /admin/apps/:app_id/releases/:release_id/artifacts
 *
 * Lists all artifacts for a release.
 *
 * @example
 * GET /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFD/releases/01HQWX5K8J2MXPZ9Y7VBNC3DFE/artifacts
 *
 * Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFF",
 *       "releaseId": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *       "platform": "darwin-aarch64",
 *       "signature": "dGhpcyBpcyBhIHNpZ25hdHVyZQ==",
 *       "r2Key": null,
 *       "downloadUrl": "https://releases.example.com/my-app/1.2.0/darwin-aarch64.tar.gz",
 *       "fileSize": 52428800,
 *       "checksum": "sha256:abc123...",
 *       "createdAt": "2024-01-15T10:00:00.000Z"
 *     },
 *     {
 *       "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFG",
 *       "releaseId": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *       "platform": "windows-x86_64",
 *       "signature": "dGhpcyBpcyBhbm90aGVyIHNpZ25hdHVyZQ==",
 *       "r2Key": null,
 *       "downloadUrl": "https://releases.example.com/my-app/1.2.0/windows-x86_64.msi",
 *       "fileSize": 65536000,
 *       "checksum": "sha256:def456...",
 *       "createdAt": "2024-01-15T10:05:00.000Z"
 *     }
 *   ]
 * }
 */
artifactsRoutes.get(
  "/:app_id/releases/:release_id/artifacts",
  async (c) => {
    const appId = c.req.param("app_id");
    const releaseId = c.req.param("release_id");

    // Validate IDs
    const appIdResult = ulidSchema.safeParse(appId);
    if (!appIdResult.success) {
      return zodValidationError(c, appIdResult.error);
    }

    const releaseIdResult = ulidSchema.safeParse(releaseId);
    if (!releaseIdResult.success) {
      return zodValidationError(c, releaseIdResult.error);
    }

    try {
      const artifacts = await listArtifacts(releaseId, appId);
      return success(c, artifacts);
    } catch (error) {
      if (error instanceof ReleaseNotFoundForArtifactError) {
        return notFound(c, "Release", releaseId);
      }
      console.error("Error listing artifacts:", error);
      return internalError(c);
    }
  }
);

/**
 * POST /admin/apps/:app_id/releases/:release_id/artifacts
 *
 * Creates a new artifact for a release.
 * Only one artifact per platform is allowed per release.
 *
 * Request body:
 * - platform: Target platform (required, e.g., "darwin-aarch64", "windows-x86_64")
 * - signature: Base64-encoded signature for update verification (optional)
 * - downloadUrl: Direct download URL for the artifact (optional)
 * - fileSize: File size in bytes (optional)
 * - checksum: Checksum string, typically "algorithm:hash" (optional)
 *
 * @example
 * POST /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFD/releases/01HQWX5K8J2MXPZ9Y7VBNC3DFE/artifacts
 * {
 *   "platform": "darwin-aarch64",
 *   "signature": "dGhpcyBpcyBhIHNpZ25hdHVyZQ==",
 *   "downloadUrl": "https://releases.example.com/my-app/1.2.0/darwin-aarch64.tar.gz",
 *   "fileSize": 52428800,
 *   "checksum": "sha256:abc123def456..."
 * }
 *
 * Response (201):
 * {
 *   "success": true,
 *   "data": {
 *     "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFF",
 *     "releaseId": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *     "platform": "darwin-aarch64",
 *     "signature": "dGhpcyBpcyBhIHNpZ25hdHVyZQ==",
 *     "r2Key": null,
 *     "downloadUrl": "https://releases.example.com/my-app/1.2.0/darwin-aarch64.tar.gz",
 *     "fileSize": 52428800,
 *     "checksum": "sha256:abc123def456...",
 *     "createdAt": "2024-01-15T10:00:00.000Z"
 *   }
 * }
 *
 * Response (409 if platform already exists):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "CONFLICT",
 *     "message": "An artifact for platform 'darwin-aarch64' already exists for release '01HQWX5K8J2MXPZ9Y7VBNC3DFE'"
 *   }
 * }
 */
artifactsRoutes.post(
  "/:app_id/releases/:release_id/artifacts",
  async (c) => {
    const appId = c.req.param("app_id");
    const releaseId = c.req.param("release_id");

    // Validate IDs
    const appIdResult = ulidSchema.safeParse(appId);
    if (!appIdResult.success) {
      return zodValidationError(c, appIdResult.error);
    }

    const releaseIdResult = ulidSchema.safeParse(releaseId);
    if (!releaseIdResult.success) {
      return zodValidationError(c, releaseIdResult.error);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return zodValidationError(
        c,
        new z.ZodError([
          {
            code: "custom",
            message: "Invalid JSON in request body",
            path: [],
          },
        ])
      );
    }

    const parseResult = createArtifactSchema.safeParse(body);

    if (!parseResult.success) {
      return zodValidationError(c, parseResult.error);
    }

    try {
      const artifact = await createArtifact(
        releaseId,
        {
          platform: parseResult.data.platform,
          signature: parseResult.data.signature ?? null,
          downloadUrl: parseResult.data.downloadUrl ?? null,
          fileSize: parseResult.data.fileSize ?? null,
          checksum: parseResult.data.checksum ?? null,
        },
        appId
      );
      return created(c, artifact);
    } catch (error) {
      if (error instanceof ReleaseNotFoundForArtifactError) {
        return notFound(c, "Release", releaseId);
      }
      if (error instanceof ArtifactPlatformConflictError) {
        return conflict(c, error.message);
      }
      console.error("Error creating artifact:", error);
      return internalError(c);
    }
  }
);

/**
 * GET /admin/apps/:app_id/releases/:release_id/artifacts/:artifact_id
 *
 * Retrieves a single artifact by ID.
 *
 * @example
 * GET /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFD/releases/01HQWX5K8J2MXPZ9Y7VBNC3DFE/artifacts/01HQWX5K8J2MXPZ9Y7VBNC3DFF
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFF",
 *     "releaseId": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *     "platform": "darwin-aarch64",
 *     "signature": "dGhpcyBpcyBhIHNpZ25hdHVyZQ==",
 *     "r2Key": null,
 *     "downloadUrl": "https://releases.example.com/my-app/1.2.0/darwin-aarch64.tar.gz",
 *     "fileSize": 52428800,
 *     "checksum": "sha256:abc123def456...",
 *     "createdAt": "2024-01-15T10:00:00.000Z"
 *   }
 * }
 */
artifactsRoutes.get(
  "/:app_id/releases/:release_id/artifacts/:artifact_id",
  async (c) => {
    const appId = c.req.param("app_id");
    const releaseId = c.req.param("release_id");
    const artifactId = c.req.param("artifact_id");

    // Validate IDs
    const appIdResult = ulidSchema.safeParse(appId);
    if (!appIdResult.success) {
      return zodValidationError(c, appIdResult.error);
    }

    const releaseIdResult = ulidSchema.safeParse(releaseId);
    if (!releaseIdResult.success) {
      return zodValidationError(c, releaseIdResult.error);
    }

    const artifactIdResult = ulidSchema.safeParse(artifactId);
    if (!artifactIdResult.success) {
      return zodValidationError(c, artifactIdResult.error);
    }

    try {
      const artifact = await getArtifactById(releaseId, artifactId, appId);
      return success(c, artifact);
    } catch (error) {
      if (error instanceof ReleaseNotFoundForArtifactError) {
        return notFound(c, "Release", releaseId);
      }
      if (error instanceof ArtifactNotFoundError) {
        return notFound(c, "Artifact", artifactId);
      }
      console.error("Error getting artifact:", error);
      return internalError(c);
    }
  }
);

/**
 * DELETE /admin/apps/:app_id/releases/:release_id/artifacts/:artifact_id
 *
 * Deletes an artifact.
 *
 * @example
 * DELETE /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFD/releases/01HQWX5K8J2MXPZ9Y7VBNC3DFE/artifacts/01HQWX5K8J2MXPZ9Y7VBNC3DFF
 *
 * Response (200):
 * {
 *   "success": true,
 *   "data": {
 *     "deleted": true,
 *     "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFF"
 *   }
 * }
 */
artifactsRoutes.delete(
  "/:app_id/releases/:release_id/artifacts/:artifact_id",
  async (c) => {
    const appId = c.req.param("app_id");
    const releaseId = c.req.param("release_id");
    const artifactId = c.req.param("artifact_id");

    // Validate IDs
    const appIdResult = ulidSchema.safeParse(appId);
    if (!appIdResult.success) {
      return zodValidationError(c, appIdResult.error);
    }

    const releaseIdResult = ulidSchema.safeParse(releaseId);
    if (!releaseIdResult.success) {
      return zodValidationError(c, releaseIdResult.error);
    }

    const artifactIdResult = ulidSchema.safeParse(artifactId);
    if (!artifactIdResult.success) {
      return zodValidationError(c, artifactIdResult.error);
    }

    try {
      await deleteArtifact(releaseId, artifactId, appId);
      return success(c, { deleted: true, id: artifactId });
    } catch (error) {
      if (error instanceof ReleaseNotFoundForArtifactError) {
        return notFound(c, "Release", releaseId);
      }
      if (error instanceof ArtifactNotFoundError) {
        return notFound(c, "Artifact", artifactId);
      }
      console.error("Error deleting artifact:", error);
      return internalError(c);
    }
  }
);

/**
 * POST /admin/apps/:app_id/releases/:release_id/artifacts/presign
 *
 * Generates a presigned URL for uploading an artifact directly to R2 storage.
 * This allows clients to upload large files directly to R2 without passing through
 * the API server, improving performance and reducing server load.
 *
 * The workflow is:
 * 1. Call this endpoint to get a presigned upload URL and artifact ID
 * 2. Upload the file directly to R2 using the presigned URL
 * 3. Call the confirm endpoint to verify the upload and activate the artifact
 *
 * Request body:
 * - platform: Target platform (required, e.g., "darwin-aarch64", "windows-x86_64")
 * - filename: Artifact filename (required, e.g., "app-1.2.0-darwin-aarch64.tar.gz")
 * - contentType: Optional MIME type hint (e.g., "application/gzip")
 *
 * @example
 * POST /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFD/releases/01HQWX5K8J2MXPZ9Y7VBNC3DFE/artifacts/presign
 * {
 *   "platform": "darwin-aarch64",
 *   "filename": "my-app-1.2.0-darwin-aarch64.tar.gz",
 *   "contentType": "application/gzip"
 * }
 *
 * Response (201):
 * {
 *   "success": true,
 *   "data": {
 *     "presignedUrl": "https://your-bucket.r2.cloudflarestorage.com/...",
 *     "r2Key": "my-app/releases/1.2.0/my-app-1.2.0-darwin-aarch64.tar.gz",
 *     "artifactId": "01HQWX5K8J2MXPZ9Y7VBNC3DFG"
 *   }
 * }
 *
 * Response (409 if platform already exists):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "CONFLICT",
 *     "message": "An artifact for platform 'darwin-aarch64' already exists for release '01HQWX5K8J2MXPZ9Y7VBNC3DFE'"
 *   }
 * }
 *
 * Response (400 if R2 is not configured):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "VALIDATION_ERROR",
 *     "message": "R2 storage is not configured. Please set R2 environment variables."
 *   }
 * }
 */
artifactsRoutes.post(
  "/:app_id/releases/:release_id/artifacts/presign",
  async (c) => {
    const appId = c.req.param("app_id");
    const releaseId = c.req.param("release_id");

    // Validate IDs
    const appIdResult = ulidSchema.safeParse(appId);
    if (!appIdResult.success) {
      return zodValidationError(c, appIdResult.error);
    }

    const releaseIdResult = ulidSchema.safeParse(releaseId);
    if (!releaseIdResult.success) {
      return zodValidationError(c, releaseIdResult.error);
    }

    // Check if R2 is configured
    if (!isR2Configured()) {
      return validationError(
        c,
        "R2 storage is not configured. Please set R2 environment variables."
      );
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return zodValidationError(
        c,
        new z.ZodError([
          {
            code: "custom",
            message: "Invalid JSON in request body",
            path: [],
          },
        ])
      );
    }

    const parseResult = presignArtifactSchema.safeParse(body);

    if (!parseResult.success) {
      return zodValidationError(c, parseResult.error);
    }

    const { platform, filename, contentType, replaceExisting } = parseResult.data;

    try {
      // Get app slug for R2 key
      const app = await getAppById(appId);

      // Get release version for R2 key
      const release = await getReleaseById(appId, releaseId);

      // Build R2 key: {app_slug}/releases/{version}/{filename}
      const r2Key = buildR2Key(app.slug, release.version, filename);

      // Generate presigned upload URL (valid for 1 hour)
      const presignedUrl = await generatePresignedUploadUrl(
        r2Key,
        3600,
        contentType
      );

      // Create pending artifact record (optionally replacing existing one)
      const artifact = await createPendingArtifact(
        releaseId,
        {
          platform,
          r2Key,
          replaceExisting,
        },
        appId
      );

      const response: PresignArtifactResponse = {
        presignedUrl,
        r2Key,
        artifactId: artifact.id,
      };

      return created(c, response);
    } catch (error) {
      if (error instanceof ReleaseNotFoundForArtifactError) {
        return notFound(c, "Release", releaseId);
      }
      if (error instanceof ArtifactPlatformConflictError) {
        return conflict(c, error.message);
      }
      if (error instanceof R2ConfigurationError) {
        return validationError(c, error.message);
      }
      if (error instanceof R2Error) {
        console.error("R2 error during presign:", error);
        return internalError(c, "Failed to generate presigned URL");
      }
      console.error("Error generating presigned URL:", error);
      return internalError(c);
    }
  }
);

/**
 * POST /admin/apps/:app_id/releases/:release_id/artifacts/:artifact_id/confirm
 *
 * Confirms that an artifact has been uploaded to R2 and activates it.
 * This should be called after successfully uploading the file to the presigned URL.
 *
 * The endpoint will:
 * 1. Verify the artifact exists and is in pending state (has r2Key but no downloadUrl)
 * 2. Check that the file exists in R2
 * 3. Get the file size from R2
 * 4. Update the artifact with the download URL and file size
 *
 * Request body (optional):
 * - signature: Base64-encoded signature for update verification (optional)
 * - checksum: Checksum string, typically "algorithm:hash" (optional)
 *
 * @example
 * POST /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFD/releases/01HQWX5K8J2MXPZ9Y7VBNC3DFE/artifacts/01HQWX5K8J2MXPZ9Y7VBNC3DFG/confirm
 * {
 *   "signature": "dGhpcyBpcyBhIHNpZ25hdHVyZQ==",
 *   "checksum": "sha256:abc123def456..."
 * }
 *
 * Response (200):
 * {
 *   "success": true,
 *   "data": {
 *     "confirmed": true,
 *     "artifact": {
 *       "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFG",
 *       "releaseId": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *       "platform": "darwin-aarch64",
 *       "signature": "dGhpcyBpcyBhIHNpZ25hdHVyZQ==",
 *       "r2Key": "my-app/releases/1.2.0/my-app-1.2.0-darwin-aarch64.tar.gz",
 *       "downloadUrl": "https://cdn.example.com/my-app/releases/1.2.0/my-app-1.2.0-darwin-aarch64.tar.gz",
 *       "fileSize": 52428800,
 *       "checksum": "sha256:abc123def456...",
 *       "createdAt": "2024-01-15T10:00:00.000Z"
 *     }
 *   }
 * }
 *
 * Response (404 if artifact not found or file not in R2):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "NOT_FOUND",
 *     "message": "Artifact file not found in storage at 'my-app/releases/1.2.0/file.tar.gz'"
 *   }
 * }
 *
 * Response (400 if artifact already confirmed):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "VALIDATION_ERROR",
 *     "message": "Artifact '01HQWX5K8J2MXPZ9Y7VBNC3DFG' is not in pending state or already has a download URL"
 *   }
 * }
 */
artifactsRoutes.post(
  "/:app_id/releases/:release_id/artifacts/:artifact_id/confirm",
  async (c) => {
    const appId = c.req.param("app_id");
    const releaseId = c.req.param("release_id");
    const artifactId = c.req.param("artifact_id");

    // Validate IDs
    const appIdResult = ulidSchema.safeParse(appId);
    if (!appIdResult.success) {
      return zodValidationError(c, appIdResult.error);
    }

    const releaseIdResult = ulidSchema.safeParse(releaseId);
    if (!releaseIdResult.success) {
      return zodValidationError(c, releaseIdResult.error);
    }

    const artifactIdResult = ulidSchema.safeParse(artifactId);
    if (!artifactIdResult.success) {
      return zodValidationError(c, artifactIdResult.error);
    }

    // Parse optional body
    let body: unknown = {};
    try {
      const contentType = c.req.header("content-type");
      if (contentType && contentType.includes("application/json")) {
        body = await c.req.json();
      }
    } catch {
      return zodValidationError(
        c,
        new z.ZodError([
          {
            code: "custom",
            message: "Invalid JSON in request body",
            path: [],
          },
        ])
      );
    }

    const parseResult = confirmUploadSchema.safeParse(body);

    if (!parseResult.success) {
      return zodValidationError(c, parseResult.error);
    }

    try {
      const artifact = await confirmArtifactUpload(
        releaseId,
        artifactId,
        {
          signature: parseResult.data.signature ?? null,
          checksum: parseResult.data.checksum ?? null,
        },
        appId
      );

      const response: ConfirmUploadResponse = {
        confirmed: true,
        artifact,
      };

      return success(c, response);
    } catch (error) {
      if (error instanceof ReleaseNotFoundForArtifactError) {
        return notFound(c, "Release", releaseId);
      }
      if (error instanceof ArtifactNotFoundError) {
        return notFound(c, "Artifact", artifactId);
      }
      if (error instanceof ArtifactNotPendingError) {
        return validationError(c, error.message);
      }
      if (error instanceof ArtifactUploadNotFoundError) {
        return notFound(c, "Artifact file in storage", error.message);
      }
      if (error instanceof R2Error) {
        console.error("R2 error during confirm:", error);
        return internalError(c, "Failed to verify upload in storage");
      }
      console.error("Error confirming artifact upload:", error);
      return internalError(c);
    }
  }
);
