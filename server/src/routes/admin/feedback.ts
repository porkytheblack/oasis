import { Hono } from "hono";
import type { AuthVariables } from "../../middleware/auth.js";
import { requireAppAccess } from "../../middleware/auth.js";
import {
  listFeedback,
  getFeedbackByIdForApp,
  updateFeedback,
  deleteFeedback,
  getFeedbackStats,
  getFeedbackVersions,
  FeedbackNotFoundError,
} from "../../services/feedback.service.js";
import {
  listFeedbackQuerySchema,
  updateFeedbackSchema,
} from "../../types/index.js";
import {
  success,
  notFound,
  paginated,
  zodValidationError,
  internalError,
  noContent,
} from "../../utils/response.js";

/**
 * Admin routes for managing user feedback.
 *
 * All routes require admin authentication via Bearer token.
 */
export const feedbackRoutes = new Hono<{ Variables: AuthVariables }>();

// All routes require access to the specified app
feedbackRoutes.use("/:app_id/*", requireAppAccess("app_id"));

/**
 * GET /admin/apps/:app_id/feedback
 *
 * List all feedback for an app with filtering and pagination.
 *
 * Query Parameters:
 *   page: Page number (default: 1)
 *   limit: Items per page (default: 20, max: 100)
 *   status: Filter by status (open, in_progress, closed)
 *   category: Filter by category (bug, feature, general)
 *   version: Filter by app version
 *   search: Search in message and email
 *
 * Response:
 *   200: Paginated list of feedback
 */
feedbackRoutes.get("/:app_id/feedback", async (c) => {
  const appId = c.req.param("app_id")!;

  const queryParseResult = listFeedbackQuerySchema.safeParse(c.req.query());
  if (!queryParseResult.success) {
    return zodValidationError(c, queryParseResult.error);
  }

  try {
    const { items, total } = await listFeedback(appId, queryParseResult.data);
    const { page, limit } = queryParseResult.data;
    return paginated(c, items, page, limit, total);
  } catch (error) {
    console.error("Error listing feedback:", error);
    return internalError(c, "Failed to list feedback");
  }
});

/**
 * GET /admin/apps/:app_id/feedback/stats
 *
 * Get feedback statistics for an app.
 *
 * Response:
 *   200: { total, byStatus, byCategory }
 */
feedbackRoutes.get("/:app_id/feedback/stats", async (c) => {
  const appId = c.req.param("app_id")!;

  try {
    const stats = await getFeedbackStats(appId);
    return success(c, stats);
  } catch (error) {
    console.error("Error getting feedback stats:", error);
    return internalError(c, "Failed to get feedback statistics");
  }
});

/**
 * GET /admin/apps/:app_id/feedback/versions
 *
 * Get list of app versions that have submitted feedback.
 *
 * Response:
 *   200: { versions: string[] }
 */
feedbackRoutes.get("/:app_id/feedback/versions", async (c) => {
  const appId = c.req.param("app_id")!;

  try {
    const versions = await getFeedbackVersions(appId);
    return success(c, { versions });
  } catch (error) {
    console.error("Error getting feedback versions:", error);
    return internalError(c, "Failed to get feedback versions");
  }
});

/**
 * GET /admin/apps/:app_id/feedback/:feedback_id
 *
 * Get details of a specific feedback item.
 *
 * Response:
 *   200: FeedbackDto
 *   404: Feedback not found
 */
feedbackRoutes.get("/:app_id/feedback/:feedback_id", async (c) => {
  const appId = c.req.param("app_id")!;
  const feedbackId = c.req.param("feedback_id")!;

  try {
    const feedback = await getFeedbackByIdForApp(feedbackId, appId);
    return success(c, feedback);
  } catch (error) {
    if (error instanceof FeedbackNotFoundError) {
      return notFound(c, "Feedback", feedbackId);
    }
    console.error("Error getting feedback:", error);
    return internalError(c, "Failed to get feedback");
  }
});

/**
 * PATCH /admin/apps/:app_id/feedback/:feedback_id
 *
 * Update feedback status or internal notes.
 *
 * Request Body:
 *   {
 *     status?: "open" | "in_progress" | "closed",
 *     internalNotes?: string | null
 *   }
 *
 * Response:
 *   200: Updated FeedbackDto
 *   404: Feedback not found
 */
feedbackRoutes.patch("/:app_id/feedback/:feedback_id", async (c) => {
  const appId = c.req.param("app_id")!;
  const feedbackId = c.req.param("feedback_id")!;

  let body;
  try {
    body = await c.req.json();
  } catch {
    return zodValidationError(c, {
      errors: [{ path: [], message: "Invalid JSON body", code: "custom" }],
    } as any);
  }

  const parseResult = updateFeedbackSchema.safeParse(body);
  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  try {
    const feedback = await updateFeedback(feedbackId, appId, parseResult.data);
    return success(c, feedback);
  } catch (error) {
    if (error instanceof FeedbackNotFoundError) {
      return notFound(c, "Feedback", feedbackId);
    }
    console.error("Error updating feedback:", error);
    return internalError(c, "Failed to update feedback");
  }
});

/**
 * DELETE /admin/apps/:app_id/feedback/:feedback_id
 *
 * Delete a feedback item.
 *
 * Response:
 *   204: No content (success)
 *   404: Feedback not found
 */
feedbackRoutes.delete("/:app_id/feedback/:feedback_id", async (c) => {
  const appId = c.req.param("app_id")!;
  const feedbackId = c.req.param("feedback_id")!;

  try {
    await deleteFeedback(feedbackId, appId);
    return noContent(c);
  } catch (error) {
    if (error instanceof FeedbackNotFoundError) {
      return notFound(c, "Feedback", feedbackId);
    }
    console.error("Error deleting feedback:", error);
    return internalError(c, "Failed to delete feedback");
  }
});
