import "dotenv/config"
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { routes } from "./routes/index.js";
import { internalError } from "./utils/response.js";
import { pool } from "./db/index.js";
import type {
  DetailedHealthResponse,
  ReadinessResponse,
  LivenessResponse,
} from "./types/index.js";

/**
 * Oasis Tauri Update Server
 *
 * A self-hosted update server for Tauri applications.
 */

// Track server start time for uptime calculation
const serverStartTime = Date.now();

// Server version
const SERVER_VERSION = "1.0.0";

// Create the main Hono application
const app = new Hono();

// ============================================================================
// Middleware
// ============================================================================

// Request logging
app.use("*", logger());

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()) ?? ["*"];
app.use(
  "*",
  cors({
    origin: corsOrigins.length === 1 && corsOrigins[0] === "*" ? "*" : corsOrigins,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    exposeHeaders: ["X-Request-Id", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    maxAge: 86400, // 24 hours
    credentials: true,
  })
);

// ============================================================================
// Health Check Endpoints
// ============================================================================

/**
 * Checks database connectivity by executing a simple query.
 *
 * @returns Object with connected status and response time
 */
async function checkDatabaseConnection(): Promise<{ connected: boolean; responseTimeMs?: number }> {
  const startTime = performance.now();
  try {
    // Execute a simple query to verify connection
    await pool.query("SELECT 1");
    const responseTimeMs = Math.round((performance.now() - startTime) * 100) / 100;
    return { connected: true, responseTimeMs };
  } catch (error) {
    console.error("Database health check failed:", error);
    return { connected: false };
  }
}

/**
 * GET /health
 *
 * Detailed health check endpoint for load balancers and monitoring.
 * Returns comprehensive system status including uptime and memory usage.
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "status": "healthy",
 *     "timestamp": "2024-01-15T10:30:00.000Z",
 *     "version": "1.0.0",
 *     "uptime": 3600,
 *     "memory": { ... },
 *     "database": { ... }
 *   }
 * }
 */
app.get("/health", async (c) => {
  const memoryUsage = process.memoryUsage();
  const dbStatus = await checkDatabaseConnection();
  const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);

  // Determine overall status
  let status: "healthy" | "unhealthy" | "degraded" = "healthy";
  if (!dbStatus.connected) {
    status = "unhealthy";
  }

  const response: DetailedHealthResponse = {
    status,
    timestamp: new Date().toISOString(),
    version: SERVER_VERSION,
    uptime: uptimeSeconds,
    memory: {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      rss: memoryUsage.rss,
      external: memoryUsage.external,
    },
    database: dbStatus,
  };

  // Return 503 if unhealthy
  const statusCode = status === "unhealthy" ? 503 : 200;
  return c.json({ success: status !== "unhealthy", data: response }, statusCode);
});

/**
 * GET /health/ready
 *
 * Readiness probe for Kubernetes and container orchestration.
 * Indicates whether the service is ready to accept traffic.
 *
 * A service is ready when:
 * - Database connection is established and responsive
 *
 * Response (200):
 * {
 *   "ready": true,
 *   "checks": {
 *     "database": true
 *   }
 * }
 *
 * Response (503):
 * {
 *   "ready": false,
 *   "checks": {
 *     "database": false
 *   }
 * }
 */
app.get("/health/ready", async (c) => {
  const dbStatus = await checkDatabaseConnection();

  const response: ReadinessResponse = {
    ready: dbStatus.connected,
    checks: {
      database: dbStatus.connected,
    },
  };

  const statusCode = response.ready ? 200 : 503;
  return c.json(response, statusCode);
});

/**
 * GET /health/live
 *
 * Liveness probe for Kubernetes and container orchestration.
 * Indicates whether the service process is alive and responsive.
 *
 * This endpoint always returns 200 as long as the process can handle requests.
 * It does NOT check external dependencies (database, etc.).
 *
 * Response (200):
 * {
 *   "alive": true,
 *   "timestamp": "2024-01-15T10:30:00.000Z"
 * }
 */
app.get("/health/live", (c) => {
  const response: LivenessResponse = {
    alive: true,
    timestamp: new Date().toISOString(),
  };

  return c.json(response, 200);
});

// ============================================================================
// API Routes
// ============================================================================

// Mount all routes
app.route("/", routes);

// ============================================================================
// Error Handling
// ============================================================================

// Global error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);

  // Don't expose internal error details in production
  const isDev = process.env.NODE_ENV === "development";
  const message = isDev ? err.message : "An unexpected error occurred";

  return internalError(c, message);
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Route ${c.req.method} ${c.req.path} not found`,
      },
    },
    404
  );
});

// ============================================================================
// Server Startup
// ============================================================================

const port = parseInt(process.env.PORT ?? "3000", 10);

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   Oasis Tauri Update Server                               ║
║                                                           ║
║   Starting server on port ${port.toString().padEnd(29)}║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server is running at http://localhost:${port}`);
console.log(`Health check: http://localhost:${port}/health`);
console.log(`Readiness check: http://localhost:${port}/health/ready`);
console.log(`Liveness check: http://localhost:${port}/health/live`);
console.log(`Admin API: http://localhost:${port}/admin/apps`);

// Export for testing
export default app;
