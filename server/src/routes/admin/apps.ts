import { Hono } from "hono";
import { z } from "zod";
import {
  createApp,
  getAppById,
  listApps,
  updateApp,
  deleteApp,
  AppNotFoundError,
  AppSlugConflictError,
  AppHasPublishedReleasesError,
} from "../../services/app.service.js";
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
  createAppSchema,
  updateAppSchema,
  paginationSchema,
} from "../../types/index.js";

/**
 * Admin routes for managing applications.
 *
 * All routes require admin authentication (to be implemented in middleware).
 */
export const appsRoutes = new Hono();

/**
 * GET /admin/apps
 *
 * Lists all applications with pagination.
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 *
 * @example
 * GET /admin/apps?page=1&limit=10
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "items": [...],
 *     "pagination": {
 *       "page": 1,
 *       "limit": 10,
 *       "total": 25,
 *       "totalPages": 3
 *     }
 *   }
 * }
 */
appsRoutes.get("/", async (c) => {
  // Parse and validate query parameters
  const queryParams = {
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  };

  const parseResult = paginationSchema.safeParse(queryParams);

  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  const { page, limit } = parseResult.data;

  try {
    const { items, total } = await listApps(page, limit);
    return paginated(c, items, page, limit, total);
  } catch (error) {
    console.error("Error listing apps:", error);
    return internalError(c);
  }
});

/**
 * GET /admin/apps/:app_id
 *
 * Retrieves a single application by ID.
 *
 * @example
 * GET /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFE
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *     "slug": "my-app",
 *     "name": "My Application",
 *     "description": "A great app",
 *     "publicKey": null,
 *     "createdAt": "2024-01-15T10:30:00.000Z",
 *     "updatedAt": "2024-01-15T10:30:00.000Z"
 *   }
 * }
 */
appsRoutes.get("/:app_id", async (c) => {
  const appId = c.req.param("app_id");

  // Validate app_id format (ULID is 26 characters)
  const idSchema = z.string().length(26, "Invalid app ID format");
  const parseResult = idSchema.safeParse(appId);

  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  try {
    const app = await getAppById(appId);
    return success(c, app);
  } catch (error) {
    if (error instanceof AppNotFoundError) {
      return notFound(c, "App", appId);
    }
    console.error("Error getting app:", error);
    return internalError(c);
  }
});

/**
 * POST /admin/apps
 *
 * Creates a new application.
 *
 * Request body:
 * - slug: Unique URL-safe identifier (required)
 * - name: Display name (required)
 * - description: Optional description
 * - publicKey: Optional Ed25519 public key for update signing
 *
 * @example
 * POST /admin/apps
 * {
 *   "slug": "my-new-app",
 *   "name": "My New Application",
 *   "description": "The best app ever"
 * }
 *
 * Response (201):
 * {
 *   "success": true,
 *   "data": {
 *     "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *     "slug": "my-new-app",
 *     ...
 *   }
 * }
 */
appsRoutes.post("/", async (c) => {
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

  const parseResult = createAppSchema.safeParse(body);

  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  try {
    const app = await createApp(parseResult.data);
    return created(c, app);
  } catch (error) {
    if (error instanceof AppSlugConflictError) {
      return conflict(c, error.message);
    }
    console.error("Error creating app:", error);
    return internalError(c);
  }
});

/**
 * PATCH /admin/apps/:app_id
 *
 * Updates an existing application.
 *
 * Request body (all fields optional):
 * - name: New display name
 * - description: New description (null to remove)
 * - publicKey: New public key (null to remove)
 *
 * Note: slug cannot be changed after creation.
 *
 * @example
 * PATCH /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFE
 * {
 *   "name": "Updated App Name",
 *   "description": null
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *     "slug": "my-app",
 *     "name": "Updated App Name",
 *     "description": null,
 *     ...
 *   }
 * }
 */
appsRoutes.patch("/:app_id", async (c) => {
  const appId = c.req.param("app_id");

  // Validate app_id format
  const idSchema = z.string().length(26, "Invalid app ID format");
  const idParseResult = idSchema.safeParse(appId);

  if (!idParseResult.success) {
    return zodValidationError(c, idParseResult.error);
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

  const parseResult = updateAppSchema.safeParse(body);

  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  // Check if there's anything to update
  const updateData = parseResult.data;
  if (
    updateData.name === undefined &&
    updateData.description === undefined &&
    updateData.publicKey === undefined
  ) {
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

  try {
    const app = await updateApp(appId, updateData);
    return success(c, app);
  } catch (error) {
    if (error instanceof AppNotFoundError) {
      return notFound(c, "App", appId);
    }
    console.error("Error updating app:", error);
    return internalError(c);
  }
});

/**
 * DELETE /admin/apps/:app_id
 *
 * Deletes an application.
 *
 * Restrictions:
 * - Cannot delete an app that has published releases
 * - Draft and archived releases will be deleted with the app
 *
 * @example
 * DELETE /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFE
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
 * Response (409 if has published releases):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "CONFLICT",
 *     "message": "Cannot delete app because it has published releases"
 *   }
 * }
 */
appsRoutes.delete("/:app_id", async (c) => {
  const appId = c.req.param("app_id");

  // Validate app_id format
  const idSchema = z.string().length(26, "Invalid app ID format");
  const parseResult = idSchema.safeParse(appId);

  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  try {
    await deleteApp(appId);
    return success(c, { deleted: true, id: appId });
  } catch (error) {
    if (error instanceof AppNotFoundError) {
      return notFound(c, "App", appId);
    }
    if (error instanceof AppHasPublishedReleasesError) {
      return conflict(c, error.message);
    }
    console.error("Error deleting app:", error);
    return internalError(c);
  }
});
