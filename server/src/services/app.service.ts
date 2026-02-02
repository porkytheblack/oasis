import { eq, desc, count, and } from "drizzle-orm";
import { ulid } from "ulid";
import { db, apps, releases } from "../db/index.js";
import type { App, NewApp } from "../db/schema.js";
import type { CreateAppDto, UpdateAppDto, AppDto } from "../types/index.js";

/**
 * Extended app info including release statistics
 */
interface AppWithStats extends App {
  releaseCount: number;
  latestVersion: string | null;
}

/**
 * Service error types for better error handling
 */
export class AppNotFoundError extends Error {
  constructor(identifier: string) {
    super(`App with identifier '${identifier}' was not found`);
    this.name = "AppNotFoundError";
  }
}

export class AppSlugConflictError extends Error {
  constructor(slug: string) {
    super(`An app with slug '${slug}' already exists`);
    this.name = "AppSlugConflictError";
  }
}

export class AppHasPublishedReleasesError extends Error {
  constructor(appId: string) {
    super(`Cannot delete app '${appId}' because it has published releases`);
    this.name = "AppHasPublishedReleasesError";
  }
}

/**
 * Converts a database App record to an AppDto for API responses
 */
function toAppDto(app: App | AppWithStats): AppDto {
  const hasStats = "releaseCount" in app;
  return {
    id: app.id,
    slug: app.slug,
    name: app.name,
    description: app.description,
    publicKey: app.publicKey,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
    releaseCount: hasStats ? app.releaseCount : 0,
    latestVersion: hasStats ? app.latestVersion : null,
  };
}

/**
 * Fetches release statistics for an app
 */
async function getAppReleaseStats(appId: string): Promise<{ releaseCount: number; latestVersion: string | null }> {
  // Get total release count
  const countResult = await db
    .select({ count: count() })
    .from(releases)
    .where(eq(releases.appId, appId));

  const releaseCount = countResult[0]?.count ?? 0;

  // Get latest published version
  const latestPublished = await db.query.releases.findFirst({
    where: and(eq(releases.appId, appId), eq(releases.status, "published")),
    orderBy: desc(releases.pubDate),
    columns: { version: true },
  });

  return {
    releaseCount,
    latestVersion: latestPublished?.version ?? null,
  };
}

/**
 * Creates a new application.
 *
 * @param data - The app creation data
 * @returns The created app DTO
 * @throws AppSlugConflictError if the slug is already taken
 */
export async function createApp(data: CreateAppDto): Promise<AppDto> {
  // Check if slug already exists
  const existing = await db.query.apps.findFirst({
    where: eq(apps.slug, data.slug),
  });

  if (existing) {
    throw new AppSlugConflictError(data.slug);
  }

  const now = new Date();
  const newApp: NewApp = {
    id: ulid(),
    slug: data.slug,
    name: data.name,
    description: data.description ?? null,
    publicKey: data.publicKey ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(apps).values(newApp);

  // Construct the complete app object for conversion to DTO
  // New apps have no releases yet
  const createdApp: AppWithStats = {
    id: newApp.id,
    slug: newApp.slug,
    name: newApp.name,
    description: data.description ?? null,
    publicKey: data.publicKey ?? null,
    createdAt: now,
    updatedAt: now,
    releaseCount: 0,
    latestVersion: null,
  };

  return toAppDto(createdApp);
}

/**
 * Retrieves an app by its ID.
 *
 * @param id - The app ID
 * @returns The app DTO
 * @throws AppNotFoundError if the app does not exist
 */
export async function getAppById(id: string): Promise<AppDto> {
  const app = await db.query.apps.findFirst({
    where: eq(apps.id, id),
  });

  if (!app) {
    throw new AppNotFoundError(id);
  }

  const stats = await getAppReleaseStats(app.id);
  return toAppDto({ ...app, ...stats });
}

/**
 * Retrieves an app by its slug.
 *
 * @param slug - The app slug
 * @returns The app DTO
 * @throws AppNotFoundError if the app does not exist
 */
export async function getAppBySlug(slug: string): Promise<AppDto> {
  const app = await db.query.apps.findFirst({
    where: eq(apps.slug, slug),
  });

  if (!app) {
    throw new AppNotFoundError(slug);
  }

  const stats = await getAppReleaseStats(app.id);
  return toAppDto({ ...app, ...stats });
}

/**
 * Retrieves the raw app record by slug for internal use.
 *
 * @param slug - The app slug
 * @returns The app record or null
 */
export async function getRawAppBySlug(slug: string): Promise<App | null> {
  const app = await db.query.apps.findFirst({
    where: eq(apps.slug, slug),
  });

  return app ?? null;
}

/**
 * Lists all apps with pagination.
 *
 * @param page - Page number (1-indexed)
 * @param limit - Number of items per page
 * @returns Object with items array and total count
 */
export async function listApps(
  page: number,
  limit: number
): Promise<{ items: AppDto[]; total: number }> {
  const offset = (page - 1) * limit;

  // Execute both queries in parallel for performance
  const [appsList, countResult] = await Promise.all([
    db.query.apps.findMany({
      orderBy: desc(apps.createdAt),
      limit,
      offset,
    }),
    db.select({ count: count() }).from(apps),
  ]);

  const total = countResult[0]?.count ?? 0;

  // Fetch release stats for each app in parallel
  const appsWithStats = await Promise.all(
    appsList.map(async (app) => {
      const stats = await getAppReleaseStats(app.id);
      return { ...app, ...stats };
    })
  );

  return {
    items: appsWithStats.map(toAppDto),
    total,
  };
}

/**
 * Updates an existing app.
 *
 * @param id - The app ID to update
 * @param data - The update data
 * @returns The updated app DTO
 * @throws AppNotFoundError if the app does not exist
 */
export async function updateApp(id: string, data: UpdateAppDto): Promise<AppDto> {
  // First verify the app exists
  const existing = await db.query.apps.findFirst({
    where: eq(apps.id, id),
  });

  if (!existing) {
    throw new AppNotFoundError(id);
  }

  const now = new Date();

  // Build update object only with provided fields
  const updateData: Partial<NewApp> = {
    updatedAt: now,
  };

  if (data.name !== undefined) {
    updateData.name = data.name;
  }

  if (data.description !== undefined) {
    updateData.description = data.description;
  }

  if (data.publicKey !== undefined) {
    updateData.publicKey = data.publicKey;
  }

  await db.update(apps).set(updateData).where(eq(apps.id, id));

  // Fetch and return the updated record
  const updated = await db.query.apps.findFirst({
    where: eq(apps.id, id),
  });

  if (!updated) {
    throw new AppNotFoundError(id);
  }

  const stats = await getAppReleaseStats(updated.id);
  return toAppDto({ ...updated, ...stats });
}

/**
 * Deletes an app.
 *
 * Only allows deletion if there are no published releases.
 * Draft and archived releases are allowed.
 *
 * @param id - The app ID to delete
 * @throws AppNotFoundError if the app does not exist
 * @throws AppHasPublishedReleasesError if the app has published releases
 */
export async function deleteApp(id: string): Promise<void> {
  // Verify the app exists
  const existing = await db.query.apps.findFirst({
    where: eq(apps.id, id),
  });

  if (!existing) {
    throw new AppNotFoundError(id);
  }

  // Check for published releases
  const publishedReleases = await db
    .select({ count: count() })
    .from(releases)
    .where(and(eq(releases.appId, id), eq(releases.status, "published")));

  const publishedCount = publishedReleases[0]?.count ?? 0;

  if (publishedCount > 0) {
    throw new AppHasPublishedReleasesError(id);
  }

  // Delete the app (cascades to draft/archived releases and other related records)
  await db.delete(apps).where(eq(apps.id, id));
}

/**
 * Checks if an app exists by ID.
 *
 * @param id - The app ID
 * @returns true if the app exists, false otherwise
 */
export async function appExists(id: string): Promise<boolean> {
  const result = await db
    .select({ count: count() })
    .from(apps)
    .where(eq(apps.id, id));

  return (result[0]?.count ?? 0) > 0;
}

/**
 * Checks if an app slug is available.
 *
 * @param slug - The slug to check
 * @returns true if the slug is available, false otherwise
 */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  const existing = await db.query.apps.findFirst({
    where: eq(apps.slug, slug),
  });

  return !existing;
}
