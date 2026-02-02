import { Hono } from "hono";
import { z } from "zod";
import {
  listInstallers,
  createPendingInstaller,
  confirmInstallerUpload,
  deleteInstaller,
  InstallerNotFoundError,
  InstallerPlatformConflictError,
  ReleaseNotFoundForInstallerError,
  InstallerUploadNotFoundError,
  InstallerNotPendingError,
} from "../../services/installer.service.js";
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
  ulidSchema,
  presignInstallerSchema,
  confirmInstallerUploadSchema,
} from "../../types/index.js";
import type {
  PresignInstallerResponse,
  ConfirmInstallerUploadResponse,
} from "../../types/index.js";
import type { AuthVariables } from "../../middleware/auth.js";
import { requireAppAccess } from "../../middleware/auth.js";
import { getAppById } from "../../services/app.service.js";
import { getReleaseById } from "../../services/release.service.js";
import {
  buildInstallerR2Key,
  generatePresignedUploadUrl,
  isR2Configured,
  R2Error,
  R2ConfigurationError,
} from "../../services/r2.service.js";

/**
 * Admin routes for managing installers.
 *
 * All routes require authentication via authMiddleware.
 * App-scoped keys can only access installers for releases belonging to their assigned app.
 */
export const installersRoutes = new Hono<{ Variables: AuthVariables }>();

// Apply app access middleware to all routes
installersRoutes.use("/:app_id/*", requireAppAccess("app_id"));

/**
 * GET /admin/apps/:app_id/releases/:release_id/installers
 *
 * Lists all installers for a release.
 *
 * @example
 * GET /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFD/releases/01HQWX5K8J2MXPZ9Y7VBNC3DFE/installers
 *
 * Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFF",
 *       "releaseId": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *       "platform": "darwin-aarch64",
 *       "filename": "MyApp-1.2.0-arm64.dmg",
 *       "displayName": "MyApp for Apple Silicon",
 *       "r2Key": "my-app/installers/1.2.0/MyApp-1.2.0-arm64.dmg",
 *       "downloadUrl": "https://cdn.example.com/...",
 *       "fileSize": 52428800,
 *       "checksum": "sha256:abc123...",
 *       "createdAt": "2024-01-15T10:00:00.000Z"
 *     }
 *   ]
 * }
 */
installersRoutes.get(
  "/:app_id/releases/:release_id/installers",
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
      const installers = await listInstallers(releaseId, appId);
      return success(c, installers);
    } catch (error) {
      if (error instanceof ReleaseNotFoundForInstallerError) {
        return notFound(c, "Release", releaseId);
      }
      console.error("Error listing installers:", error);
      return internalError(c);
    }
  }
);

/**
 * POST /admin/apps/:app_id/releases/:release_id/installers/presign
 *
 * Generates a presigned URL for uploading an installer directly to R2 storage.
 * This allows clients to upload large files directly to R2 without passing through
 * the API server, improving performance and reducing server load.
 *
 * The workflow is:
 * 1. Call this endpoint to get a presigned upload URL and installer ID
 * 2. Upload the file directly to R2 using the presigned URL
 * 3. Call the confirm endpoint to verify the upload and activate the installer
 *
 * Request body:
 * - platform: Target platform (required, e.g., "darwin-aarch64", "darwin-universal")
 * - filename: Installer filename (required, e.g., "MyApp-1.2.0.dmg")
 * - displayName: Optional friendly name for the installer
 * - contentType: Optional MIME type hint (e.g., "application/octet-stream")
 * - replaceExisting: If true, replaces any existing installer for the same platform
 *
 * @example
 * POST /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFD/releases/01HQWX5K8J2MXPZ9Y7VBNC3DFE/installers/presign
 * {
 *   "platform": "darwin-aarch64",
 *   "filename": "MyApp-1.2.0-arm64.dmg",
 *   "displayName": "MyApp for Apple Silicon",
 *   "contentType": "application/octet-stream"
 * }
 *
 * Response (201):
 * {
 *   "success": true,
 *   "data": {
 *     "presignedUrl": "https://your-bucket.r2.cloudflarestorage.com/...",
 *     "r2Key": "my-app/installers/1.2.0/MyApp-1.2.0-arm64.dmg",
 *     "installerId": "01HQWX5K8J2MXPZ9Y7VBNC3DFG"
 *   }
 * }
 *
 * Response (409 if platform already exists):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "CONFLICT",
 *     "message": "An installer for platform 'darwin-aarch64' already exists for release '01HQWX5K8J2MXPZ9Y7VBNC3DFE'"
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
installersRoutes.post(
  "/:app_id/releases/:release_id/installers/presign",
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

    const parseResult = presignInstallerSchema.safeParse(body);

    if (!parseResult.success) {
      return zodValidationError(c, parseResult.error);
    }

    const { platform, filename, displayName, contentType, replaceExisting } = parseResult.data;

    try {
      // Get app slug for R2 key
      const app = await getAppById(appId);

      // Get release version for R2 key
      const release = await getReleaseById(appId, releaseId);

      // Build R2 key: {app_slug}/installers/{version}/{filename}
      const r2Key = buildInstallerR2Key(app.slug, release.version, filename);

      // Generate presigned upload URL (valid for 1 hour)
      const presignedUrl = await generatePresignedUploadUrl(
        r2Key,
        3600,
        contentType
      );

      // Create pending installer record (optionally replacing existing one)
      const installer = await createPendingInstaller(
        releaseId,
        {
          platform,
          filename,
          displayName: displayName ?? null,
          r2Key,
          replaceExisting,
        },
        appId
      );

      const response: PresignInstallerResponse = {
        presignedUrl,
        r2Key,
        installerId: installer.id,
      };

      return created(c, response);
    } catch (error) {
      if (error instanceof ReleaseNotFoundForInstallerError) {
        return notFound(c, "Release", releaseId);
      }
      if (error instanceof InstallerPlatformConflictError) {
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
 * POST /admin/apps/:app_id/releases/:release_id/installers/:installer_id/confirm
 *
 * Confirms that an installer has been uploaded to R2 and activates it.
 * This should be called after successfully uploading the file to the presigned URL.
 *
 * The endpoint will:
 * 1. Verify the installer exists and is in pending state (has r2Key but no downloadUrl)
 * 2. Check that the file exists in R2
 * 3. Get the file size from R2
 * 4. Update the installer with the download URL and file size
 *
 * Request body (optional):
 * - checksum: Checksum string, typically "algorithm:hash" (optional)
 *
 * @example
 * POST /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFD/releases/01HQWX5K8J2MXPZ9Y7VBNC3DFE/installers/01HQWX5K8J2MXPZ9Y7VBNC3DFG/confirm
 * {
 *   "checksum": "sha256:abc123def456..."
 * }
 *
 * Response (200):
 * {
 *   "success": true,
 *   "data": {
 *     "confirmed": true,
 *     "installer": {
 *       "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFG",
 *       "releaseId": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *       "platform": "darwin-aarch64",
 *       "filename": "MyApp-1.2.0-arm64.dmg",
 *       "displayName": "MyApp for Apple Silicon",
 *       "r2Key": "my-app/installers/1.2.0/MyApp-1.2.0-arm64.dmg",
 *       "downloadUrl": "https://cdn.example.com/...",
 *       "fileSize": 52428800,
 *       "checksum": "sha256:abc123def456...",
 *       "createdAt": "2024-01-15T10:00:00.000Z"
 *     }
 *   }
 * }
 *
 * Response (404 if installer not found or file not in R2):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "NOT_FOUND",
 *     "message": "Installer file not found in storage at 'my-app/installers/1.2.0/file.dmg'"
 *   }
 * }
 *
 * Response (400 if installer already confirmed):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "VALIDATION_ERROR",
 *     "message": "Installer '01HQWX5K8J2MXPZ9Y7VBNC3DFG' is not in pending state or already has a download URL"
 *   }
 * }
 */
installersRoutes.post(
  "/:app_id/releases/:release_id/installers/:installer_id/confirm",
  async (c) => {
    const appId = c.req.param("app_id");
    const releaseId = c.req.param("release_id");
    const installerId = c.req.param("installer_id");

    // Validate IDs
    const appIdResult = ulidSchema.safeParse(appId);
    if (!appIdResult.success) {
      return zodValidationError(c, appIdResult.error);
    }

    const releaseIdResult = ulidSchema.safeParse(releaseId);
    if (!releaseIdResult.success) {
      return zodValidationError(c, releaseIdResult.error);
    }

    const installerIdResult = ulidSchema.safeParse(installerId);
    if (!installerIdResult.success) {
      return zodValidationError(c, installerIdResult.error);
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

    const parseResult = confirmInstallerUploadSchema.safeParse(body);

    if (!parseResult.success) {
      return zodValidationError(c, parseResult.error);
    }

    try {
      const installer = await confirmInstallerUpload(
        releaseId,
        installerId,
        {
          checksum: parseResult.data.checksum ?? null,
        },
        appId
      );

      const response: ConfirmInstallerUploadResponse = {
        confirmed: true,
        installer,
      };

      return success(c, response);
    } catch (error) {
      if (error instanceof ReleaseNotFoundForInstallerError) {
        return notFound(c, "Release", releaseId);
      }
      if (error instanceof InstallerNotFoundError) {
        return notFound(c, "Installer", installerId);
      }
      if (error instanceof InstallerNotPendingError) {
        return validationError(c, error.message);
      }
      if (error instanceof InstallerUploadNotFoundError) {
        return notFound(c, "Installer file in storage", error.message);
      }
      if (error instanceof R2Error) {
        console.error("R2 error during confirm:", error);
        return internalError(c, "Failed to verify upload in storage");
      }
      console.error("Error confirming installer upload:", error);
      return internalError(c);
    }
  }
);

/**
 * DELETE /admin/apps/:app_id/releases/:release_id/installers/:installer_id
 *
 * Deletes an installer and its associated file from R2 storage.
 *
 * @example
 * DELETE /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFD/releases/01HQWX5K8J2MXPZ9Y7VBNC3DFE/installers/01HQWX5K8J2MXPZ9Y7VBNC3DFF
 *
 * Response (200):
 * {
 *   "success": true,
 *   "data": null
 * }
 */
installersRoutes.delete(
  "/:app_id/releases/:release_id/installers/:installer_id",
  async (c) => {
    const appId = c.req.param("app_id");
    const releaseId = c.req.param("release_id");
    const installerId = c.req.param("installer_id");

    // Validate IDs
    const appIdResult = ulidSchema.safeParse(appId);
    if (!appIdResult.success) {
      return zodValidationError(c, appIdResult.error);
    }

    const releaseIdResult = ulidSchema.safeParse(releaseId);
    if (!releaseIdResult.success) {
      return zodValidationError(c, releaseIdResult.error);
    }

    const installerIdResult = ulidSchema.safeParse(installerId);
    if (!installerIdResult.success) {
      return zodValidationError(c, installerIdResult.error);
    }

    try {
      // First verify the release belongs to the app (for authorization)
      await getReleaseById(appId, releaseId);

      // Delete the installer
      await deleteInstaller(installerId);
      return success(c, null);
    } catch (error) {
      if (error instanceof ReleaseNotFoundForInstallerError) {
        return notFound(c, "Release", releaseId);
      }
      if (error instanceof InstallerNotFoundError) {
        return notFound(c, "Installer", installerId);
      }
      console.error("Error deleting installer:", error);
      return internalError(c);
    }
  }
);
