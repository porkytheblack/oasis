import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { db, apps } from "../db/index.js";
import { validatePublicApiKey } from "../services/public-key.service.js";
import { unauthorized, forbidden } from "../utils/response.js";

/**
 * Authenticated public API key information attached to Hono context
 */
export interface AuthenticatedPublicKey {
  /** The public API key ID (ULID) */
  id: string;
  /** The app ID the key is scoped to */
  appId: string;
}

/**
 * Hono context variables for SDK authenticated requests
 */
export interface SdkAuthVariables {
  publicApiKey: AuthenticatedPublicKey;
}

/**
 * Extracts the public API key from the X-API-Key header.
 *
 * @param apiKeyHeader - The X-API-Key header value
 * @returns The key if present and valid format, null otherwise
 */
function extractPublicApiKey(apiKeyHeader: string | undefined): string | null {
  if (!apiKeyHeader) {
    return null;
  }

  // Public keys start with "pk_"
  if (!apiKeyHeader.startsWith("pk_")) {
    return null;
  }

  return apiKeyHeader;
}

/**
 * Authentication middleware for SDK routes.
 *
 * Validates the X-API-Key header contains a valid `pk_` prefixed public API key.
 * The key is hashed with SHA-256 and looked up in the public_api_keys table.
 * The key must not be revoked (revoked_at must be NULL).
 *
 * On success, attaches the key info to the Hono context and updates last_used_at.
 * On failure, returns 401 Unauthorized response.
 *
 * @example
 * // Apply to all SDK routes
 * sdkRoutes.use("*", sdkAuthMiddleware);
 *
 * // Access authenticated key in route handler
 * app.post("/sdk/feedback", (c) => {
 *   const publicKey = c.get("publicApiKey");
 *   console.log(`Request from app: ${publicKey.appId}`);
 * });
 */
export const sdkAuthMiddleware: MiddlewareHandler<{ Variables: SdkAuthVariables }> = async (
  c,
  next
) => {
  const apiKeyHeader = c.req.header("X-API-Key");
  const apiKey = extractPublicApiKey(apiKeyHeader);

  if (!apiKey) {
    return unauthorized(c, "Missing or invalid X-API-Key header. Expected: pk_...");
  }

  // Validate the key
  const keyInfo = await validatePublicApiKey(apiKey);

  if (!keyInfo) {
    return unauthorized(c, "Invalid or revoked API key");
  }

  // Attach key info to context
  const authenticatedKey: AuthenticatedPublicKey = {
    id: keyInfo.id,
    appId: keyInfo.appId,
  };

  c.set("publicApiKey", authenticatedKey);

  await next();
};

/**
 * Middleware to verify the SDK request is for the correct app.
 * Must be used after sdkAuthMiddleware.
 *
 * Compares the app_slug in the URL with the app the API key is scoped to.
 *
 * @param appSlugParam - The route parameter name containing the app slug (default: "app_slug")
 * @returns Middleware handler that checks app access
 */
export function requireSdkAppAccess(
  appSlugParam = "app_slug"
): MiddlewareHandler<{ Variables: SdkAuthVariables }> {
  return async (c, next) => {
    const publicKey = c.get("publicApiKey");
    const appSlug = c.req.param(appSlugParam);

    if (!appSlug) {
      return forbidden(c, "App slug is required for this operation");
    }

    // Look up the app by slug
    const app = await db.query.apps.findFirst({
      where: eq(apps.slug, appSlug),
    });

    if (!app) {
      return forbidden(c, `App '${appSlug}' was not found`);
    }

    // Verify the API key is for this app
    if (publicKey.appId !== app.id) {
      return forbidden(
        c,
        "This API key does not have access to the requested application"
      );
    }

    await next();
  };
}
