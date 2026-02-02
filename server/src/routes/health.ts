import { Hono } from "hono";
import { success } from "../utils/response.js";
import type {
  HealthCheckResponse,
  DetailedHealthResponse,
  ReadinessResponse,
  LivenessResponse,
} from "../types/index.js";
import { pool } from "../db/index.js";

/**
 * Health check routes for monitoring and orchestration.
 *
 * These endpoints are typically used by:
 * - Load balancers for health checks
 * - Kubernetes for liveness and readiness probes
 * - Monitoring systems for uptime tracking
 */
export const healthRoutes = new Hono();

// Server start time for uptime calculation
const serverStartTime = Date.now();

// Package version (could be injected from build)
const SERVER_VERSION = process.env.npm_package_version ?? "1.0.0";

/**
 * GET /health
 *
 * Basic health check endpoint.
 * Returns a simple healthy/unhealthy status.
 *
 * @example
 * GET /health
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "status": "healthy",
 *     "timestamp": "2024-01-15T10:00:00.000Z",
 *     "version": "1.0.0"
 *   }
 * }
 */
healthRoutes.get("/", (c) => {
  const response: HealthCheckResponse = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: SERVER_VERSION,
  };

  return success(c, response);
});

/**
 * GET /health/detailed
 *
 * Detailed health check with system metrics.
 * Includes memory usage, uptime, and database status.
 *
 * @example
 * GET /health/detailed
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "status": "healthy",
 *     "timestamp": "2024-01-15T10:00:00.000Z",
 *     "version": "1.0.0",
 *     "uptime": 3600,
 *     "memory": {
 *       "heapUsed": 52428800,
 *       "heapTotal": 104857600,
 *       "rss": 157286400,
 *       "external": 1048576
 *     },
 *     "database": {
 *       "connected": true,
 *       "responseTimeMs": 2
 *     }
 *   }
 * }
 */
healthRoutes.get("/detailed", async (c) => {
  const memoryUsage = process.memoryUsage();
  const uptime = Math.floor((Date.now() - serverStartTime) / 1000);

  // Check database connectivity
  let dbConnected = false;
  let dbResponseTimeMs: number | undefined;

  try {
    const start = Date.now();
    await pool.query("SELECT 1");
    dbResponseTimeMs = Date.now() - start;
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  const status = dbConnected ? "healthy" : "degraded";

  const response: DetailedHealthResponse = {
    status,
    timestamp: new Date().toISOString(),
    version: SERVER_VERSION,
    uptime,
    memory: {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      rss: memoryUsage.rss,
      external: memoryUsage.external,
    },
    database: {
      connected: dbConnected,
    },
  };

  // Only add responseTimeMs if we have a value
  if (dbResponseTimeMs !== undefined) {
    response.database.responseTimeMs = dbResponseTimeMs;
  }

  return success(c, response);
});

/**
 * GET /health/live
 *
 * Liveness probe for Kubernetes.
 * Returns 200 if the process is alive and responsive.
 *
 * @example
 * GET /health/live
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "alive": true,
 *     "timestamp": "2024-01-15T10:00:00.000Z"
 *   }
 * }
 */
healthRoutes.get("/live", (c) => {
  const response: LivenessResponse = {
    alive: true,
    timestamp: new Date().toISOString(),
  };

  return success(c, response);
});

/**
 * GET /health/ready
 *
 * Readiness probe for Kubernetes.
 * Returns 200 if the service is ready to accept traffic.
 * Checks critical dependencies (database).
 *
 * @example
 * GET /health/ready
 *
 * Response (ready):
 * {
 *   "success": true,
 *   "data": {
 *     "ready": true,
 *     "checks": {
 *       "database": true
 *     }
 *   }
 * }
 *
 * Response (not ready - 503):
 * {
 *   "success": true,
 *   "data": {
 *     "ready": false,
 *     "checks": {
 *       "database": false
 *     }
 *   }
 * }
 */
healthRoutes.get("/ready", async (c) => {
  // Check database connectivity
  let dbReady = false;

  try {
    await pool.query("SELECT 1");
    dbReady = true;
  } catch {
    dbReady = false;
  }

  const ready = dbReady;

  const response: ReadinessResponse = {
    ready,
    checks: {
      database: dbReady,
    },
  };

  // Return 503 if not ready
  if (!ready) {
    return c.json({ success: true, data: response }, 503);
  }

  return success(c, response);
});
