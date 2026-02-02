import { Hono } from "hono";
import { z } from "zod";
import {
  authMiddleware,
  requireCiOrAdminScope,
  requireCiAppAccess,
  type AuthVariables,
} from "../../middleware/auth.js";
import { ciRateLimiter } from "../../middleware/rate-limit.js";
import {
  created,
  notFound,
  conflict,
  zodValidationError,
  internalError,
  validationError,
} from "../../utils/response.js";
import {
  ciReleaseSchema,
  appSlugSchema,
} from "../../types/index.js";
import type {
  CiReleaseResponse,
  CiReleaseArtifact,
  Platform,
} from "../../types/index.js";
import {
  getAppBySlug,
  getRawAppBySlug,
  AppNotFoundError,
} from "../../services/app.service.js";
import {
  createRelease,
  publishRelease,
  deleteRelease,
  ReleaseVersionConflictError,
  AppNotFoundForReleaseError,
  ReleaseStatusError,
} from "../../services/release.service.js";
import { db, artifacts } from "../../db/index.js";
import { ulid } from "ulid";
import {
  fileExists,
  getFileInfo,
  getPublicUrl,
  generatePresignedDownloadUrl,
  isR2Configured,
  R2Error,
} from "../../services/r2.service.js";

/**
 * CI routes for GitHub Actions and other CI/CD pipelines.
 *
 * These routes provide a convenience API for CI pipelines to create releases
 * with artifacts in a single operation. The workflow is:
 *
 * 1. CI uploads artifact files directly to R2 using presigned URLs or SDK
 * 2. CI calls POST /ci/apps/:app_slug/releases with release info and R2 keys
 * 3. The server verifies artifacts exist in R2 and creates the release
 *
 * Authentication:
 * - Requires a CI-scoped or admin-scoped API key
 * - CI keys can only access their assigned app (by slug)
 * - Admin keys have access to all apps
 */
export const ciRoutes = new Hono<{ Variables: AuthVariables }>();

// Apply authentication middleware to all CI routes
ciRoutes.use("*", authMiddleware);

// Apply rate limiting to all CI routes
ciRoutes.use("*", ciRateLimiter);

// Apply CI or admin scope check to all routes
ciRoutes.use("*", requireCiOrAdminScope());

/**
 * Resolves an app slug to an app ID.
 * Used by the requireCiAppAccess middleware.
 */
async function resolveAppSlugToId(slug: string): Promise<string | null> {
  const app = await getRawAppBySlug(slug);
  return app?.id ?? null;
}

// Apply app access check with slug resolution
ciRoutes.use("/:app_slug/*", requireCiAppAccess("app_slug", resolveAppSlugToId));

/**
 * POST /ci/apps/:app_slug/releases
 *
 * Creates a release and registers artifacts in a single operation.
 *
 * This is a convenience endpoint for CI pipelines. The workflow is:
 * 1. CI uploads files directly to R2 (using presigned URLs or SDK)
 * 2. CI calls this endpoint with release info and R2 keys for each artifact
 * 3. Server verifies each artifact exists in R2
 * 4. Server creates the release (in draft) and artifact records
 * 5. If auto_publish is true, server publishes the release
 *
 * Request body:
 * {
 *   "version": "1.2.0",
 *   "notes": "### What's New\n\n- Feature X",
 *   "artifacts": [
 *     {
 *       "platform": "darwin-aarch64",
 *       "signature": "base64...",
 *       "r2_key": "my-app/releases/1.2.0/app-darwin-aarch64.tar.gz"
 *     }
 *   ],
 *   "auto_publish": false
 * }
 *
 * @example
 * POST /ci/apps/my-app/releases
 * Authorization: Bearer uk_live_xxx
 *
 * Response (201):
 * {
 *   "success": true,
 *   "data": {
 *     "release": {
 *       "id": "01HQWX...",
 *       "appId": "01HQWX...",
 *       "version": "1.2.0",
 *       "notes": "### What's New...",
 *       "pubDate": null,
 *       "status": "draft",
 *       "createdAt": "2024-01-15T10:00:00.000Z",
 *       "updatedAt": "2024-01-15T10:00:00.000Z"
 *     },
 *     "artifacts": [
 *       {
 *         "id": "01HQWX...",
 *         "platform": "darwin-aarch64",
 *         "signature": "base64...",
 *         "r2Key": "my-app/releases/1.2.0/app-darwin-aarch64.tar.gz",
 *         "downloadUrl": "https://cdn.example.com/...",
 *         "fileSize": 52428800,
 *         "createdAt": "2024-01-15T10:00:00.000Z"
 *       }
 *     ]
 *   }
 * }
 *
 * Response (400 if R2 not configured):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "VALIDATION_ERROR",
 *     "message": "R2 storage is not configured"
 *   }
 * }
 *
 * Response (400 if artifact not found in R2):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "VALIDATION_ERROR",
 *     "message": "Artifact file not found in R2 at 'my-app/releases/1.2.0/app-darwin-aarch64.tar.gz'"
 *   }
 * }
 *
 * Response (404 if app not found):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "NOT_FOUND",
 *     "message": "App with identifier 'my-app' was not found"
 *   }
 * }
 *
 * Response (409 if version exists):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "CONFLICT",
 *     "message": "Release version '1.2.0' already exists for app '01HQWX...'"
 *   }
 * }
 */
ciRoutes.post("/:app_slug/releases", async (c) => {
  const appSlug = c.req.param("app_slug");

  // Validate app slug format
  const slugResult = appSlugSchema.safeParse(appSlug);
  if (!slugResult.success) {
    return zodValidationError(c, slugResult.error);
  }

  // Check if R2 is configured
  if (!isR2Configured()) {
    return validationError(
      c,
      "R2 storage is not configured. Please set R2 environment variables."
    );
  }

  // Parse request body
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

  const parseResult = ciReleaseSchema.safeParse(body);
  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  const { version, notes, artifacts: artifactInputs, auto_publish } = parseResult.data;

  // Look up the app by slug
  let app;
  try {
    app = await getAppBySlug(appSlug);
  } catch (error) {
    if (error instanceof AppNotFoundError) {
      return notFound(c, "App", appSlug);
    }
    console.error("Error looking up app:", error);
    return internalError(c);
  }

  // Check for duplicate platforms in input
  const platformSet = new Set<string>();
  for (const artifact of artifactInputs) {
    if (platformSet.has(artifact.platform)) {
      return validationError(
        c,
        `Duplicate platform '${artifact.platform}' in artifacts array`
      );
    }
    platformSet.add(artifact.platform);
  }

  // Verify each artifact exists in R2 and collect file info
  const artifactFileInfo: Map<string, { size: number }> = new Map();

  for (const artifact of artifactInputs) {
    try {
      const exists = await fileExists(artifact.r2_key);
      if (!exists) {
        return validationError(
          c,
          `Artifact file not found in R2 at '${artifact.r2_key}'`
        );
      }

      // Get file info for later
      const fileInfo = await getFileInfo(artifact.r2_key);
      artifactFileInfo.set(artifact.r2_key, { size: fileInfo.size });
    } catch (error) {
      if (error instanceof R2Error) {
        console.error("R2 error verifying artifact:", error);
        return validationError(
          c,
          `Failed to verify artifact in R2: ${artifact.r2_key}`
        );
      }
      throw error;
    }
  }

  // Create the release in draft status
  let release;
  try {
    release = await createRelease(app.id, {
      version,
      notes: notes ?? null,
    });
  } catch (error) {
    if (error instanceof AppNotFoundForReleaseError) {
      return notFound(c, "App", app.id);
    }
    if (error instanceof ReleaseVersionConflictError) {
      return conflict(c, error.message);
    }
    console.error("Error creating release:", error);
    return internalError(c);
  }

  // Create artifact records for each artifact
  const createdArtifacts: CiReleaseArtifact[] = [];
  const now = new Date();

  for (const artifactInput of artifactInputs) {
    const fileInfo = artifactFileInfo.get(artifactInput.r2_key);
    const fileSize = fileInfo?.size ?? null;

    // Generate download URL - use public URL if available, otherwise generate presigned URL
    let downloadUrl: string | null = null;
    try {
      const publicUrl = getPublicUrl(artifactInput.r2_key);
      if (publicUrl) {
        downloadUrl = publicUrl;
      } else {
        // Generate a long-lived presigned URL (7 days)
        downloadUrl = await generatePresignedDownloadUrl(artifactInput.r2_key, 604800);
      }
    } catch (error) {
      console.error("Error generating download URL:", error);
      // Continue without download URL - it can be set later
    }

    const artifactId = ulid();

    // Insert artifact directly into database
    try {
      await db.insert(artifacts).values({
        id: artifactId,
        releaseId: release.id,
        platform: artifactInput.platform,
        signature: artifactInput.signature,
        r2Key: artifactInput.r2_key,
        downloadUrl,
        fileSize,
        checksum: null,
        createdAt: now,
      });

      createdArtifacts.push({
        id: artifactId,
        platform: artifactInput.platform as Platform,
        signature: artifactInput.signature,
        r2Key: artifactInput.r2_key,
        downloadUrl,
        fileSize,
        createdAt: now.toISOString(),
      });
    } catch (error) {
      // If artifact creation fails, attempt to clean up the release
      console.error("Error creating artifact:", error);

      try {
        // Only delete if it's still a draft
        await deleteRelease(app.id, release.id);
      } catch (cleanupError) {
        console.error("Failed to cleanup release after artifact creation failed:", cleanupError);
      }

      // Check if it was a platform conflict (race condition)
      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint failed")
      ) {
        return conflict(
          c,
          `An artifact for platform '${artifactInput.platform}' already exists for this release`
        );
      }

      return internalError(c, "Failed to create artifact record");
    }
  }

  // If auto_publish is true, publish the release
  if (auto_publish) {
    try {
      const publishedRelease = await publishRelease(app.id, release.id);

      const response: CiReleaseResponse = {
        release: {
          id: publishedRelease.id,
          appId: publishedRelease.appId,
          version: publishedRelease.version,
          notes: publishedRelease.notes,
          pubDate: publishedRelease.pubDate,
          status: publishedRelease.status,
          createdAt: publishedRelease.createdAt,
          updatedAt: publishedRelease.updatedAt,
        },
        artifacts: createdArtifacts,
      };

      return created(c, response);
    } catch (error) {
      if (error instanceof ReleaseStatusError) {
        // Release is in an unexpected state - return what we have
        console.error("Failed to auto-publish release:", error);
      } else {
        console.error("Error publishing release:", error);
      }

      // Even if publish fails, the release and artifacts were created successfully
      // Return them as draft
    }
  }

  // Return the created release and artifacts
  const response: CiReleaseResponse = {
    release: {
      id: release.id,
      appId: release.appId,
      version: release.version,
      notes: release.notes,
      pubDate: release.pubDate,
      status: release.status,
      createdAt: release.createdAt,
      updatedAt: release.updatedAt,
    },
    artifacts: createdArtifacts,
  };

  return created(c, response);
});
