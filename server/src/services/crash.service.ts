import { createHash } from "node:crypto";
import { eq, and, desc, asc, count, gte, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { db, crashReports, crashGroups } from "../db/index.js";
import type { CrashReport, NewCrashReport, CrashGroup, NewCrashGroup } from "../db/schema.js";
import type {
  CrashReportDto,
  CrashGroupDto,
  CrashSeverity,
  CrashGroupStatus,
  SubmitCrashReportDto,
  UpdateCrashGroupDto,
  ListCrashGroupsQuery,
  ListCrashReportsQuery,
  CrashStatsResponse,
  StackFrame,
  Breadcrumb,
  DeviceInfo,
} from "../types/index.js";

/**
 * Error thrown when a crash report is not found
 */
export class CrashReportNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Crash report with identifier '${identifier}' was not found`);
    this.name = "CrashReportNotFoundError";
  }
}

/**
 * Error thrown when a crash group is not found
 */
export class CrashGroupNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Crash group with identifier '${identifier}' was not found`);
    this.name = "CrashGroupNotFoundError";
  }
}

// ============================================================================
// Crash Fingerprinting Algorithm
// ============================================================================

/**
 * Extracts significant stack frames by filtering out noise.
 * Excludes native frames, node_modules, and internal runtime frames.
 *
 * Time Complexity: O(n) where n is the number of frames
 * Space Complexity: O(k) where k is the number of significant frames
 *
 * @param stackTrace - Array of stack frames
 * @returns Filtered array of significant frames
 */
function extractSignificantFrames(stackTrace: StackFrame[]): StackFrame[] {
  return stackTrace.filter((frame) => {
    // Skip native frames
    if (frame.isNative) {
      return false;
    }

    const file = frame.file?.toLowerCase() ?? "";

    // Skip node_modules
    if (file.includes("node_modules")) {
      return false;
    }

    // Skip Tauri runtime internals
    if (file.includes("tauri:") || file.includes("@tauri-apps")) {
      return false;
    }

    // Skip common runtime internals
    if (
      file.includes("internal/") ||
      file.startsWith("node:") ||
      file.includes("webpack/") ||
      file.includes("vite/")
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Computes a fingerprint for a crash report to enable grouping.
 *
 * The fingerprint is computed from:
 * 1. Error type (e.g., "TypeError", "RangeError")
 * 2. Top N (5) significant stack frames
 *
 * Time Complexity: O(n) for filtering + O(1) for hashing
 * Space Complexity: O(k) where k is the number of significant frames
 *
 * @param errorType - The error type/name
 * @param stackTrace - Array of stack frames
 * @returns SHA-256 hash fingerprint
 */
export function computeCrashFingerprint(
  errorType: string,
  stackTrace: StackFrame[]
): string {
  const significantFrames = extractSignificantFrames(stackTrace);

  // Take top 5 significant frames for fingerprinting
  const topFrames = significantFrames.slice(0, 5);

  const fingerprintParts = [
    errorType || "UnknownError",
    ...topFrames.map((frame) => {
      // Create a stable identifier for each frame
      if (frame.function) {
        return frame.function;
      }
      if (frame.file && frame.line !== undefined) {
        return `${frame.file}:${frame.line}`;
      }
      return frame.file ?? "unknown";
    }),
  ];

  // Create SHA-256 hash of the fingerprint
  return createHash("sha256")
    .update(fingerprintParts.join("|"))
    .digest("hex")
    .substring(0, 32); // Use first 32 chars for readability
}

// ============================================================================
// DTO Conversion
// ============================================================================

/**
 * Converts a database CrashReport to a CrashReportDto.
 */
function toCrashReportDto(report: CrashReport): CrashReportDto {
  let stackTrace: StackFrame[] = [];
  try {
    stackTrace = report.stackTrace ? JSON.parse(report.stackTrace) : [];
  } catch {
    stackTrace = [];
  }

  let deviceInfo: DeviceInfo | null = null;
  try {
    deviceInfo = report.deviceInfo ? JSON.parse(report.deviceInfo) : null;
  } catch {
    deviceInfo = null;
  }

  let appState: Record<string, unknown> | null = null;
  try {
    appState = report.appState ? JSON.parse(report.appState) : null;
  } catch {
    appState = null;
  }

  let breadcrumbs: Breadcrumb[] = [];
  try {
    breadcrumbs = report.breadcrumbs ? JSON.parse(report.breadcrumbs) : [];
  } catch {
    breadcrumbs = [];
  }

  return {
    id: report.id,
    appId: report.appId,
    crashGroupId: report.crashGroupId,
    errorType: report.errorType,
    errorMessage: report.errorMessage,
    stackTrace,
    appVersion: report.appVersion,
    platform: report.platform,
    osVersion: report.osVersion,
    deviceInfo,
    appState,
    breadcrumbs,
    fingerprint: report.fingerprint,
    severity: report.severity as CrashSeverity,
    userId: report.userId,
    createdAt: report.createdAt.toISOString(),
  };
}

/**
 * Converts a database CrashGroup to a CrashGroupDto.
 */
function toCrashGroupDto(group: CrashGroup): CrashGroupDto {
  let affectedVersions: string[] = [];
  try {
    affectedVersions = group.affectedVersions ? JSON.parse(group.affectedVersions) : [];
  } catch {
    affectedVersions = [];
  }

  let affectedPlatforms: string[] = [];
  try {
    affectedPlatforms = group.affectedPlatforms ? JSON.parse(group.affectedPlatforms) : [];
  } catch {
    affectedPlatforms = [];
  }

  return {
    id: group.id,
    appId: group.appId,
    fingerprint: group.fingerprint,
    errorType: group.errorType,
    errorMessage: group.errorMessage,
    occurrenceCount: group.occurrenceCount,
    affectedUsersCount: group.affectedUsersCount,
    firstSeenAt: group.firstSeenAt.toISOString(),
    lastSeenAt: group.lastSeenAt.toISOString(),
    affectedVersions,
    affectedPlatforms,
    status: group.status as CrashGroupStatus,
    assignedTo: group.assignedTo,
    resolutionNotes: group.resolutionNotes,
    resolvedAt: group.resolvedAt?.toISOString() ?? null,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

// ============================================================================
// Crash Report Operations
// ============================================================================

/**
 * Submits a new crash report from the SDK.
 * Creates or updates the associated crash group.
 *
 * @param appId - The app ID
 * @param publicKeyId - The public API key ID used for submission
 * @param data - The crash report data
 * @returns The created crash report DTO with group ID
 */
export async function submitCrashReport(
  appId: string,
  publicKeyId: string,
  data: SubmitCrashReportDto
): Promise<{ report: CrashReportDto; groupId: string }> {
  const now = new Date();

  // Compute fingerprint for grouping
  const fingerprint = computeCrashFingerprint(data.errorType, data.stackTrace);

  // Find or create crash group
  let existingGroup = await db.query.crashGroups.findFirst({
    where: eq(crashGroups.fingerprint, fingerprint),
  });

  let groupId: string;

  if (existingGroup) {
    // Update existing group
    groupId = existingGroup.id;

    // Parse existing versions and platforms
    let affectedVersions: string[] = [];
    let affectedPlatforms: string[] = [];
    let affectedUsersCount = existingGroup.affectedUsersCount;

    try {
      affectedVersions = existingGroup.affectedVersions
        ? JSON.parse(existingGroup.affectedVersions)
        : [];
    } catch {
      affectedVersions = [];
    }

    try {
      affectedPlatforms = existingGroup.affectedPlatforms
        ? JSON.parse(existingGroup.affectedPlatforms)
        : [];
    } catch {
      affectedPlatforms = [];
    }

    // Add new version/platform if not already present
    if (!affectedVersions.includes(data.appVersion)) {
      affectedVersions.push(data.appVersion);
    }
    if (!affectedPlatforms.includes(data.platform)) {
      affectedPlatforms.push(data.platform);
    }

    // Track unique users if userId provided
    if (data.userId) {
      // Check if this user already reported this crash
      const existingUserReport = await db.query.crashReports.findFirst({
        where: and(
          eq(crashReports.crashGroupId, groupId),
          eq(crashReports.userId, data.userId)
        ),
      });

      if (!existingUserReport) {
        affectedUsersCount++;
      }
    }

    // Update group
    await db
      .update(crashGroups)
      .set({
        occurrenceCount: existingGroup.occurrenceCount + 1,
        affectedUsersCount,
        lastSeenAt: now,
        affectedVersions: JSON.stringify(affectedVersions),
        affectedPlatforms: JSON.stringify(affectedPlatforms),
        updatedAt: now,
        // Re-open if was resolved and new crash came in
        status:
          existingGroup.status === "resolved" ? "new" : existingGroup.status,
      })
      .where(eq(crashGroups.id, groupId));
  } else {
    // Create new group
    groupId = ulid();

    const newGroup: NewCrashGroup = {
      id: groupId,
      appId,
      fingerprint,
      errorType: data.errorType,
      errorMessage: data.errorMessage,
      occurrenceCount: 1,
      affectedUsersCount: data.userId ? 1 : 0,
      firstSeenAt: now,
      lastSeenAt: now,
      affectedVersions: JSON.stringify([data.appVersion]),
      affectedPlatforms: JSON.stringify([data.platform]),
      status: "new",
      assignedTo: null,
      resolutionNotes: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(crashGroups).values(newGroup);
  }

  // Create crash report
  const newReport: NewCrashReport = {
    id: ulid(),
    appId,
    crashGroupId: groupId,
    publicKeyId,
    errorType: data.errorType,
    errorMessage: data.errorMessage,
    stackTrace: JSON.stringify(data.stackTrace),
    appVersion: data.appVersion,
    platform: data.platform,
    osVersion: data.osVersion ?? null,
    deviceInfo: data.deviceInfo ? JSON.stringify(data.deviceInfo) : null,
    appState: data.appState ? JSON.stringify(data.appState) : null,
    breadcrumbs: data.breadcrumbs ? JSON.stringify(data.breadcrumbs) : "[]",
    fingerprint,
    severity: data.severity ?? "error",
    userId: data.userId ?? null,
    createdAt: now,
  };

  await db.insert(crashReports).values(newReport);

  return {
    report: toCrashReportDto({
      ...newReport,
      createdAt: now,
    } as CrashReport),
    groupId,
  };
}

/**
 * Lists crash reports for an app with filtering and pagination.
 */
export async function listCrashReports(
  appId: string,
  query: ListCrashReportsQuery
): Promise<{ items: CrashReportDto[]; total: number }> {
  const { page, limit, groupId, version, severity } = query;
  const offset = (page - 1) * limit;

  const conditions = [eq(crashReports.appId, appId)];

  if (groupId) {
    conditions.push(eq(crashReports.crashGroupId, groupId));
  }

  if (version) {
    conditions.push(eq(crashReports.appVersion, version));
  }

  if (severity) {
    conditions.push(eq(crashReports.severity, severity));
  }

  const whereClause = and(...conditions);

  const [reportsList, countResult] = await Promise.all([
    db.query.crashReports.findMany({
      where: whereClause,
      orderBy: desc(crashReports.createdAt),
      limit,
      offset,
    }),
    db.select({ count: count() }).from(crashReports).where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;
  const items = reportsList.map(toCrashReportDto);

  return { items, total };
}

/**
 * Retrieves a crash report by ID.
 */
export async function getCrashReportById(
  id: string,
  appId: string
): Promise<CrashReportDto> {
  const report = await db.query.crashReports.findFirst({
    where: and(eq(crashReports.id, id), eq(crashReports.appId, appId)),
  });

  if (!report) {
    throw new CrashReportNotFoundError(id);
  }

  return toCrashReportDto(report);
}

// ============================================================================
// Crash Group Operations
// ============================================================================

/**
 * Lists crash groups for an app with filtering, sorting, and pagination.
 */
export async function listCrashGroups(
  appId: string,
  query: ListCrashGroupsQuery
): Promise<{ items: CrashGroupDto[]; total: number }> {
  const { page, limit, status, sort, order } = query;
  const offset = (page - 1) * limit;

  const conditions = [eq(crashGroups.appId, appId)];

  if (status) {
    conditions.push(eq(crashGroups.status, status));
  }

  const whereClause = and(...conditions);

  // Determine sort column and order
  let orderBy;
  const orderFn = order === "asc" ? asc : desc;

  switch (sort) {
    case "count":
      orderBy = orderFn(crashGroups.occurrenceCount);
      break;
    case "first_seen":
      orderBy = orderFn(crashGroups.firstSeenAt);
      break;
    case "last_seen":
    default:
      orderBy = orderFn(crashGroups.lastSeenAt);
      break;
  }

  const [groupsList, countResult] = await Promise.all([
    db.query.crashGroups.findMany({
      where: whereClause,
      orderBy,
      limit,
      offset,
    }),
    db.select({ count: count() }).from(crashGroups).where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;
  const items = groupsList.map(toCrashGroupDto);

  return { items, total };
}

/**
 * Retrieves a crash group by ID.
 */
export async function getCrashGroupById(
  id: string,
  appId: string
): Promise<CrashGroupDto> {
  const group = await db.query.crashGroups.findFirst({
    where: and(eq(crashGroups.id, id), eq(crashGroups.appId, appId)),
  });

  if (!group) {
    throw new CrashGroupNotFoundError(id);
  }

  return toCrashGroupDto(group);
}

/**
 * Updates a crash group (status, assignee, resolution notes).
 */
export async function updateCrashGroup(
  id: string,
  appId: string,
  data: UpdateCrashGroupDto
): Promise<CrashGroupDto> {
  const existing = await db.query.crashGroups.findFirst({
    where: and(eq(crashGroups.id, id), eq(crashGroups.appId, appId)),
  });

  if (!existing) {
    throw new CrashGroupNotFoundError(id);
  }

  const now = new Date();
  const updateData: Partial<NewCrashGroup> = {
    updatedAt: now,
  };

  if (data.status !== undefined) {
    updateData.status = data.status;

    // Set resolvedAt when marking as resolved
    if (data.status === "resolved" && existing.status !== "resolved") {
      updateData.resolvedAt = now;
    } else if (data.status !== "resolved" && existing.resolvedAt) {
      updateData.resolvedAt = null;
    }
  }

  if (data.assignedTo !== undefined) {
    updateData.assignedTo = data.assignedTo;
  }

  if (data.resolutionNotes !== undefined) {
    updateData.resolutionNotes = data.resolutionNotes;
  }

  await db.update(crashGroups).set(updateData).where(eq(crashGroups.id, id));

  return toCrashGroupDto({
    ...existing,
    ...updateData,
    updatedAt: now,
  } as CrashGroup);
}

// ============================================================================
// Crash Statistics
// ============================================================================

/**
 * Gets crash statistics for an app within a time period.
 *
 * @param appId - The app ID
 * @param period - Time period ("24h", "7d", "30d", "90d")
 * @returns Crash statistics
 */
export async function getCrashStats(
  appId: string,
  period: "24h" | "7d" | "30d" | "90d" = "7d"
): Promise<CrashStatsResponse> {
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case "24h":
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
  }

  const whereClause = and(
    eq(crashReports.appId, appId),
    gte(crashReports.createdAt, startDate)
  );

  // Get total crashes and groups count
  const [totalCrashesResult, totalGroupsResult] = await Promise.all([
    db.select({ count: count() }).from(crashReports).where(whereClause),
    db
      .select({ count: count() })
      .from(crashGroups)
      .where(eq(crashGroups.appId, appId)),
  ]);

  const totalCrashes = totalCrashesResult[0]?.count ?? 0;
  const totalGroups = totalGroupsResult[0]?.count ?? 0;

  // Get crashes by day
  const byDayResult = await db
    .select({
      date: sql<string>`DATE(${crashReports.createdAt})`.as("date"),
      count: count(),
    })
    .from(crashReports)
    .where(whereClause)
    .groupBy(sql`DATE(${crashReports.createdAt})`)
    .orderBy(sql`DATE(${crashReports.createdAt})`);

  // Get crashes by version
  const byVersionResult = await db
    .select({
      version: crashReports.appVersion,
      count: count(),
    })
    .from(crashReports)
    .where(whereClause)
    .groupBy(crashReports.appVersion)
    .orderBy(desc(count()));

  // Get crashes by platform
  const byPlatformResult = await db
    .select({
      platform: crashReports.platform,
      count: count(),
    })
    .from(crashReports)
    .where(whereClause)
    .groupBy(crashReports.platform)
    .orderBy(desc(count()));

  // Get top crash groups
  const topGroupsResult = await db
    .select({
      id: crashGroups.id,
      errorType: crashGroups.errorType,
      errorMessage: crashGroups.errorMessage,
      count: crashGroups.occurrenceCount,
    })
    .from(crashGroups)
    .where(eq(crashGroups.appId, appId))
    .orderBy(desc(crashGroups.occurrenceCount))
    .limit(10);

  return {
    totalCrashes,
    totalGroups,
    crashFreeRate: null, // Would need session tracking to calculate
    byDay: byDayResult.map((r) => ({
      date: r.date,
      count: r.count,
    })),
    byVersion: byVersionResult.map((r) => ({
      version: r.version,
      count: r.count,
    })),
    byPlatform: byPlatformResult.map((r) => ({
      platform: r.platform,
      count: r.count,
    })),
    topCrashGroups: topGroupsResult.map((r) => ({
      id: r.id,
      errorType: r.errorType,
      errorMessage: r.errorMessage,
      count: r.count,
    })),
    period: {
      start: startDate.toISOString(),
      end: now.toISOString(),
    },
  };
}
