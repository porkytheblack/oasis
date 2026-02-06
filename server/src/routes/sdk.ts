import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, apps } from "../db/index.js";
import { sdkAuthMiddleware, requireSdkAppAccess } from "../middleware/sdk-auth.js";
import type { SdkAuthVariables } from "../middleware/sdk-auth.js";
import { submitFeedback } from "../services/feedback.service.js";
import { submitCrashReport } from "../services/crash.service.js";
import {
  submitFeedbackSchema,
  submitCrashReportSchema,
} from "../types/index.js";
import {
  created,
  notFound,
  zodValidationError,
  internalError,
} from "../utils/response.js";

/**
 * SDK routes for client application integration.
 *
 * These endpoints are called by the @oasis/sdk to submit feedback and crash reports.
 * Authentication is via public API keys (pk_*) in the X-API-Key header.
 */
export const sdkRoutes = new Hono<{ Variables: SdkAuthVariables }>();

// Apply SDK authentication to all routes
sdkRoutes.use("*", sdkAuthMiddleware);

// ============================================================================
// Feedback Routes
// ============================================================================

/**
 * POST /sdk/:app_slug/feedback
 *
 * Submit user feedback from the SDK.
 *
 * Headers:
 *   X-API-Key: pk_my-app_a1b2c3d4e5f6g7h8
 *
 * Request Body:
 *   {
 *     category: "bug" | "feature" | "general",
 *     message: string,
 *     email?: string,
 *     appVersion: string,
 *     platform: string,
 *     osVersion?: string,
 *     deviceInfo?: object,
 *     attachments?: Array<{data: string, filename: string, mimeType: string}>
 *   }
 *
 * Response:
 *   201: { success: true, data: { id: string } }
 *   400: Validation error
 *   401: Invalid API key
 *   403: API key does not have access to this app
 *   404: App not found
 */
sdkRoutes.post("/:app_slug/feedback", requireSdkAppAccess("app_slug"), async (c) => {
  const publicKey = c.get("publicApiKey");
  const appSlug = c.req.param("app_slug");

  // Look up the app
  const app = await db.query.apps.findFirst({
    where: eq(apps.slug, appSlug),
  });

  if (!app) {
    return notFound(c, "App", appSlug);
  }

  // Parse and validate request body
  let body;
  try {
    body = await c.req.json();
  } catch {
    return zodValidationError(c, {
      errors: [{ path: [], message: "Invalid JSON body", code: "custom" }],
    } as any);
  }

  const parseResult = submitFeedbackSchema.safeParse(body);
  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  try {
    const feedback = await submitFeedback(app.id, publicKey.id, parseResult.data);
    return created(c, { id: feedback.id });
  } catch (error) {
    console.error("Error submitting feedback:", error);
    return internalError(c, "Failed to submit feedback");
  }
});

// ============================================================================
// Crash Report Routes
// ============================================================================

/**
 * POST /sdk/:app_slug/crashes
 *
 * Submit a crash report from the SDK.
 *
 * Headers:
 *   X-API-Key: pk_my-app_a1b2c3d4e5f6g7h8
 *
 * Request Body:
 *   {
 *     errorType: string,
 *     errorMessage: string,
 *     stackTrace: Array<{file?, line?, column?, function?, isNative?}>,
 *     appVersion: string,
 *     platform: string,
 *     osVersion?: string,
 *     deviceInfo?: object,
 *     appState?: object,
 *     breadcrumbs?: Array<{type, message, timestamp, data?}>,
 *     severity?: "warning" | "error" | "fatal",
 *     userId?: string
 *   }
 *
 * Response:
 *   201: { success: true, data: { id: string, groupId: string } }
 *   400: Validation error
 *   401: Invalid API key
 *   403: API key does not have access to this app
 *   404: App not found
 */
sdkRoutes.post("/:app_slug/crashes", requireSdkAppAccess("app_slug"), async (c) => {
  const publicKey = c.get("publicApiKey");
  const appSlug = c.req.param("app_slug");

  // Look up the app
  const app = await db.query.apps.findFirst({
    where: eq(apps.slug, appSlug),
  });

  if (!app) {
    return notFound(c, "App", appSlug);
  }

  // Parse and validate request body
  let body;
  try {
    body = await c.req.json();
  } catch {
    return zodValidationError(c, {
      errors: [{ path: [], message: "Invalid JSON body", code: "custom" }],
    } as any);
  }

  const parseResult = submitCrashReportSchema.safeParse(body);
  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  try {
    const { report, groupId } = await submitCrashReport(
      app.id,
      publicKey.id,
      parseResult.data
    );
    return created(c, { id: report.id, groupId });
  } catch (error) {
    console.error("Error submitting crash report:", error);
    return internalError(c, "Failed to submit crash report");
  }
});
