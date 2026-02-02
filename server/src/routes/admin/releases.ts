import { Hono } from "hono";
import { z } from "zod";
import {
  createRelease,
  getReleaseById,
  listReleases,
  updateRelease,
  deleteRelease,
  publishRelease,
  archiveRelease,
  ReleaseNotFoundError,
  ReleaseVersionConflictError,
  ReleaseStatusError,
  AppNotFoundForReleaseError,
} from "../../services/release.service.js";
import {
  success,
  created,
  notFound,
  conflict,
  zodValidationError,
  paginated,
  internalError,
} from "../../utils/response.js";
import {
  createReleaseSchema,
  updateReleaseSchema,
  listReleasesQuerySchema,
  ulidSchema,
} from "../../types/index.js";
import type { AuthVariables } from "../../middleware/auth.js";
import { requireAppAccess } from "../../middleware/auth.js";

/**
 * Admin routes for managing releases.
 *
 * All routes require authentication via authMiddleware.
 * App-scoped keys can only access releases for their assigned app.
 */
export const releasesRoutes = new Hono<{ Variables: AuthVariables }>();

// Apply app access middleware to all routes
releasesRoutes.use("/:app_id/*", requireAppAccess("app_id"));

/**
 * GET /admin/apps/:app_id/releases
 *
 * Lists releases for an app with optional status filter and pagination.
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - status: Filter by status - "draft", "published", or "archived" (optional)
 *
 * @example
 * GET /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFD/releases?status=published&page=1&limit=10
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "items": [
 *       {
 *         "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *         "appId": "01HQWX5K8J2MXPZ9Y7VBNC3DFD",
 *         "version": "1.2.0",
 *         "notes": "Bug fixes and improvements",
 *         "pubDate": "2024-01-15T10:30:00.000Z",
 *         "status": "published",
 *         "createdAt": "2024-01-10T10:00:00.000Z",
 *         "updatedAt": "2024-01-15T10:30:00.000Z"
 *       }
 *     ],
 *     "pagination": {
 *       "page": 1,
 *       "limit": 10,
 *       "total": 25,
 *       "totalPages": 3
 *     }
 *   }
 * }
 */
releasesRoutes.get("/:app_id/releases", async (c) => {
  const appId = c.req.param("app_id");

  // Validate app_id format
  const appIdResult = ulidSchema.safeParse(appId);
  if (!appIdResult.success) {
    return zodValidationError(c, appIdResult.error);
  }

  const queryParams = {
    page: c.req.query("page"),
    limit: c.req.query("limit"),
    status: c.req.query("status"),
  };

  const parseResult = listReleasesQuerySchema.safeParse(queryParams);

  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  const { page, limit, status } = parseResult.data;

  try {
    // Build options object, only including status if it's defined
    const options: { page: number; limit: number; status?: "draft" | "published" | "archived" } = {
      page,
      limit,
    };
    if (status !== undefined) {
      options.status = status;
    }
    const { items, total } = await listReleases(appId, options);
    return paginated(c, items, page, limit, total);
  } catch (error) {
    console.error("Error listing releases:", error);
    return internalError(c);
  }
});

/**
 * GET /admin/apps/:app_id/releases/:release_id
 *
 * Retrieves a single release by ID.
 *
 * @example
 * GET /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFD/releases/01HQWX5K8J2MXPZ9Y7VBNC3DFE
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *     "appId": "01HQWX5K8J2MXPZ9Y7VBNC3DFD",
 *     "version": "1.2.0",
 *     "notes": "Bug fixes and improvements",
 *     "pubDate": "2024-01-15T10:30:00.000Z",
 *     "status": "published",
 *     "createdAt": "2024-01-10T10:00:00.000Z",
 *     "updatedAt": "2024-01-15T10:30:00.000Z"
 *   }
 * }
 */
releasesRoutes.get("/:app_id/releases/:release_id", async (c) => {
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
    const release = await getReleaseById(appId, releaseId);
    return success(c, release);
  } catch (error) {
    if (error instanceof ReleaseNotFoundError) {
      return notFound(c, "Release", releaseId);
    }
    console.error("Error getting release:", error);
    return internalError(c);
  }
});

/**
 * POST /admin/apps/:app_id/releases
 *
 * Creates a new release in draft status.
 *
 * Request body:
 * - version: Semantic version string (required, e.g., "1.2.0")
 * - notes: Release notes in markdown format (optional)
 *
 * @example
 * POST /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFD/releases
 * {
 *   "version": "1.3.0",
 *   "notes": "## New Features\n- Added dark mode\n- Improved performance"
 * }
 *
 * Response (201):
 * {
 *   "success": true,
 *   "data": {
 *     "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFF",
 *     "appId": "01HQWX5K8J2MXPZ9Y7VBNC3DFD",
 *     "version": "1.3.0",
 *     "notes": "## New Features\n- Added dark mode\n- Improved performance",
 *     "pubDate": null,
 *     "status": "draft",
 *     "createdAt": "2024-01-16T10:00:00.000Z",
 *     "updatedAt": "2024-01-16T10:00:00.000Z"
 *   }
 * }
 */
releasesRoutes.post("/:app_id/releases", async (c) => {
  const appId = c.req.param("app_id");

  // Validate app_id format
  const appIdResult = ulidSchema.safeParse(appId);
  if (!appIdResult.success) {
    return zodValidationError(c, appIdResult.error);
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

  const parseResult = createReleaseSchema.safeParse(body);

  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  try {
    const release = await createRelease(appId, {
      version: parseResult.data.version,
      notes: parseResult.data.notes ?? null,
    });
    return created(c, release);
  } catch (error) {
    if (error instanceof AppNotFoundForReleaseError) {
      return notFound(c, "App", appId);
    }
    if (error instanceof ReleaseVersionConflictError) {
      return conflict(c, error.message);
    }
    console.error("Error creating release:", error);
    return internalError(c);
  }
});

/**
 * PATCH /admin/apps/:app_id/releases/:release_id
 *
 * Updates a release.
 *
 * Request body (all fields optional):
 * - notes: New release notes (null to remove)
 * - status: New status (use publish/archive endpoints for status changes)
 *
 * @example
 * PATCH /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFD/releases/01HQWX5K8J2MXPZ9Y7VBNC3DFE
 * {
 *   "notes": "Updated release notes with more details"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *     "appId": "01HQWX5K8J2MXPZ9Y7VBNC3DFD",
 *     "version": "1.2.0",
 *     "notes": "Updated release notes with more details",
 *     "pubDate": null,
 *     "status": "draft",
 *     "createdAt": "2024-01-10T10:00:00.000Z",
 *     "updatedAt": "2024-01-16T12:00:00.000Z"
 *   }
 * }
 */
releasesRoutes.patch("/:app_id/releases/:release_id", async (c) => {
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

  const parseResult = updateReleaseSchema.safeParse(body);

  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  // Check if there's anything to update
  const parsedData = parseResult.data;
  if (parsedData.notes === undefined && parsedData.status === undefined) {
    return zodValidationError(
      c,
      new z.ZodError([
        {
          code: "custom",
          message: "At least one field must be provided for update",
          path: [],
        },
      ])
    );
  }

  // Build update data object, only including defined fields
  const updateData: { notes?: string | null; status?: "draft" | "published" | "archived" } = {};
  if (parsedData.notes !== undefined) {
    updateData.notes = parsedData.notes;
  }
  if (parsedData.status !== undefined) {
    updateData.status = parsedData.status;
  }

  try {
    const release = await updateRelease(appId, releaseId, updateData);
    return success(c, release);
  } catch (error) {
    if (error instanceof ReleaseNotFoundError) {
      return notFound(c, "Release", releaseId);
    }
    console.error("Error updating release:", error);
    return internalError(c);
  }
});

/**
 * DELETE /admin/apps/:app_id/releases/:release_id
 *
 * Deletes a release. Only draft releases can be deleted.
 *
 * @example
 * DELETE /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFD/releases/01HQWX5K8J2MXPZ9Y7VBNC3DFE
 *
 * Response (200):
 * {
 *   "success": true,
 *   "data": {
 *     "deleted": true,
 *     "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFE"
 *   }
 * }
 *
 * Response (409 if not draft):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "CONFLICT",
 *     "message": "Cannot delete release in 'published' status. Only draft releases can be deleted."
 *   }
 * }
 */
releasesRoutes.delete("/:app_id/releases/:release_id", async (c) => {
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
    await deleteRelease(appId, releaseId);
    return success(c, { deleted: true, id: releaseId });
  } catch (error) {
    if (error instanceof ReleaseNotFoundError) {
      return notFound(c, "Release", releaseId);
    }
    if (error instanceof ReleaseStatusError) {
      return conflict(c, error.message);
    }
    console.error("Error deleting release:", error);
    return internalError(c);
  }
});

/**
 * POST /admin/apps/:app_id/releases/:release_id/publish
 *
 * Publishes a release by setting status to 'published' and pubDate to now.
 * Only draft releases can be published.
 *
 * @example
 * POST /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFD/releases/01HQWX5K8J2MXPZ9Y7VBNC3DFE/publish
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *     "appId": "01HQWX5K8J2MXPZ9Y7VBNC3DFD",
 *     "version": "1.2.0",
 *     "notes": "Bug fixes and improvements",
 *     "pubDate": "2024-01-16T12:00:00.000Z",
 *     "status": "published",
 *     "createdAt": "2024-01-10T10:00:00.000Z",
 *     "updatedAt": "2024-01-16T12:00:00.000Z"
 *   }
 * }
 */
releasesRoutes.post("/:app_id/releases/:release_id/publish", async (c) => {
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
    const release = await publishRelease(appId, releaseId);
    return success(c, release);
  } catch (error) {
    if (error instanceof ReleaseNotFoundError) {
      return notFound(c, "Release", releaseId);
    }
    if (error instanceof ReleaseStatusError) {
      return conflict(c, error.message);
    }
    console.error("Error publishing release:", error);
    return internalError(c);
  }
});

/**
 * POST /admin/apps/:app_id/releases/:release_id/archive
 *
 * Archives a release by setting status to 'archived'.
 * Both draft and published releases can be archived.
 *
 * @example
 * POST /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFD/releases/01HQWX5K8J2MXPZ9Y7VBNC3DFE/archive
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *     "appId": "01HQWX5K8J2MXPZ9Y7VBNC3DFD",
 *     "version": "1.2.0",
 *     "notes": "Bug fixes and improvements",
 *     "pubDate": "2024-01-15T10:30:00.000Z",
 *     "status": "archived",
 *     "createdAt": "2024-01-10T10:00:00.000Z",
 *     "updatedAt": "2024-01-16T12:00:00.000Z"
 *   }
 * }
 */
releasesRoutes.post("/:app_id/releases/:release_id/archive", async (c) => {
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
    const release = await archiveRelease(appId, releaseId);
    return success(c, release);
  } catch (error) {
    if (error instanceof ReleaseNotFoundError) {
      return notFound(c, "Release", releaseId);
    }
    if (error instanceof ReleaseStatusError) {
      return conflict(c, error.message);
    }
    console.error("Error archiving release:", error);
    return internalError(c);
  }
});
