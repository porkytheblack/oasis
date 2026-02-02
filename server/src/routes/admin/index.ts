import { Hono } from "hono";
import { appsRoutes } from "./apps.js";
import { apiKeysRoutes } from "./api-keys.js";
import { releasesRoutes } from "./releases.js";
import { artifactsRoutes } from "./artifacts.js";
import { installersRoutes } from "./installers.js";
import { analyticsRoutes } from "./analytics.js";
import { authMiddleware, requireAdminScope, type AuthVariables } from "../../middleware/auth.js";
import { adminRateLimiter } from "../../middleware/rate-limit.js";

/**
 * Admin routes aggregator.
 *
 * Mounts all admin sub-routes under the /admin prefix.
 * All routes require authentication via API key (Bearer token).
 *
 * Authorization rules:
 * - API key management requires admin scope
 * - App management requires admin scope
 * - Analytics requires admin scope
 * - Release/artifact management respects app-scoped keys (CI keys can only
 *   access their assigned app)
 */
export const adminRoutes = new Hono<{ Variables: AuthVariables }>();

// Apply authentication middleware to all admin routes
adminRoutes.use("*", authMiddleware);

// Apply rate limiting to all admin routes
adminRoutes.use("*", adminRateLimiter);

// API keys routes - admin scope only
// Only admin keys can create, list, or revoke API keys
adminRoutes.use("/api-keys/*", requireAdminScope());
adminRoutes.route("/api-keys", apiKeysRoutes);

// Apps routes - admin scope only
// Only admin keys can manage applications
adminRoutes.use("/apps", requireAdminScope());
adminRoutes.use("/apps/:app_id", requireAdminScope());
adminRoutes.route("/apps", appsRoutes);

// Analytics routes - admin scope only
// Only admin keys can view analytics
adminRoutes.use("/apps/:app_id/analytics", requireAdminScope());
adminRoutes.use("/apps/:app_id/analytics/*", requireAdminScope());
adminRoutes.route("/apps", analyticsRoutes);

// Release routes - respects app-scoped keys
// Admin keys can access all apps, CI keys can only access their assigned app
// The requireAppAccess middleware is applied within releasesRoutes
adminRoutes.route("/apps", releasesRoutes);

// Artifact routes - respects app-scoped keys
// Admin keys can access all apps, CI keys can only access their assigned app
// The requireAppAccess middleware is applied within artifactsRoutes
adminRoutes.route("/apps", artifactsRoutes);

// Installer routes - respects app-scoped keys
// Admin keys can access all apps, CI keys can only access their assigned app
// The requireAppAccess middleware is applied within installersRoutes
adminRoutes.route("/apps", installersRoutes);
