import { eq, and, desc, count } from "drizzle-orm";
import { ulid } from "ulid";
import { db, releases, apps } from "../db/index.js";
import type { Release, NewRelease } from "../db/schema.js";
import type { ReleaseStatus, ReleaseDto } from "../types/index.js";

/**
 * Error thrown when a release is not found
 */
export class ReleaseNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Release with identifier '${identifier}' was not found`);
    this.name = "ReleaseNotFoundError";
  }
}

/**
 * Error thrown when a release version conflicts with an existing version
 */
export class ReleaseVersionConflictError extends Error {
  constructor(appId: string, version: string) {
    super(`Release version '${version}' already exists for app '${appId}'`);
    this.name = "ReleaseVersionConflictError";
  }
}

/**
 * Error thrown when an operation is not allowed for the current release status
 */
export class ReleaseStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseStatusError";
  }
}

/**
 * Error thrown when the app is not found for a release operation
 */
export class AppNotFoundForReleaseError extends Error {
  constructor(appId: string) {
    super(`App with identifier '${appId}' was not found`);
    this.name = "AppNotFoundForReleaseError";
  }
}

/**
 * Input data for creating a new release
 */
export interface CreateReleaseInput {
  version: string;
  notes?: string | null;
}

/**
 * Input data for updating a release
 */
export interface UpdateReleaseInput {
  notes?: string | null;
  status?: ReleaseStatus;
}

/**
 * Options for listing releases
 */
export interface ListReleasesOptions {
  status?: ReleaseStatus;
  page: number;
  limit: number;
}

/**
 * Converts a database Release record to a ReleaseDto for API responses.
 *
 * @param release - The database record
 * @returns The release DTO
 */
function toReleaseDto(release: Release): ReleaseDto {
  return {
    id: release.id,
    appId: release.appId,
    version: release.version,
    notes: release.notes,
    pubDate: release.pubDate?.toISOString() ?? null,
    status: release.status as ReleaseStatus,
    createdAt: release.createdAt.toISOString(),
    updatedAt: release.updatedAt.toISOString(),
  };
}

/**
 * Verifies that an app exists.
 *
 * @param appId - The app ID to verify
 * @throws AppNotFoundForReleaseError if the app does not exist
 */
async function verifyAppExists(appId: string): Promise<void> {
  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
  });

  if (!app) {
    throw new AppNotFoundForReleaseError(appId);
  }
}

/**
 * Creates a new release in draft status.
 *
 * @param appId - The app ID to create the release for
 * @param data - The release creation data
 * @returns The created release DTO
 * @throws AppNotFoundForReleaseError if the app does not exist
 * @throws ReleaseVersionConflictError if the version already exists
 */
export async function createRelease(
  appId: string,
  data: CreateReleaseInput
): Promise<ReleaseDto> {
  // Verify app exists
  await verifyAppExists(appId);

  // Check for existing version
  const existing = await db.query.releases.findFirst({
    where: and(eq(releases.appId, appId), eq(releases.version, data.version)),
  });

  if (existing) {
    throw new ReleaseVersionConflictError(appId, data.version);
  }

  const now = new Date();
  const newRelease: NewRelease = {
    id: ulid(),
    appId,
    version: data.version,
    notes: data.notes ?? null,
    status: "draft",
    pubDate: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(releases).values(newRelease);

  const createdRelease: Release = {
    id: newRelease.id,
    appId: newRelease.appId,
    version: newRelease.version,
    notes: newRelease.notes ?? null,
    status: newRelease.status ?? "draft",
    pubDate: null,
    createdAt: now,
    updatedAt: now,
  };

  return toReleaseDto(createdRelease);
}

/**
 * Retrieves a release by ID with ownership verification.
 *
 * @param appId - The app ID for ownership check
 * @param releaseId - The release ID
 * @returns The release DTO
 * @throws ReleaseNotFoundError if the release does not exist or belongs to different app
 */
export async function getReleaseById(
  appId: string,
  releaseId: string
): Promise<ReleaseDto> {
  const release = await db.query.releases.findFirst({
    where: and(eq(releases.id, releaseId), eq(releases.appId, appId)),
  });

  if (!release) {
    throw new ReleaseNotFoundError(releaseId);
  }

  return toReleaseDto(release);
}

/**
 * Lists releases for an app with optional status filter and pagination.
 *
 * @param appId - The app ID
 * @param options - List options including status filter and pagination
 * @returns Object with items array and total count
 */
export async function listReleases(
  appId: string,
  options: ListReleasesOptions
): Promise<{ items: ReleaseDto[]; total: number }> {
  const { status, page, limit } = options;
  const offset = (page - 1) * limit;

  // Build where conditions
  const conditions = [eq(releases.appId, appId)];
  if (status !== undefined) {
    conditions.push(eq(releases.status, status));
  }

  const whereClause = and(...conditions);

  const [releasesList, countResult] = await Promise.all([
    db.query.releases.findMany({
      where: whereClause,
      orderBy: desc(releases.createdAt),
      limit,
      offset,
    }),
    db.select({ count: count() }).from(releases).where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    items: releasesList.map(toReleaseDto),
    total,
  };
}

/**
 * Updates a release.
 *
 * @param appId - The app ID for ownership check
 * @param releaseId - The release ID to update
 * @param data - The update data
 * @returns The updated release DTO
 * @throws ReleaseNotFoundError if the release does not exist or belongs to different app
 */
export async function updateRelease(
  appId: string,
  releaseId: string,
  data: UpdateReleaseInput
): Promise<ReleaseDto> {
  // Verify release exists and belongs to app
  const existing = await db.query.releases.findFirst({
    where: and(eq(releases.id, releaseId), eq(releases.appId, appId)),
  });

  if (!existing) {
    throw new ReleaseNotFoundError(releaseId);
  }

  const now = new Date();
  const updateData: Partial<NewRelease> = {
    updatedAt: now,
  };

  if (data.notes !== undefined) {
    updateData.notes = data.notes;
  }

  if (data.status !== undefined) {
    updateData.status = data.status;
    // If publishing, set pubDate
    if (data.status === "published" && existing.status !== "published") {
      updateData.pubDate = now;
    }
  }

  await db.update(releases).set(updateData).where(eq(releases.id, releaseId));

  // Fetch updated record
  const updated = await db.query.releases.findFirst({
    where: eq(releases.id, releaseId),
  });

  if (!updated) {
    throw new ReleaseNotFoundError(releaseId);
  }

  return toReleaseDto(updated);
}

/**
 * Deletes a release. Only draft releases can be deleted.
 *
 * @param appId - The app ID for ownership check
 * @param releaseId - The release ID to delete
 * @throws ReleaseNotFoundError if the release does not exist or belongs to different app
 * @throws ReleaseStatusError if the release is not in draft status
 */
export async function deleteRelease(appId: string, releaseId: string): Promise<void> {
  // Verify release exists and belongs to app
  const existing = await db.query.releases.findFirst({
    where: and(eq(releases.id, releaseId), eq(releases.appId, appId)),
  });

  if (!existing) {
    throw new ReleaseNotFoundError(releaseId);
  }

  // Only draft releases can be deleted
  if (existing.status !== "draft") {
    throw new ReleaseStatusError(
      `Cannot delete release in '${existing.status}' status. Only draft releases can be deleted.`
    );
  }

  await db.delete(releases).where(eq(releases.id, releaseId));
}

/**
 * Publishes a release by setting status to 'published' and pubDate to now.
 *
 * @param appId - The app ID for ownership check
 * @param releaseId - The release ID to publish
 * @returns The published release DTO
 * @throws ReleaseNotFoundError if the release does not exist or belongs to different app
 * @throws ReleaseStatusError if the release cannot be published from its current status
 */
export async function publishRelease(
  appId: string,
  releaseId: string
): Promise<ReleaseDto> {
  // Verify release exists and belongs to app
  const existing = await db.query.releases.findFirst({
    where: and(eq(releases.id, releaseId), eq(releases.appId, appId)),
  });

  if (!existing) {
    throw new ReleaseNotFoundError(releaseId);
  }

  // Only draft releases can be published
  if (existing.status === "published") {
    throw new ReleaseStatusError("Release is already published");
  }

  if (existing.status === "archived") {
    throw new ReleaseStatusError(
      "Cannot publish an archived release. Create a new release instead."
    );
  }

  const now = new Date();

  await db
    .update(releases)
    .set({
      status: "published",
      pubDate: now,
      updatedAt: now,
    })
    .where(eq(releases.id, releaseId));

  // Fetch updated record
  const updated = await db.query.releases.findFirst({
    where: eq(releases.id, releaseId),
  });

  if (!updated) {
    throw new ReleaseNotFoundError(releaseId);
  }

  return toReleaseDto(updated);
}

/**
 * Archives a release by setting status to 'archived'.
 *
 * @param appId - The app ID for ownership check
 * @param releaseId - The release ID to archive
 * @returns The archived release DTO
 * @throws ReleaseNotFoundError if the release does not exist or belongs to different app
 * @throws ReleaseStatusError if the release cannot be archived from its current status
 */
export async function archiveRelease(
  appId: string,
  releaseId: string
): Promise<ReleaseDto> {
  // Verify release exists and belongs to app
  const existing = await db.query.releases.findFirst({
    where: and(eq(releases.id, releaseId), eq(releases.appId, appId)),
  });

  if (!existing) {
    throw new ReleaseNotFoundError(releaseId);
  }

  // Check if already archived
  if (existing.status === "archived") {
    throw new ReleaseStatusError("Release is already archived");
  }

  const now = new Date();

  await db
    .update(releases)
    .set({
      status: "archived",
      updatedAt: now,
    })
    .where(eq(releases.id, releaseId));

  // Fetch updated record
  const updated = await db.query.releases.findFirst({
    where: eq(releases.id, releaseId),
  });

  if (!updated) {
    throw new ReleaseNotFoundError(releaseId);
  }

  return toReleaseDto(updated);
}

/**
 * Gets the raw release record for internal use.
 *
 * @param releaseId - The release ID
 * @returns The release record or null
 */
export async function getRawReleaseById(releaseId: string): Promise<Release | null> {
  const release = await db.query.releases.findFirst({
    where: eq(releases.id, releaseId),
  });

  return release ?? null;
}

/**
 * Checks if a release exists and belongs to the specified app.
 *
 * @param appId - The app ID
 * @param releaseId - The release ID
 * @returns true if the release exists and belongs to the app
 */
export async function releaseExistsForApp(
  appId: string,
  releaseId: string
): Promise<boolean> {
  const release = await db.query.releases.findFirst({
    where: and(eq(releases.id, releaseId), eq(releases.appId, appId)),
  });

  return release !== undefined;
}
