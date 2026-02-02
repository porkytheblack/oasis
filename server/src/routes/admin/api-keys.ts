import { Hono } from "hono";
import { z } from "zod";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  ApiKeyNotFoundError,
} from "../../services/api-key.service.js";
import {
  success,
  created,
  notFound,
  zodValidationError,
  paginated,
  internalError,
} from "../../utils/response.js";
import {
  createApiKeySchema,
  paginationSchema,
  ulidSchema,
} from "../../types/index.js";
import type { AuthVariables } from "../../middleware/auth.js";

/**
 * Admin routes for managing API keys.
 *
 * All routes require admin authentication via authMiddleware.
 * Only admin-scoped keys can manage other API keys.
 */
export const apiKeysRoutes = new Hono<{ Variables: AuthVariables }>();

/**
 * GET /admin/api-keys
 *
 * Lists all API keys with pagination.
 * Keys are returned with redacted values (only prefix shown).
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 *
 * @example
 * GET /admin/api-keys?page=1&limit=10
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "items": [
 *       {
 *         "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *         "name": "CI Pipeline Key",
 *         "scope": "ci",
 *         "appId": "01HQWX5K8J2MXPZ9Y7VBNC3DFD",
 *         "keyPrefix": "uk_live_********",
 *         "lastUsedAt": "2024-01-15T10:30:00.000Z",
 *         "createdAt": "2024-01-01T00:00:00.000Z",
 *         "revokedAt": null
 *       }
 *     ],
 *     "pagination": {
 *       "page": 1,
 *       "limit": 10,
 *       "total": 25,
 *       "totalPages": 3
 *     }
 *   }
 * }
 */
apiKeysRoutes.get("/", async (c) => {
  const queryParams = {
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  };

  const parseResult = paginationSchema.safeParse(queryParams);

  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  const { page, limit } = parseResult.data;

  try {
    const { items, total } = await listApiKeys(page, limit);
    return paginated(c, items, page, limit, total);
  } catch (error) {
    console.error("Error listing API keys:", error);
    return internalError(c);
  }
});

/**
 * POST /admin/api-keys
 *
 * Creates a new API key.
 * The full key is returned ONLY in this response and should be stored securely.
 *
 * Request body:
 * - name: Display name for the key (required)
 * - scope: Permission scope - "ci" or "admin" (required)
 * - appId: App ID to scope the key to (optional, for ci keys)
 *
 * @example
 * POST /admin/api-keys
 * {
 *   "name": "GitHub Actions CI",
 *   "scope": "ci",
 *   "appId": "01HQWX5K8J2MXPZ9Y7VBNC3DFD"
 * }
 *
 * Response (201):
 * {
 *   "success": true,
 *   "data": {
 *     "key": "uk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
 *     "apiKey": {
 *       "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *       "name": "GitHub Actions CI",
 *       "scope": "ci",
 *       "appId": "01HQWX5K8J2MXPZ9Y7VBNC3DFD",
 *       "keyPrefix": "uk_live_a1b2c3d4",
 *       "lastUsedAt": null,
 *       "createdAt": "2024-01-15T10:30:00.000Z",
 *       "revokedAt": null
 *     }
 *   }
 * }
 */
apiKeysRoutes.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return zodValidationError(
      c,
      new z.ZodError([
        {
          code: "custom",
          message: "Invalid JSON in request body",
          path: [],
        },
      ])
    );
  }

  const parseResult = createApiKeySchema.safeParse(body);

  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  try {
    const result = await createApiKey({
      name: parseResult.data.name,
      scope: parseResult.data.scope,
      appId: parseResult.data.appId ?? null,
    });
    return created(c, result);
  } catch (error) {
    console.error("Error creating API key:", error);
    return internalError(c);
  }
});

/**
 * DELETE /admin/api-keys/:key_id
 *
 * Revokes an API key by setting its revoked_at timestamp.
 * A revoked key can no longer be used for authentication.
 *
 * @example
 * DELETE /admin/api-keys/01HQWX5K8J2MXPZ9Y7VBNC3DFE
 *
 * Response (200):
 * {
 *   "success": true,
 *   "data": {
 *     "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
 *     "name": "GitHub Actions CI",
 *     "scope": "ci",
 *     "appId": "01HQWX5K8J2MXPZ9Y7VBNC3DFD",
 *     "keyPrefix": "uk_live_********",
 *     "lastUsedAt": "2024-01-15T10:30:00.000Z",
 *     "createdAt": "2024-01-01T00:00:00.000Z",
 *     "revokedAt": "2024-01-15T12:00:00.000Z"
 *   }
 * }
 */
apiKeysRoutes.delete("/:key_id", async (c) => {
  const keyId = c.req.param("key_id");

  const parseResult = ulidSchema.safeParse(keyId);

  if (!parseResult.success) {
    return zodValidationError(c, parseResult.error);
  }

  try {
    const revokedKey = await revokeApiKey(keyId);
    return success(c, revokedKey);
  } catch (error) {
    if (error instanceof ApiKeyNotFoundError) {
      return notFound(c, "API Key", keyId);
    }
    console.error("Error revoking API key:", error);
    return internalError(c);
  }
});
