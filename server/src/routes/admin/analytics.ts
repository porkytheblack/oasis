import { Hono } from "hono";
import {
  getDownloadStats,
  getDownloadTimeSeries,
  getReleaseDownloadStats,
  getAppDownloadSummary,
  AppNotFoundForAnalyticsError,
  ReleaseNotFoundForAnalyticsError,
} from "../../services/analytics.service.js";
import {
  success,
  notFound,
  zodValidationError,
  internalError,
} from "../../utils/response.js";
import {
  downloadStatsQuerySchema,
  timeSeriesQuerySchema,
  ulidSchema,
  type TimeSeriesResponse,
  type ReleaseDownloadStats,
  type AppDownloadSummary,
} from "../../types/index.js";
import type { AuthVariables } from "../../middleware/auth.js";

/**
 * Analytics routes for viewing download statistics.
 *
 * All routes require admin authentication.
 * Analytics data is scoped to individual apps.
 */
export const analyticsRoutes = new Hono<{ Variables: AuthVariables }>();

/**
 * GET /admin/apps/:app_id/analytics
 *
 * Get overview analytics for an app including total downloads
 * and high-level statistics.
 *
 * @example
 * GET /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFE/analytics
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "totalDownloads": 12345,
 *     "byVersion": [...],
 *     "byPlatform": [...],
 *     "period": { "start": null, "end": null }
 *   }
 * }
 */
analyticsRoutes.get("/:app_id/analytics", async (c) => {
  const appId = c.req.param("app_id");

  // Validate app_id format
  const idParseResult = ulidSchema.safeParse(appId);
  if (!idParseResult.success) {
    return zodValidationError(c, idParseResult.error);
  }

  // Parse query parameters
  const queryParams = {
    startDate: c.req.query("startDate"),
    endDate: c.req.query("endDate"),
    includeCountries: c.req.query("includeCountries"),
  };

  const queryParseResult = downloadStatsQuerySchema.safeParse(queryParams);
  if (!queryParseResult.success) {
    return zodValidationError(c, queryParseResult.error);
  }

  try {
    // Build options object, only including defined values
    const options: {
      startDate?: string;
      endDate?: string;
      includeCountries?: boolean;
    } = {};

    if (queryParseResult.data.startDate !== undefined) {
      options.startDate = queryParseResult.data.startDate;
    }
    if (queryParseResult.data.endDate !== undefined) {
      options.endDate = queryParseResult.data.endDate;
    }
    if (queryParseResult.data.includeCountries !== undefined) {
      options.includeCountries = queryParseResult.data.includeCountries;
    }

    const stats = await getDownloadStats(appId, options);

    return success(c, stats);
  } catch (error) {
    if (error instanceof AppNotFoundForAnalyticsError) {
      return notFound(c, "App", appId);
    }
    console.error("Error fetching analytics:", error);
    return internalError(c);
  }
});

/**
 * GET /admin/apps/:app_id/analytics/downloads
 *
 * Get detailed download statistics broken down by version and platform.
 * Supports date range filtering.
 *
 * Query parameters:
 * - startDate: ISO 8601 date to start from (optional)
 * - endDate: ISO 8601 date to end at (optional)
 * - includeCountries: "true" to include country breakdown (optional)
 *
 * @example
 * GET /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFE/analytics/downloads?startDate=2024-01-01T00:00:00Z
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "totalDownloads": 5678,
 *     "byVersion": [
 *       { "version": "1.2.0", "count": 3000 },
 *       { "version": "1.1.0", "count": 2678 }
 *     ],
 *     "byPlatform": [
 *       { "platform": "darwin-aarch64", "count": 2500 },
 *       { "platform": "windows-x86_64", "count": 2000 },
 *       { "platform": "linux-x86_64", "count": 1178 }
 *     ],
 *     "period": {
 *       "start": "2024-01-01T00:00:00Z",
 *       "end": null
 *     }
 *   }
 * }
 */
analyticsRoutes.get("/:app_id/analytics/downloads", async (c) => {
  const appId = c.req.param("app_id");

  // Validate app_id format
  const idParseResult = ulidSchema.safeParse(appId);
  if (!idParseResult.success) {
    return zodValidationError(c, idParseResult.error);
  }

  // Parse query parameters
  const queryParams = {
    startDate: c.req.query("startDate"),
    endDate: c.req.query("endDate"),
    includeCountries: c.req.query("includeCountries"),
  };

  const queryParseResult = downloadStatsQuerySchema.safeParse(queryParams);
  if (!queryParseResult.success) {
    return zodValidationError(c, queryParseResult.error);
  }

  try {
    // Build options object, only including defined values
    const options: {
      startDate?: string;
      endDate?: string;
      includeCountries?: boolean;
    } = {};

    if (queryParseResult.data.startDate !== undefined) {
      options.startDate = queryParseResult.data.startDate;
    }
    if (queryParseResult.data.endDate !== undefined) {
      options.endDate = queryParseResult.data.endDate;
    }
    if (queryParseResult.data.includeCountries !== undefined) {
      options.includeCountries = queryParseResult.data.includeCountries;
    }

    const stats = await getDownloadStats(appId, options);

    return success(c, stats);
  } catch (error) {
    if (error instanceof AppNotFoundForAnalyticsError) {
      return notFound(c, "App", appId);
    }
    console.error("Error fetching download statistics:", error);
    return internalError(c);
  }
});

/**
 * GET /admin/apps/:app_id/analytics/timeseries
 *
 * Get time series download data for charting.
 *
 * Query parameters:
 * - period: Time period - "24h", "7d", "30d", or "90d" (default: "7d")
 *
 * Returns data points bucketed appropriately for the period:
 * - 24h: hourly buckets (24 data points)
 * - 7d: daily buckets (7 data points)
 * - 30d: daily buckets (30 data points)
 * - 90d: daily buckets (90 data points)
 *
 * @example
 * GET /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFE/analytics/timeseries?period=7d
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "period": "7d",
 *     "data": [
 *       { "timestamp": "2024-01-08T00:00:00.000Z", "count": 150 },
 *       { "timestamp": "2024-01-09T00:00:00.000Z", "count": 175 },
 *       ...
 *     ],
 *     "total": 1250
 *   }
 * }
 */
analyticsRoutes.get("/:app_id/analytics/timeseries", async (c) => {
  const appId = c.req.param("app_id");

  // Validate app_id format
  const idParseResult = ulidSchema.safeParse(appId);
  if (!idParseResult.success) {
    return zodValidationError(c, idParseResult.error);
  }

  // Parse query parameters
  const queryParams = {
    period: c.req.query("period"),
  };

  const queryParseResult = timeSeriesQuerySchema.safeParse(queryParams);
  if (!queryParseResult.success) {
    return zodValidationError(c, queryParseResult.error);
  }

  const { period } = queryParseResult.data;

  try {
    const dataPoints = await getDownloadTimeSeries(appId, period);

    // Calculate total from data points
    const total = dataPoints.reduce((sum, point) => sum + point.count, 0);

    const response: TimeSeriesResponse = {
      period,
      data: dataPoints,
      total,
    };

    return success(c, response);
  } catch (error) {
    if (error instanceof AppNotFoundForAnalyticsError) {
      return notFound(c, "App", appId);
    }
    console.error("Error fetching time series data:", error);
    return internalError(c);
  }
});

/**
 * GET /admin/apps/:app_id/analytics/summary
 *
 * Get aggregate download statistics for an app including total downloads,
 * total updates, and per-version breakdown.
 *
 * @example
 * GET /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFE/analytics/summary
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "appId": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *     "totalUpdateDownloads": 5000,
 *     "totalInstallerDownloads": 1500,
 *     "totalDownloads": 6500,
 *     "byVersion": [
 *       { "version": "1.2.0", "releaseId": "...", "updateDownloads": 3000, "installerDownloads": 800, "totalDownloads": 3800 },
 *       { "version": "1.1.0", "releaseId": "...", "updateDownloads": 2000, "installerDownloads": 700, "totalDownloads": 2700 }
 *     ],
 *     "byPlatform": [
 *       { "platform": "darwin-aarch64", "count": 2500 },
 *       { "platform": "windows-x86_64", "count": 2000 }
 *     ]
 *   }
 * }
 */
analyticsRoutes.get("/:app_id/analytics/summary", async (c) => {
  const appId = c.req.param("app_id");

  // Validate app_id format
  const idParseResult = ulidSchema.safeParse(appId);
  if (!idParseResult.success) {
    return zodValidationError(c, idParseResult.error);
  }

  try {
    const summary = await getAppDownloadSummary(appId);

    const response: AppDownloadSummary = {
      appId: summary.appId,
      totalUpdateDownloads: summary.totalUpdateDownloads,
      totalInstallerDownloads: summary.totalInstallerDownloads,
      totalDownloads: summary.totalDownloads,
      byVersion: summary.byVersion,
      byPlatform: summary.byPlatform,
    };

    return success(c, response);
  } catch (error) {
    if (error instanceof AppNotFoundForAnalyticsError) {
      return notFound(c, "App", appId);
    }
    console.error("Error fetching app download summary:", error);
    return internalError(c);
  }
});

/**
 * GET /admin/apps/:app_id/releases/:release_id/analytics
 *
 * Get download statistics for a specific release, broken down by
 * download type (update vs installer) and platform.
 *
 * @example
 * GET /admin/apps/01HQWX5K8J2MXPZ9Y7VBNC3DFE/releases/01HQWX6K8J2MXPZ9Y7VBNC3DFE/analytics
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "releaseId": "01HQWX6K8J2MXPZ9Y7VBNC3DFE",
 *     "version": "1.2.0",
 *     "updateDownloads": 3000,
 *     "installerDownloads": 800,
 *     "totalDownloads": 3800,
 *     "byPlatform": [
 *       { "platform": "darwin-aarch64", "count": 1500 },
 *       { "platform": "windows-x86_64", "count": 1200 }
 *     ]
 *   }
 * }
 */
analyticsRoutes.get("/:app_id/releases/:release_id/analytics", async (c) => {
  const appId = c.req.param("app_id");
  const releaseId = c.req.param("release_id");

  // Validate app_id format
  const appIdParseResult = ulidSchema.safeParse(appId);
  if (!appIdParseResult.success) {
    return zodValidationError(c, appIdParseResult.error);
  }

  // Validate release_id format
  const releaseIdParseResult = ulidSchema.safeParse(releaseId);
  if (!releaseIdParseResult.success) {
    return zodValidationError(c, releaseIdParseResult.error);
  }

  try {
    const stats = await getReleaseDownloadStats(appId, releaseId);

    const response: ReleaseDownloadStats = {
      releaseId: stats.releaseId,
      version: stats.version,
      updateDownloads: stats.updateDownloads,
      installerDownloads: stats.installerDownloads,
      totalDownloads: stats.totalDownloads,
      byPlatform: stats.byPlatform,
    };

    return success(c, response);
  } catch (error) {
    if (error instanceof AppNotFoundForAnalyticsError) {
      return notFound(c, "App", appId);
    }
    if (error instanceof ReleaseNotFoundForAnalyticsError) {
      return notFound(c, "Release", releaseId);
    }
    console.error("Error fetching release download stats:", error);
    return internalError(c);
  }
});
