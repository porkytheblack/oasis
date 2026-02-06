import { Hono } from "hono";
import type { AuthVariables } from "../../middleware/auth.js";
import { requireAppAccess } from "../../middleware/auth.js";
import {
  listCrashReports,
  getCrashReportById,
  listCrashGroups,
  getCrashGroupById,
  updateCrashGroup,
  getCrashStats,
  CrashReportNotFoundError,
  CrashGroupNotFoundError,
} from "../../services/crash.service.js";
import {
  listCrashReportsQuerySchema,
  listCrashGroupsQuerySchema,
  updateCrashGroupSchema,
  timeSeriesPeriodSchema,
} from "../../types/index.js";
import {
  success,
  notFound,
  paginated,
  zodValidationError,
  internalError,
} from "../../utils/response.js";

/**
 * Admin routes for managing crash reports and analytics.
 *
 * All routes require admin authentication via Bearer token.
 */
export const crashesRoutes = new Hono<{ Variables: AuthVariables }>();

// All routes require access to the specified app
crashesRoutes.use("/:app_id/*", requireAppAccess("app_id"));

// ============================================================================
// Crash Statistics
// ============================================================================

/**
 * GET /admin/apps/:app_id/crashes/stats
 *
 * Get crash statistics for an app.
 *
 * Query Parameters:
 *   period: Time period (24h, 7d, 30d, 90d) - default: 7d
 *
 * Response:
 *   200: CrashStatsResponse
 */
crashesRoutes.get("/:app_id/crashes/stats", async (c) => {
  const appId = c.req.param("app_id")!;

  const periodParam = c.req.query("period") || "7d";
  const periodResult = timeSeriesPeriodSchema.safeParse(periodParam);

  if (!periodResult.success) {
    return zodValidationError(c, periodResult.error);
  }

  try {
    const stats = await getCrashStats(appId, periodResult.data);
    return success(c, stats);
  } catch (error) {
    console.error("Error getting crash stats:", error);
    return internalError(c, "Failed to get crash statistics");
  }
});

// ============================================================================
// Crash Groups
// ============================================================================

/**
 * GET /admin/apps/:app_id/crashes/groups
 *
 * List crash groups (aggregated similar crashes) for an app.
 *
 * Query Parameters:
 *   page: Page number (default: 1)
 *   limit: Items per page (default: 20, max: 100)
 *   status: Filter by status (new, investigating, resolved, ignored)
 *   sort: Sort by (count, last_seen, first_seen) - default: last_seen
 *   order: Sort order (asc, desc) - default: desc
 *
 * Response:
 *   200: Paginated list of crash groups
 */
crashesRoutes.get("/:app_id/crashes/groups", async (c) => {
  const appId = c.req.param("app_id")!;

  const queryParseResult = listCrashGroupsQuerySchema.safeParse(c.req.query());
  if (!queryParseResult.success) {
    return zodValidationError(c, queryParseResult.error);
  }

  try {
    const { items, total } = await listCrashGroups(appId, queryParseResult.data);
    const { page, limit } = queryParseResult.data;
    return paginated(c, items, page, limit, total);
  } catch (error) {
    console.error("Error listing crash groups:", error);
    return internalError(c, "Failed to list crash groups");
  }
});

/**
 * GET /admin/apps/:app_id/crashes/groups/:group_id
 *
 * Get details of a specific crash group.
 *
 * Response:
 *   200: CrashGroupDto
 *   404: Crash group not found
 */
crashesRoutes.get("/:app_id/crashes/groups/:group_id", async (c) => {
  const appId = c.req.param("app_id")!;
  const groupId = c.req.param("group_id")!;

  try {
    const group = await getCrashGroupById(groupId, appId);
    return success(c, group);
  } catch (error) {
    if (error instanceof CrashGroupNotFoundError) {
      return notFound(c, "Crash group", groupId);
    }
    console.error("Error getting crash group:", error);
    return internalError(c, "Failed to get crash group");
  }
});

/**
 * PATCH /admin/apps/:app_id/crashes/groups/:group_id
 *
 * Update a crash group (status, assignee, resolution notes).
 *
 * Request Body:
 *   {
 *     status?: "new" | "investigating" | "resolved" | "ignored",
 *     assignedTo?: string | null,
 *     resolutionNotes?: string | null
 *   }
 *
 * Response:
 *   200: Updated CrashGroupDto
 *   404: Crash group not found
 */
crashesRoutes.patch("/:app_id/crashes/groups/:group_id", async (c) => {
  const appId = c.req.param("app_id")!;
  const groupId = c.req.param("group_id")!;

  let body;
  try {
    body = await c.req.json();
  } catch {
    return zodValidationError(c, {
      errors: [{ path: [], message: "Invalid JSON body", code: "custom" }],
    } as any);
  }

  const parseResult = updateCrashGroupSchema.safeParse(body);
  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  try {
    const group = await updateCrashGroup(groupId, appId, parseResult.data);
    return success(c, group);
  } catch (error) {
    if (error instanceof CrashGroupNotFoundError) {
      return notFound(c, "Crash group", groupId);
    }
    console.error("Error updating crash group:", error);
    return internalError(c, "Failed to update crash group");
  }
});

/**
 * GET /admin/apps/:app_id/crashes/groups/:group_id/reports
 *
 * List crash reports belonging to a specific group.
 *
 * Query Parameters:
 *   page: Page number (default: 1)
 *   limit: Items per page (default: 20, max: 100)
 *
 * Response:
 *   200: Paginated list of crash reports
 */
crashesRoutes.get("/:app_id/crashes/groups/:group_id/reports", async (c) => {
  const appId = c.req.param("app_id")!;
  const groupId = c.req.param("group_id")!;

  const queryParseResult = listCrashReportsQuerySchema.safeParse({
    ...c.req.query(),
    groupId,
  });
  if (!queryParseResult.success) {
    return zodValidationError(c, queryParseResult.error);
  }

  try {
    const { items, total } = await listCrashReports(appId, queryParseResult.data);
    const { page, limit } = queryParseResult.data;
    return paginated(c, items, page, limit, total);
  } catch (error) {
    console.error("Error listing crash reports for group:", error);
    return internalError(c, "Failed to list crash reports");
  }
});

// ============================================================================
// Individual Crash Reports
// ============================================================================

/**
 * GET /admin/apps/:app_id/crashes
 *
 * List all crash reports for an app.
 *
 * Query Parameters:
 *   page: Page number (default: 1)
 *   limit: Items per page (default: 20, max: 100)
 *   groupId: Filter by crash group
 *   version: Filter by app version
 *   severity: Filter by severity (warning, error, fatal)
 *
 * Response:
 *   200: Paginated list of crash reports
 */
crashesRoutes.get("/:app_id/crashes", async (c) => {
  const appId = c.req.param("app_id")!;

  const queryParseResult = listCrashReportsQuerySchema.safeParse(c.req.query());
  if (!queryParseResult.success) {
    return zodValidationError(c, queryParseResult.error);
  }

  try {
    const { items, total } = await listCrashReports(appId, queryParseResult.data);
    const { page, limit } = queryParseResult.data;
    return paginated(c, items, page, limit, total);
  } catch (error) {
    console.error("Error listing crash reports:", error);
    return internalError(c, "Failed to list crash reports");
  }
});

/**
 * GET /admin/apps/:app_id/crashes/:crash_id
 *
 * Get details of a specific crash report.
 *
 * Response:
 *   200: CrashReportDto
 *   404: Crash report not found
 */
crashesRoutes.get("/:app_id/crashes/:crash_id", async (c) => {
  const appId = c.req.param("app_id")!;
  const crashId = c.req.param("crash_id")!;

  // Make sure we're not matching the other routes
  if (crashId === "stats" || crashId === "groups") {
    return notFound(c, "Crash report", crashId);
  }

  try {
    const report = await getCrashReportById(crashId, appId);
    return success(c, report);
  } catch (error) {
    if (error instanceof CrashReportNotFoundError) {
      return notFound(c, "Crash report", crashId);
    }
    console.error("Error getting crash report:", error);
    return internalError(c, "Failed to get crash report");
  }
});
