import { Hono } from "hono";
import { publicRoutes } from "./public.js";
import { adminRoutes } from "./admin/index.js";
import { ciRoutes } from "./ci/index.js";
import { sdkRoutes } from "./sdk.js";
import { healthRoutes } from "./health.js";
import { publicRateLimiter } from "../middleware/rate-limit.js";

/**
 * Main routes aggregator.
 *
 * Combines all route modules into a single router.
 *
 * Route structure:
 * - /admin/*  - Admin API endpoints (requires API key with appropriate scope)
 * - /ci/*     - CI/CD integration endpoints (requires CI or admin API key)
 * - /*        - Public Tauri update endpoints (no auth required, rate limited)
 */
export const routes = new Hono();

// Mount health check routes (no auth required)
routes.route("/health", healthRoutes);

// Mount admin routes under /admin prefix
// Admin routes have their own rate limiting applied
routes.route("/admin", adminRoutes);

// Mount CI routes under /ci prefix
// CI routes require authentication with CI or admin scope
// CI routes have their own rate limiting applied
routes.route("/ci", ciRoutes);

// Mount SDK routes under /sdk prefix
// SDK routes require authentication with public API key (pk_*)
// Used by @oasis/sdk for feedback and crash reporting
routes.route("/sdk", sdkRoutes);

// Apply rate limiting to public update endpoints
// Rate limits are applied per IP address
routes.use("/:app_slug/update/*", publicRateLimiter);

// Mount public routes at the root level
// These are the Tauri update endpoints: /:app_slug/update/:target/:current_version
routes.route("/", publicRoutes);
