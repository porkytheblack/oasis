import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { checkForUpdate, normalizePlatform } from "../services/update.service.js";
import { recordDownloadAsync } from "../services/analytics.service.js";
import { notFound, noContent, zodValidationError, success } from "../utils/response.js";
import { semverSchema } from "../types/index.js";
import type { InstallerPlatform } from "../types/index.js";
import { db, apps, releases, installers } from "../db/index.js";

/**
 * Public routes for Tauri update checks.
 *
 * These endpoints are called by Tauri applications to check for updates.
 * No authentication is required for these endpoints.
 */
export const publicRoutes = new Hono();

/**
 * Route parameter validation schema
 */
const updateParamsSchema = z.object({
  app_slug: z
    .string()
    .min(2, "App slug must be at least 2 characters")
    .max(50, "App slug must be at most 50 characters"),
  target: z
    .string()
    .min(1, "Target platform is required")
    .max(50, "Target platform must be at most 50 characters"),
  current_version: semverSchema,
});

/**
 * Extracts the country code from request headers.
 *
 * Checks common CDN headers for country information:
 * - CF-IPCountry (Cloudflare)
 * - X-Country-Code (Generic)
 * - X-Vercel-IP-Country (Vercel)
 *
 * @param headers - Request headers object
 * @returns ISO country code or undefined
 */
function extractCountryFromHeaders(
  getHeader: (name: string) => string | undefined
): string | undefined {
  // Cloudflare
  const cfCountry = getHeader("CF-IPCountry");
  if (cfCountry && cfCountry !== "XX") {
    return cfCountry.toUpperCase();
  }

  // Generic header
  const xCountry = getHeader("X-Country-Code");
  if (xCountry) {
    return xCountry.toUpperCase();
  }

  // Vercel
  const vercelCountry = getHeader("X-Vercel-IP-Country");
  if (vercelCountry) {
    return vercelCountry.toUpperCase();
  }

  // AWS CloudFront
  const cloudfrontCountry = getHeader("CloudFront-Viewer-Country");
  if (cloudfrontCountry) {
    return cloudfrontCountry.toUpperCase();
  }

  return undefined;
}

/**
 * GET /:app_slug/update/:target/:current_version
 *
 * Tauri update endpoint.
 *
 * Checks if an update is available for the given app, platform, and current version.
 *
 * Response codes:
 * - 200: Update available, returns TauriUpdateResponse JSON
 * - 204: No update available (current version is latest)
 * - 404: App not found
 * - 400: Invalid parameters
 *
 * @example
 * GET /my-app/update/darwin-aarch64/1.0.0
 *
 * Response (200):
 * {
 *   "version": "1.1.0",
 *   "notes": "Bug fixes and improvements",
 *   "pub_date": "2024-01-15T10:30:00.000Z",
 *   "url": "https://releases.example.com/my-app/1.1.0/darwin-aarch64.tar.gz",
 *   "signature": "dGhpcyBpcyBhIHNpZ25hdHVyZQ=="
 * }
 */
publicRoutes.get("/:app_slug/update/:target/:current_version", async (c) => {
  // Validate route parameters
  const parseResult = updateParamsSchema.safeParse({
    app_slug: c.req.param("app_slug"),
    target: c.req.param("target"),
    current_version: c.req.param("current_version"),
  });

  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  const { app_slug, target, current_version } = parseResult.data;

  // Check for update
  const result = await checkForUpdate(app_slug, target, current_version);

  if (result.hasUpdate) {
    // Record the download event asynchronously (non-blocking)
    const ipCountry = extractCountryFromHeaders((name) => c.req.header(name));
    recordDownloadAsync(
      result.metadata.artifactId,
      result.metadata.appId,
      result.metadata.platform,
      result.metadata.version,
      ipCountry
    );

    // Return the Tauri update response directly (not wrapped in our API response format)
    // Tauri expects the raw response format
    return c.json(result.response, 200);
  }

  // Handle the various "no update" cases
  switch (result.reason) {
    case "app_not_found":
      return notFound(c, "App", app_slug);

    case "no_update_available":
    case "no_artifact_for_platform":
      // Tauri expects 204 No Content when there's no update
      return noContent(c);
  }
});

/**
 * GET /:app_slug/update/:target/:arch/:current_version
 *
 * Alternative update endpoint that accepts arch as a separate parameter.
 * This handles the format some Tauri versions use.
 *
 * @example
 * GET /my-app/update/darwin/aarch64/1.0.0
 */
publicRoutes.get(
  "/:app_slug/update/:target/:arch/:current_version",
  async (c) => {
    const target = c.req.param("target");
    const arch = c.req.param("arch");

    // Combine target and arch into the standard format
    const combinedTarget = `${target}-${arch}`;

    // Validate route parameters
    const parseResult = updateParamsSchema.safeParse({
      app_slug: c.req.param("app_slug"),
      target: combinedTarget,
      current_version: c.req.param("current_version"),
    });

    if (!parseResult.success) {
      return zodValidationError(c, parseResult.error);
    }

    const { app_slug, target: normalizedTarget, current_version } = parseResult.data;

    // Check for update
    const result = await checkForUpdate(app_slug, normalizedTarget, current_version);

    if (result.hasUpdate) {
      // Record the download event asynchronously (non-blocking)
      const ipCountry = extractCountryFromHeaders((name) => c.req.header(name));
      recordDownloadAsync(
        result.metadata.artifactId,
        result.metadata.appId,
        result.metadata.platform,
        result.metadata.version,
        ipCountry
      );

      return c.json(result.response, 200);
    }

    switch (result.reason) {
      case "app_not_found":
        return notFound(c, "App", app_slug);

      case "no_update_available":
      case "no_artifact_for_platform":
        return noContent(c);
    }
  }
);

// ============================================================================
// Installer Download Routes
// ============================================================================

/**
 * Download parameter validation schema
 */
const downloadParamsSchema = z.object({
  app_slug: z
    .string()
    .min(2, "App slug must be at least 2 characters")
    .max(50, "App slug must be at most 50 characters"),
  platform: z
    .string()
    .min(1, "Platform is required")
    .max(50, "Platform must be at most 50 characters"),
});

/**
 * Download with version parameter validation schema
 */
const downloadWithVersionParamsSchema = downloadParamsSchema.extend({
  version: semverSchema,
});

/**
 * Platform fallback mapping for installer downloads.
 * When a specific platform installer is not found, try these fallbacks.
 *
 * For example, darwin-aarch64 can fall back to darwin-universal
 */
const PLATFORM_FALLBACKS: Record<string, string[]> = {
  "darwin-aarch64": ["darwin-universal"],
  "darwin-x86_64": ["darwin-universal"],
  "darwin-universal": [],
  "windows-x86_64": ["windows-x86"],
  "windows-aarch64": ["windows-x86_64", "windows-x86"],
  "windows-x86": [],
  "linux-x86_64": [],
  "linux-aarch64": [],
  "linux-armv7": [],
};

/**
 * Installer download response DTO
 */
interface InstallerDownloadInfo {
  id: string;
  platform: InstallerPlatform;
  filename: string;
  displayName: string | null;
  downloadUrl: string;
  fileSize: number | null;
  version: string;
  releaseNotes: string | null;
  publishedAt: string | null;
}

/**
 * Finds an installer for the given platform, trying fallbacks if not found.
 *
 * @param releaseId - The release ID to search in
 * @param requestedPlatform - The requested platform
 * @returns The installer or null if not found
 */
async function findInstallerWithFallback(
  releaseId: string,
  requestedPlatform: string
): Promise<{ installer: typeof installers.$inferSelect; matchedPlatform: string } | null> {
  // Normalize the platform
  const platform = normalizePlatform(requestedPlatform);

  // Try exact match first
  const exactMatch = await db.query.installers.findFirst({
    where: and(
      eq(installers.releaseId, releaseId),
      eq(installers.platform, platform)
    ),
  });

  if (exactMatch && exactMatch.downloadUrl) {
    return { installer: exactMatch, matchedPlatform: platform };
  }

  // Try fallbacks
  const fallbacks = PLATFORM_FALLBACKS[platform] ?? [];
  for (const fallbackPlatform of fallbacks) {
    const fallbackMatch = await db.query.installers.findFirst({
      where: and(
        eq(installers.releaseId, releaseId),
        eq(installers.platform, fallbackPlatform)
      ),
    });

    if (fallbackMatch && fallbackMatch.downloadUrl) {
      return { installer: fallbackMatch, matchedPlatform: fallbackPlatform };
    }
  }

  return null;
}

/**
 * GET /:app_slug/download/:platform
 *
 * Public endpoint to download the latest published release's installer for a given platform.
 *
 * Supports platform fallbacks:
 * - darwin-aarch64 can fall back to darwin-universal
 * - darwin-x86_64 can fall back to darwin-universal
 * - windows-aarch64 can fall back to windows-x86_64 or windows-x86
 *
 * Query parameters:
 * - format=json: Returns JSON with download info instead of redirecting
 *
 * Response codes:
 * - 302: Redirect to download URL (default behavior)
 * - 200: JSON with download info (if format=json)
 * - 404: App not found, no published releases, or no installer for platform
 *
 * @example
 * GET /my-app/download/darwin-aarch64
 * -> 302 Redirect to https://cdn.example.com/my-app/installers/1.2.0/MyApp-1.2.0-arm64.dmg
 *
 * @example
 * GET /my-app/download/darwin-aarch64?format=json
 * Response (200):
 * {
 *   "success": true,
 *   "data": {
 *     "id": "01HQWX...",
 *     "platform": "darwin-aarch64",
 *     "filename": "MyApp-1.2.0-arm64.dmg",
 *     "displayName": "MyApp for Apple Silicon",
 *     "downloadUrl": "https://cdn.example.com/...",
 *     "fileSize": 52428800,
 *     "version": "1.2.0",
 *     "releaseNotes": "### What's New...",
 *     "publishedAt": "2024-01-15T10:00:00.000Z"
 *   }
 * }
 */
publicRoutes.get("/:app_slug/download/:platform", async (c) => {
  // Validate route parameters
  const parseResult = downloadParamsSchema.safeParse({
    app_slug: c.req.param("app_slug"),
    platform: c.req.param("platform"),
  });

  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  const { app_slug, platform } = parseResult.data;
  const formatJson = c.req.query("format") === "json";

  // Find the app by slug
  const app = await db.query.apps.findFirst({
    where: eq(apps.slug, app_slug),
  });

  if (!app) {
    return notFound(c, "App", app_slug);
  }

  // Find the latest published release
  const latestRelease = await db.query.releases.findFirst({
    where: and(
      eq(releases.appId, app.id),
      eq(releases.status, "published")
    ),
    orderBy: desc(releases.pubDate),
  });

  if (!latestRelease) {
    return notFound(c, "Published release for app", app_slug);
  }

  // Find the installer for the requested platform (with fallback)
  const result = await findInstallerWithFallback(latestRelease.id, platform);

  if (!result) {
    return notFound(c, `Installer for platform '${platform}'`);
  }

  const { installer, matchedPlatform } = result;

  // downloadUrl is guaranteed to exist by findInstallerWithFallback
  // but we check again for TypeScript narrowing
  if (!installer.downloadUrl) {
    return notFound(c, `Installer for platform '${platform}'`);
  }
  const downloadUrl: string = installer.downloadUrl;

  // Record the download event asynchronously
  const ipCountry = extractCountryFromHeaders((name) => c.req.header(name));
  recordDownloadAsync(
    installer.id,
    app.id,
    matchedPlatform,
    latestRelease.version,
    ipCountry,
    "installer"
  );

  // Return JSON or redirect based on format query param
  if (formatJson) {
    const downloadInfo: InstallerDownloadInfo = {
      id: installer.id,
      platform: matchedPlatform as InstallerPlatform,
      filename: installer.filename,
      displayName: installer.displayName,
      downloadUrl,
      fileSize: installer.fileSize,
      version: latestRelease.version,
      releaseNotes: latestRelease.notes,
      publishedAt: latestRelease.pubDate?.toISOString() ?? null,
    };

    return success(c, downloadInfo);
  }

  // Redirect to the download URL
  return c.redirect(downloadUrl, 302);
});

/**
 * GET /:app_slug/download/:platform/:version
 *
 * Public endpoint to download a specific version's installer for a given platform.
 *
 * Supports the same platform fallbacks as the latest download endpoint.
 *
 * Query parameters:
 * - format=json: Returns JSON with download info instead of redirecting
 *
 * Response codes:
 * - 302: Redirect to download URL (default behavior)
 * - 200: JSON with download info (if format=json)
 * - 404: App not found, version not found, or no installer for platform
 *
 * @example
 * GET /my-app/download/darwin-aarch64/1.2.0
 * -> 302 Redirect to https://cdn.example.com/my-app/installers/1.2.0/MyApp-1.2.0-arm64.dmg
 */
publicRoutes.get("/:app_slug/download/:platform/:version", async (c) => {
  // Validate route parameters
  const parseResult = downloadWithVersionParamsSchema.safeParse({
    app_slug: c.req.param("app_slug"),
    platform: c.req.param("platform"),
    version: c.req.param("version"),
  });

  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  const { app_slug, platform, version } = parseResult.data;
  const formatJson = c.req.query("format") === "json";

  // Find the app by slug
  const app = await db.query.apps.findFirst({
    where: eq(apps.slug, app_slug),
  });

  if (!app) {
    return notFound(c, "App", app_slug);
  }

  // Find the specific release by version (must be published)
  const release = await db.query.releases.findFirst({
    where: and(
      eq(releases.appId, app.id),
      eq(releases.version, version),
      eq(releases.status, "published")
    ),
  });

  if (!release) {
    return notFound(c, `Published release version '${version}' for app`, app_slug);
  }

  // Find the installer for the requested platform (with fallback)
  const result = await findInstallerWithFallback(release.id, platform);

  if (!result) {
    return notFound(c, `Installer for platform '${platform}' in version '${version}'`);
  }

  const { installer: versionedInstaller, matchedPlatform: versionedMatchedPlatform } = result;

  // downloadUrl is guaranteed to exist by findInstallerWithFallback
  // but we check again for TypeScript narrowing
  if (!versionedInstaller.downloadUrl) {
    return notFound(c, `Installer for platform '${platform}' in version '${version}'`);
  }
  const versionedDownloadUrl: string = versionedInstaller.downloadUrl;

  // Record the download event asynchronously
  const ipCountryVersioned = extractCountryFromHeaders((name) => c.req.header(name));
  recordDownloadAsync(
    versionedInstaller.id,
    app.id,
    versionedMatchedPlatform,
    release.version,
    ipCountryVersioned,
    "installer"
  );

  // Return JSON or redirect based on format query param
  if (formatJson) {
    const downloadInfo: InstallerDownloadInfo = {
      id: versionedInstaller.id,
      platform: versionedMatchedPlatform as InstallerPlatform,
      filename: versionedInstaller.filename,
      displayName: versionedInstaller.displayName,
      downloadUrl: versionedDownloadUrl,
      fileSize: versionedInstaller.fileSize,
      version: release.version,
      releaseNotes: release.notes,
      publishedAt: release.pubDate?.toISOString() ?? null,
    };

    return success(c, downloadInfo);
  }

  // Redirect to the download URL
  return c.redirect(versionedDownloadUrl, 302);
});
