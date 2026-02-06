import { Hono } from "hono";
import type { AuthVariables } from "../../middleware/auth.js";
import { requireAppAccess } from "../../middleware/auth.js";
import {
  createPublicApiKey,
  listPublicApiKeys,
  getPublicApiKeyById,
  revokePublicApiKey,
  PublicKeyNotFoundError,
  AppNotFoundError,
} from "../../services/public-key.service.js";
import { createPublicApiKeySchema, paginationSchema } from "../../types/index.js";
import {
  success,
  created,
  notFound,
  paginated,
  zodValidationError,
  internalError,
} from "../../utils/response.js";

/**
 * Admin routes for managing public API keys (SDK keys).
 *
 * All routes require admin authentication via Bearer token.
 */
export const publicKeysRoutes = new Hono<{ Variables: AuthVariables }>();

// All routes require access to the specified app
publicKeysRoutes.use("/:app_id/*", requireAppAccess("app_id"));

/**
 * GET /admin/apps/:app_id/public-keys
 *
 * List all public API keys for an app.
 *
 * Query Parameters:
 *   page: Page number (default: 1)
 *   limit: Items per page (default: 20, max: 100)
 *
 * Response:
 *   200: Paginated list of public API keys
 */
publicKeysRoutes.get("/:app_id/public-keys", async (c) => {
  const appId = c.req.param("app_id")!;

  // Parse pagination
  const queryParseResult = paginationSchema.safeParse(c.req.query());
  if (!queryParseResult.success) {
    return zodValidationError(c, queryParseResult.error);
  }

  const { page, limit } = queryParseResult.data;

  try {
    const { items, total } = await listPublicApiKeys(appId, page, limit);
    return paginated(c, items, page, limit, total);
  } catch (error) {
    console.error("Error listing public API keys:", error);
    return internalError(c, "Failed to list public API keys");
  }
});

/**
 * POST /admin/apps/:app_id/public-keys
 *
 * Create a new public API key for an app.
 *
 * Request Body:
 *   {
 *     name: string  // Descriptive name for the key
 *   }
 *
 * Response:
 *   201: { key: string, publicApiKey: PublicApiKeyDto }
 *        (key is only shown once, store it securely)
 */
publicKeysRoutes.post("/:app_id/public-keys", async (c) => {
  const appId = c.req.param("app_id")!;

  let body;
  try {
    body = await c.req.json();
  } catch {
    return zodValidationError(c, {
      errors: [{ path: [], message: "Invalid JSON body", code: "custom" }],
    } as any);
  }

  const parseResult = createPublicApiKeySchema.safeParse(body);
  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  try {
    const result = await createPublicApiKey(appId, parseResult.data.name);
    return created(c, result);
  } catch (error) {
    if (error instanceof AppNotFoundError) {
      return notFound(c, "App", appId);
    }
    console.error("Error creating public API key:", error);
    return internalError(c, "Failed to create public API key");
  }
});

/**
 * GET /admin/apps/:app_id/public-keys/:key_id
 *
 * Get details of a specific public API key.
 *
 * Response:
 *   200: PublicApiKeyDto
 *   404: Key not found
 */
publicKeysRoutes.get("/:app_id/public-keys/:key_id", async (c) => {
  const keyId = c.req.param("key_id")!;

  try {
    const key = await getPublicApiKeyById(keyId);
    return success(c, key);
  } catch (error) {
    if (error instanceof PublicKeyNotFoundError) {
      return notFound(c, "Public API key", keyId);
    }
    console.error("Error getting public API key:", error);
    return internalError(c, "Failed to get public API key");
  }
});

/**
 * DELETE /admin/apps/:app_id/public-keys/:key_id
 *
 * Revoke a public API key.
 *
 * Response:
 *   200: Revoked key details
 *   404: Key not found
 */
publicKeysRoutes.delete("/:app_id/public-keys/:key_id", async (c) => {
  const keyId = c.req.param("key_id")!;

  try {
    const key = await revokePublicApiKey(keyId);
    return success(c, key);
  } catch (error) {
    if (error instanceof PublicKeyNotFoundError) {
      return notFound(c, "Public API key", keyId);
    }
    console.error("Error revoking public API key:", error);
    return internalError(c, "Failed to revoke public API key");
  }
});
