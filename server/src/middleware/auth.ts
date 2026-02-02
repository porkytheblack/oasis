import type { MiddlewareHandler } from "hono";
import { createHash } from "node:crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db, apiKeys } from "../db/index.js";
import type { ApiKeyScope } from "../types/index.js";
import { unauthorized, forbidden } from "../utils/response.js";

/**
 * Authenticated API key information attached to Hono context
 */
export interface AuthenticatedKey {
  /** The API key ID (ULID) */
  id: string;
  /** The key's permission scope */
  scope: ApiKeyScope;
  /** The app ID the key is scoped to (null for global keys) */
  appId: string | null;
  /** The key name for logging purposes */
  name: string;
}

/**
 * Hono context variables for authenticated requests
 */
export interface AuthVariables {
  apiKey: AuthenticatedKey;
}

/**
 * Extracts the bearer token from the Authorization header.
 *
 * @param authHeader - The Authorization header value
 * @returns The token if present and valid, null otherwise
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer") {
    return null;
  }

  const token = parts[1];
  if (!token || !token.startsWith("uk_live_")) {
    return null;
  }

  return token;
}

/**
 * Hashes an API key using SHA-256 for secure storage comparison.
 *
 * @param key - The raw API key
 * @returns The SHA-256 hash of the key as a hex string
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Updates the last_used_at timestamp for an API key asynchronously.
 * This function does not block the request and errors are logged but not thrown.
 *
 * @param keyId - The API key ID to update
 */
function updateLastUsedAsync(keyId: string): void {
  const now = new Date();
  db.update(apiKeys)
    .set({ lastUsedAt: now })
    .where(eq(apiKeys.id, keyId))
    .then(() => {
      // Successfully updated last_used_at
    })
    .catch((error) => {
      console.error(`Failed to update last_used_at for key ${keyId}:`, error);
    });
}

/**
 * Authentication middleware for admin API routes.
 *
 * Validates the Authorization header contains a valid `uk_live_` prefixed API key.
 * The key is hashed with SHA-256 and looked up in the api_keys table.
 * The key must not be revoked (revoked_at must be NULL).
 *
 * On success, attaches the key info to the Hono context and updates last_used_at.
 * On failure, returns 401 Unauthorized or 403 Forbidden response.
 *
 * @example
 * // Apply to all admin routes
 * adminRoutes.use("*", authMiddleware);
 *
 * // Access authenticated key in route handler
 * app.get("/admin/protected", (c) => {
 *   const apiKey = c.get("apiKey");
 *   console.log(`Request from key: ${apiKey.name}`);
 * });
 */
export const authMiddleware: MiddlewareHandler<{ Variables: AuthVariables }> = async (
  c,
  next
) => {
  const authHeader = c.req.header("Authorization");
  const token = extractBearerToken(authHeader);

  if (!token) {
    return unauthorized(c, "Missing or invalid Authorization header. Expected: Bearer uk_live_...");
  }

  // Hash the token for database lookup
  const keyHash = hashApiKey(token);

  // Look up the key in the database
  const apiKey = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)),
  });

  if (!apiKey) {
    return unauthorized(c, "Invalid or revoked API key");
  }

  // Attach key info to context
  const authenticatedKey: AuthenticatedKey = {
    id: apiKey.id,
    scope: apiKey.scope as ApiKeyScope,
    appId: apiKey.appId,
    name: apiKey.name,
  };

  c.set("apiKey", authenticatedKey);

  // Update last_used_at asynchronously (non-blocking)
  updateLastUsedAsync(apiKey.id);

  await next();
};

/**
 * Middleware to verify the authenticated key has access to a specific app.
 * Must be used after authMiddleware.
 *
 * For admin-scoped keys: allows access to any app
 * For ci-scoped keys: only allows access to their assigned app
 *
 * @param appIdParam - The route parameter name containing the app ID (default: "app_id")
 * @returns Middleware handler that checks app access
 */
export function requireAppAccess(
  appIdParam = "app_id"
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const apiKey = c.get("apiKey");
    const appId = c.req.param(appIdParam);

    if (!appId) {
      return forbidden(c, "App ID is required for this operation");
    }

    // Admin keys have access to all apps
    if (apiKey.scope === "admin") {
      await next();
      return;
    }

    // CI keys can only access their assigned app
    if (apiKey.appId !== appId) {
      return forbidden(
        c,
        "This API key does not have access to the requested application"
      );
    }

    await next();
  };
}

/**
 * Middleware to require admin scope for certain operations.
 * Must be used after authMiddleware.
 *
 * @returns Middleware handler that checks for admin scope
 */
export function requireAdminScope(): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const apiKey = c.get("apiKey");

    if (apiKey.scope !== "admin") {
      return forbidden(c, "This operation requires an admin API key");
    }

    await next();
  };
}

/**
 * Middleware to require CI or admin scope for CI operations.
 * Must be used after authMiddleware.
 *
 * CI keys can only access their assigned app (by app_slug, not app_id).
 * Admin keys have unrestricted access to all apps.
 *
 * @returns Middleware handler that checks for CI or admin scope
 */
export function requireCiOrAdminScope(): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const apiKey = c.get("apiKey");

    if (apiKey.scope !== "ci" && apiKey.scope !== "admin") {
      return forbidden(c, "This operation requires a CI or admin API key");
    }

    await next();
  };
}

/**
 * Middleware to verify CI key has access to the specified app (by slug).
 * Must be used after authMiddleware.
 *
 * For admin-scoped keys: allows access to any app
 * For CI-scoped keys: only allows access if their appId matches the resolved app's ID
 *
 * @param appSlugParam - The route parameter name containing the app slug (default: "app_slug")
 * @param resolveAppId - Function to resolve app slug to app ID. Injected to avoid circular dependencies.
 * @returns Middleware handler that checks app access by slug
 */
export function requireCiAppAccess(
  appSlugParam: string,
  resolveAppId: (slug: string) => Promise<string | null>
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const apiKey = c.get("apiKey");
    const appSlug = c.req.param(appSlugParam);

    if (!appSlug) {
      return forbidden(c, "App slug is required for this operation");
    }

    // Admin keys have access to all apps
    if (apiKey.scope === "admin") {
      await next();
      return;
    }

    // CI keys must have an assigned app
    if (!apiKey.appId) {
      return forbidden(c, "This CI API key is not assigned to any application");
    }

    // Resolve the app slug to an ID
    const resolvedAppId = await resolveAppId(appSlug);
    if (!resolvedAppId) {
      // App not found - let the route handler deal with the 404
      await next();
      return;
    }

    // CI keys can only access their assigned app
    if (apiKey.appId !== resolvedAppId) {
      return forbidden(
        c,
        "This API key does not have access to the requested application"
      );
    }

    await next();
  };
}
