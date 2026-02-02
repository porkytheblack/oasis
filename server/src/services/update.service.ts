import { eq, and, desc } from "drizzle-orm";
import { db, apps, releases, artifacts } from "../db/index.js";
import type { App, Release, Artifact } from "../db/schema.js";
import type { TauriUpdateResponse } from "../types/index.js";
import { isNewerVersion, parseSemver, compareSemver } from "../utils/semver.js";

/**
 * Metadata about an update for analytics tracking
 */
export interface UpdateMetadata {
  /** The artifact ID */
  artifactId: string;
  /** The app ID */
  appId: string;
  /** The target platform */
  platform: string;
  /** The version being served */
  version: string;
}

/**
 * Result of checking for an update
 */
export type UpdateCheckResult =
  | { hasUpdate: true; response: TauriUpdateResponse; metadata: UpdateMetadata }
  | { hasUpdate: false; reason: "app_not_found" | "no_update_available" | "no_artifact_for_platform" };

/**
 * Normalizes target platform string to our standard format.
 * Handles various Tauri target formats:
 * - "darwin-aarch64" -> "darwin-aarch64"
 * - "darwin-x86_64" -> "darwin-x86_64"
 * - "linux-x86_64" -> "linux-x86_64"
 * - "windows-x86_64" -> "windows-x86_64"
 *
 * Also handles legacy formats like "darwin" or "macos":
 * - "darwin" or "macos" alone -> defaults to architecture based on common patterns
 *
 * @param target - The target platform string from Tauri
 * @returns Normalized platform string
 */
export function normalizePlatform(target: string): string {
  const normalized = target.toLowerCase().trim();

  // Map common aliases
  const platformAliases: Record<string, string> = {
    macos: "darwin",
    osx: "darwin",
    win: "windows",
    win64: "windows-x86_64",
    win32: "windows-x86_64",
    linux64: "linux-x86_64",
  };

  // Check for direct aliases
  const directAlias = platformAliases[normalized];
  if (directAlias !== undefined) {
    return directAlias;
  }

  // Handle compound formats like "darwin-aarch64" or "windows-x86_64"
  const parts = normalized.split("-");
  if (parts.length >= 2) {
    const firstPart = parts[0];
    if (firstPart === undefined) {
      return normalized;
    }
    let os = firstPart;
    const arch = parts.slice(1).join("-");

    // Normalize OS aliases
    const osAlias = platformAliases[os];
    if (osAlias !== undefined) {
      os = osAlias;
    }

    return `${os}-${arch}`;
  }

  // Return as-is if no transformation needed
  return normalized;
}

/**
 * Finds the latest published release for an app that is newer than the current version.
 *
 * @param appId - The app ID to search for
 * @param currentVersion - The current version to compare against
 * @returns The newest release or null if none found
 */
async function findLatestPublishedRelease(
  appId: string,
  currentVersion: string
): Promise<Release | null> {
  // Get all published releases for this app
  const publishedReleases = await db.query.releases.findMany({
    where: and(eq(releases.appId, appId), eq(releases.status, "published")),
    orderBy: desc(releases.pubDate),
  });

  if (publishedReleases.length === 0) {
    return null;
  }

  // Filter to releases newer than the current version and find the latest
  const newerReleases = publishedReleases.filter((release) =>
    isNewerVersion(currentVersion, release.version)
  );

  if (newerReleases.length === 0) {
    return null;
  }

  // Sort by version descending to get the latest
  newerReleases.sort((a, b) => {
    const semverA = parseSemver(a.version);
    const semverB = parseSemver(b.version);
    if (!semverA || !semverB) return 0;
    return -compareSemver(semverA, semverB);
  });

  return newerReleases[0] ?? null;
}

/**
 * Finds the artifact for a specific platform in a release.
 *
 * @param releaseId - The release ID
 * @param platform - The normalized platform string
 * @returns The artifact or null if not found
 */
async function findArtifactForPlatform(
  releaseId: string,
  platform: string
): Promise<Artifact | null> {
  const artifact = await db.query.artifacts.findFirst({
    where: and(eq(artifacts.releaseId, releaseId), eq(artifacts.platform, platform)),
  });

  return artifact ?? null;
}

/**
 * Checks if there is an update available for a given app, platform, and current version.
 *
 * This is the core update check logic used by the public update endpoint.
 *
 * @param appSlug - The app slug
 * @param target - The target platform (e.g., "darwin-aarch64", "windows-x86_64")
 * @param currentVersion - The current version of the app
 * @returns UpdateCheckResult indicating if an update is available
 */
export async function checkForUpdate(
  appSlug: string,
  target: string,
  currentVersion: string
): Promise<UpdateCheckResult> {
  // Find the app by slug
  const app = await db.query.apps.findFirst({
    where: eq(apps.slug, appSlug),
  });

  if (!app) {
    return { hasUpdate: false, reason: "app_not_found" };
  }

  // Normalize the platform
  const platform = normalizePlatform(target);

  // Find the latest published release newer than the current version
  const latestRelease = await findLatestPublishedRelease(app.id, currentVersion);

  if (!latestRelease) {
    return { hasUpdate: false, reason: "no_update_available" };
  }

  // Find the artifact for this platform
  const artifact = await findArtifactForPlatform(latestRelease.id, platform);

  if (!artifact) {
    return { hasUpdate: false, reason: "no_artifact_for_platform" };
  }

  // Ensure we have a download URL
  if (!artifact.downloadUrl) {
    return { hasUpdate: false, reason: "no_artifact_for_platform" };
  }

  // Build the Tauri update response
  const response: TauriUpdateResponse = {
    version: latestRelease.version,
    url: artifact.downloadUrl,
  };

  // Add optional fields if present
  if (latestRelease.notes) {
    response.notes = latestRelease.notes;
  }

  if (latestRelease.pubDate) {
    response.pub_date = latestRelease.pubDate.toISOString();
  }

  // Signature is required if the app has a public key configured
  if (artifact.signature) {
    response.signature = artifact.signature;
  } else if (app.publicKey) {
    // If app requires signing but artifact has no signature, don't serve the update
    // This prevents unsigned updates from being served to apps expecting signatures
    return { hasUpdate: false, reason: "no_artifact_for_platform" };
  }

  // Include metadata for analytics tracking
  const metadata: UpdateMetadata = {
    artifactId: artifact.id,
    appId: app.id,
    platform,
    version: latestRelease.version,
  };

  return { hasUpdate: true, response, metadata };
}

/**
 * Retrieves the app record and validates it exists.
 * Utility function for routes that need app information.
 *
 * @param slug - The app slug
 * @returns The app record or null
 */
export async function getAppForUpdate(slug: string): Promise<App | null> {
  const app = await db.query.apps.findFirst({
    where: eq(apps.slug, slug),
  });

  return app ?? null;
}
