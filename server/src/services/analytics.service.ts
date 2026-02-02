import { eq, and, gte, lte, sql, desc, count } from "drizzle-orm";
import { ulid } from "ulid";
import { db, downloadEvents, apps } from "../db/index.js";
import type { DownloadEvent, NewDownloadEvent } from "../db/schema.js";
import type {
  DownloadStatsOptions,
  DownloadStatsResponse,
  TimeSeriesPeriod,
  TimeSeriesDataPoint,
  PlatformDownloadStats,
  VersionDownloadStats,
} from "../types/index.js";

/**
 * Service error types for analytics operations
 */
export class AppNotFoundForAnalyticsError extends Error {
  constructor(appId: string) {
    super(`App with ID '${appId}' was not found`);
    this.name = "AppNotFoundForAnalyticsError";
  }
}

export class ArtifactNotFoundForAnalyticsError extends Error {
  constructor(artifactId: string) {
    super(`Artifact with ID '${artifactId}' was not found`);
    this.name = "ArtifactNotFoundForAnalyticsError";
  }
}

/**
 * Download type for analytics tracking
 */
export type DownloadType = "update" | "installer";

/**
 * Records a download event for analytics tracking.
 *
 * Called when a Tauri client receives an update response or when an installer is downloaded.
 * Does not block the response - errors are logged but not thrown.
 *
 * @param artifactId - The ID of the artifact or installer being downloaded
 * @param appId - The ID of the app
 * @param platform - The target platform (e.g., "darwin-aarch64")
 * @param version - The version being downloaded
 * @param ipCountry - Optional ISO country code from CDN headers
 * @param downloadType - Type of download: 'update' (default) or 'installer'
 */
export async function recordDownload(
  artifactId: string,
  appId: string,
  platform: string,
  version: string,
  ipCountry?: string,
  downloadType: DownloadType = "update"
): Promise<void> {
  const newEvent: NewDownloadEvent = {
    id: ulid(),
    artifactId,
    appId,
    platform,
    version,
    ipCountry: ipCountry ?? null,
    downloadType,
    downloadedAt: new Date(),
  };

  await db.insert(downloadEvents).values(newEvent);
}

/**
 * Records a download event asynchronously without blocking.
 * Errors are logged but do not affect the calling code.
 *
 * @param artifactId - The ID of the artifact or installer being downloaded
 * @param appId - The ID of the app
 * @param platform - The target platform
 * @param version - The version being downloaded
 * @param ipCountry - Optional ISO country code
 * @param downloadType - Type of download: 'update' (default) or 'installer'
 */
export function recordDownloadAsync(
  artifactId: string,
  appId: string,
  platform: string,
  version: string,
  ipCountry?: string,
  downloadType: DownloadType = "update"
): void {
  recordDownload(artifactId, appId, platform, version, ipCountry, downloadType).catch((error) => {
    console.error("Failed to record download event:", error);
  });
}

/**
 * Validates that an app exists by ID.
 *
 * @param appId - The app ID to validate
 * @throws AppNotFoundForAnalyticsError if the app doesn't exist
 */
async function validateAppExists(appId: string): Promise<void> {
  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
  });

  if (!app) {
    throw new AppNotFoundForAnalyticsError(appId);
  }
}

/**
 * Calculates the start date for a given time period.
 *
 * @param period - The time period to calculate
 * @returns Date object representing the start of the period
 */
function getStartDateForPeriod(period: TimeSeriesPeriod): Date {
  const now = new Date();
  const startDate = new Date(now);

  switch (period) {
    case "24h":
      startDate.setHours(startDate.getHours() - 24);
      break;
    case "7d":
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "30d":
      startDate.setDate(startDate.getDate() - 30);
      break;
    case "90d":
      startDate.setDate(startDate.getDate() - 90);
      break;
  }

  return startDate;
}

/**
 * Gets the appropriate PostgreSQL date_trunc precision for grouping based on period.
 *
 * @param period - The time series period
 * @returns PostgreSQL date_trunc precision string
 */
function getDateTruncPrecision(period: TimeSeriesPeriod): string {
  switch (period) {
    case "24h":
      // Group by hour for 24-hour period
      return "hour";
    case "7d":
    case "30d":
    case "90d":
      // Group by day for longer periods
      return "day";
  }
}

/**
 * Retrieves download statistics for an app.
 *
 * Provides aggregate counts by version, platform, and optionally country,
 * with filtering by date range.
 *
 * @param appId - The app ID to get stats for
 * @param options - Optional filtering and grouping options
 * @returns Download statistics response
 * @throws AppNotFoundForAnalyticsError if the app doesn't exist
 */
export async function getDownloadStats(
  appId: string,
  options?: DownloadStatsOptions
): Promise<DownloadStatsResponse> {
  await validateAppExists(appId);

  const startDate = options?.startDate ? new Date(options.startDate) : null;
  const endDate = options?.endDate ? new Date(options.endDate) : null;

  // Build base conditions
  const conditions = [eq(downloadEvents.appId, appId)];

  if (startDate) {
    conditions.push(gte(downloadEvents.downloadedAt, startDate));
  }

  if (endDate) {
    conditions.push(lte(downloadEvents.downloadedAt, endDate));
  }

  const whereClause = and(...conditions);

  // Get total downloads
  const totalResult = await db
    .select({ count: count() })
    .from(downloadEvents)
    .where(whereClause);

  const totalDownloads = totalResult[0]?.count ?? 0;

  // Get downloads by version
  const versionStats = await db
    .select({
      version: downloadEvents.version,
      count: count(),
    })
    .from(downloadEvents)
    .where(whereClause)
    .groupBy(downloadEvents.version)
    .orderBy(desc(count()));

  const byVersion: VersionDownloadStats[] = versionStats.map((row) => ({
    version: row.version,
    count: row.count,
  }));

  // Get downloads by platform
  const platformStats = await db
    .select({
      platform: downloadEvents.platform,
      count: count(),
    })
    .from(downloadEvents)
    .where(whereClause)
    .groupBy(downloadEvents.platform)
    .orderBy(desc(count()));

  const byPlatform: PlatformDownloadStats[] = platformStats.map((row) => ({
    platform: row.platform,
    count: row.count,
  }));

  // Build the response object
  const response: DownloadStatsResponse = {
    totalDownloads,
    byVersion,
    byPlatform,
    period: {
      start: startDate?.toISOString() ?? null,
      end: endDate?.toISOString() ?? null,
    },
  };

  // Get downloads by country if requested
  if (options?.includeCountries) {
    const countryStats = await db
      .select({
        country: downloadEvents.ipCountry,
        count: count(),
      })
      .from(downloadEvents)
      .where(whereClause)
      .groupBy(downloadEvents.ipCountry)
      .orderBy(desc(count()));

    response.byCountry = countryStats.map((row) => ({
      country: row.country ?? "Unknown",
      count: row.count,
    }));
  }

  return response;
}

/**
 * Retrieves time series download data for charting.
 *
 * Groups download events by time buckets appropriate for the requested period:
 * - 24h: hourly buckets
 * - 7d, 30d, 90d: daily buckets
 *
 * @param appId - The app ID to get time series for
 * @param period - The time period to retrieve
 * @returns Array of time series data points
 * @throws AppNotFoundForAnalyticsError if the app doesn't exist
 */
export async function getDownloadTimeSeries(
  appId: string,
  period: TimeSeriesPeriod
): Promise<TimeSeriesDataPoint[]> {
  await validateAppExists(appId);

  const startDate = getStartDateForPeriod(period);
  const precision = getDateTruncPrecision(period);

  // Query with PostgreSQL date_trunc for time bucket grouping
  const results = await db
    .select({
      bucket: sql<string>`date_trunc(${precision}, ${downloadEvents.downloadedAt})::text`.as(
        "bucket"
      ),
      count: count(),
    })
    .from(downloadEvents)
    .where(and(eq(downloadEvents.appId, appId), gte(downloadEvents.downloadedAt, startDate)))
    .groupBy(sql`bucket`)
    .orderBy(sql`bucket`);

  // Fill in gaps with zero counts
  const dataPoints = fillTimeSeriesGaps(results, period, startDate);

  return dataPoints;
}

/**
 * Fills gaps in time series data with zero counts.
 *
 * Ensures continuous data for charting by inserting zero-count entries
 * for time buckets with no downloads.
 *
 * @param results - Raw query results with bucket and count
 * @param period - The time period for determining bucket size
 * @param startDate - The start date of the period
 * @returns Complete time series with gaps filled
 */
function fillTimeSeriesGaps(
  results: { bucket: string; count: number }[],
  period: TimeSeriesPeriod,
  startDate: Date
): TimeSeriesDataPoint[] {
  const now = new Date();
  const dataMap = new Map<string, number>();

  // Index existing results by bucket (normalize PostgreSQL timestamp format)
  for (const row of results) {
    const normalizedBucket = formatDateBucket(new Date(row.bucket), period);
    dataMap.set(normalizedBucket, row.count);
  }

  const dataPoints: TimeSeriesDataPoint[] = [];
  const current = new Date(startDate);

  if (period === "24h") {
    // Generate hourly buckets
    current.setMinutes(0, 0, 0);
    while (current <= now) {
      const bucket = formatDateBucket(current, period);
      dataPoints.push({
        timestamp: current.toISOString(),
        count: dataMap.get(bucket) ?? 0,
      });
      current.setHours(current.getHours() + 1);
    }
  } else {
    // Generate daily buckets
    current.setHours(0, 0, 0, 0);
    while (current <= now) {
      const bucket = formatDateBucket(current, period);
      dataPoints.push({
        timestamp: current.toISOString(),
        count: dataMap.get(bucket) ?? 0,
      });
      current.setDate(current.getDate() + 1);
    }
  }

  return dataPoints;
}

/**
 * Formats a date to a normalized bucket key for comparison.
 *
 * @param date - The date to format
 * @param period - The time period determining format
 * @returns Formatted date string for bucket matching
 */
function formatDateBucket(date: Date, period: TimeSeriesPeriod): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  if (period === "24h") {
    const hour = String(date.getHours()).padStart(2, "0");
    return `${year}-${month}-${day} ${hour}:00:00`;
  }

  return `${year}-${month}-${day} 00:00:00`;
}

/**
 * Gets the total download count for an app.
 *
 * @param appId - The app ID
 * @returns Total download count
 */
export async function getTotalDownloads(appId: string): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(downloadEvents)
    .where(eq(downloadEvents.appId, appId));

  return result[0]?.count ?? 0;
}

/**
 * Gets the download count for a specific version.
 *
 * @param appId - The app ID
 * @param version - The version string
 * @returns Download count for the version
 */
export async function getVersionDownloads(appId: string, version: string): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(downloadEvents)
    .where(and(eq(downloadEvents.appId, appId), eq(downloadEvents.version, version)));

  return result[0]?.count ?? 0;
}

/**
 * Gets recent download events for an app with pagination.
 *
 * @param appId - The app ID
 * @param limit - Maximum number of events to return
 * @param offset - Number of events to skip
 * @returns Array of download events
 */
export async function getRecentDownloads(
  appId: string,
  limit: number,
  offset: number
): Promise<DownloadEvent[]> {
  const events = await db.query.downloadEvents.findMany({
    where: eq(downloadEvents.appId, appId),
    orderBy: desc(downloadEvents.downloadedAt),
    limit,
    offset,
  });

  return events;
}
