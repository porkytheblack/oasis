import { Hono } from "hono";
import { z } from "zod";
import { checkForUpdate } from "../services/update.service.js";
import { recordDownloadAsync } from "../services/analytics.service.js";
import { notFound, noContent, zodValidationError } from "../utils/response.js";
import { semverSchema } from "../types/index.js";

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
