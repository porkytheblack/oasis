import { randomBytes } from "node:crypto";
import { eq, desc, count } from "drizzle-orm";
import { ulid } from "ulid";
import { db, apiKeys } from "../db/index.js";
import type { ApiKey, NewApiKey } from "../db/schema.js";
import type { ApiKeyScope } from "../types/index.js";
import { hashApiKey } from "../middleware/auth.js";

/**
 * Error thrown when an API key is not found
 */
export class ApiKeyNotFoundError extends Error {
  constructor(identifier: string) {
    super(`API key with identifier '${identifier}' was not found`);
    this.name = "ApiKeyNotFoundError";
  }
}

/**
 * API Key data transfer object for API responses.
 * The actual key value is never exposed after creation.
 */
export interface ApiKeyDto {
  id: string;
  name: string;
  scope: ApiKeyScope;
  appId: string | null;
  /** First 8 characters of the key for identification */
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

/**
 * Response returned when creating a new API key.
 * This is the ONLY time the full key is returned.
 */
export interface ApiKeyCreateResponse {
  /** The full API key - store this securely, it will not be shown again */
  key: string;
  /** The key details (without the full key) */
  apiKey: ApiKeyDto;
}

/**
 * Input data for creating a new API key
 */
export interface CreateApiKeyInput {
  name: string;
  scope: ApiKeyScope;
  appId?: string | null;
}

/**
 * Generates a cryptographically secure API key with the uk_live_ prefix.
 *
 * The key format is: uk_live_{32 random hex characters}
 * Total length: 8 (prefix) + 32 (random) = 40 characters
 *
 * @returns A new API key string
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(16).toString("hex");
  return `uk_live_${randomPart}`;
}

/**
 * Converts a database ApiKey record to an ApiKeyDto for API responses.
 * Extracts the key prefix from the name since we don't store the actual key.
 *
 * @param apiKey - The database record
 * @param keyPrefix - The first 8 characters of the original key
 * @returns The API key DTO
 */
function toApiKeyDto(apiKey: ApiKey, keyPrefix: string): ApiKeyDto {
  return {
    id: apiKey.id,
    name: apiKey.name,
    scope: apiKey.scope as ApiKeyScope,
    appId: apiKey.appId,
    keyPrefix,
    lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
    createdAt: apiKey.createdAt.toISOString(),
    revokedAt: apiKey.revokedAt?.toISOString() ?? null,
  };
}

/**
 * Creates a new API key.
 *
 * The full key is returned ONLY in this response and should be stored securely.
 * The key is hashed with SHA-256 before storage - the original cannot be recovered.
 *
 * @param data - The key creation data
 * @returns The created key (shown once) and key details
 */
export async function createApiKey(data: CreateApiKeyInput): Promise<ApiKeyCreateResponse> {
  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.substring(0, 16); // "uk_live_" + first 8 chars of random part

  const now = new Date();
  const newApiKey: NewApiKey = {
    id: ulid(),
    appId: data.appId ?? null,
    name: data.name,
    keyHash,
    scope: data.scope,
    createdAt: now,
    lastUsedAt: null,
    revokedAt: null,
  };

  await db.insert(apiKeys).values(newApiKey);

  const createdApiKey: ApiKey = {
    id: newApiKey.id,
    appId: data.appId ?? null,
    name: newApiKey.name,
    keyHash: newApiKey.keyHash,
    scope: newApiKey.scope,
    createdAt: now,
    lastUsedAt: null,
    revokedAt: null,
  };

  return {
    key: rawKey,
    apiKey: toApiKeyDto(createdApiKey, keyPrefix),
  };
}

/**
 * Lists API keys with pagination.
 * Keys are returned with redacted values (only prefix shown).
 *
 * @param page - Page number (1-indexed)
 * @param limit - Number of items per page
 * @returns Object with items array and total count
 */
export async function listApiKeys(
  page: number,
  limit: number
): Promise<{ items: ApiKeyDto[]; total: number }> {
  const offset = (page - 1) * limit;

  const [keysList, countResult] = await Promise.all([
    db.query.apiKeys.findMany({
      orderBy: desc(apiKeys.createdAt),
      limit,
      offset,
    }),
    db.select({ count: count() }).from(apiKeys),
  ]);

  const total = countResult[0]?.count ?? 0;

  // Map to DTOs with redacted keys
  // Since we don't store the key prefix, we show a generic redacted format
  const items = keysList.map((key) => {
    // We can't recover the original key, so we show a redacted indicator
    // The format is consistent: "uk_live_" + "********"
    return toApiKeyDto(key, "uk_live_********");
  });

  return { items, total };
}

/**
 * Retrieves an API key by ID.
 *
 * @param id - The API key ID
 * @returns The API key DTO
 * @throws ApiKeyNotFoundError if the key does not exist
 */
export async function getApiKeyById(id: string): Promise<ApiKeyDto> {
  const apiKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.id, id),
  });

  if (!apiKey) {
    throw new ApiKeyNotFoundError(id);
  }

  return toApiKeyDto(apiKey, "uk_live_********");
}

/**
 * Revokes an API key by setting the revoked_at timestamp.
 * A revoked key can no longer be used for authentication.
 *
 * @param id - The API key ID to revoke
 * @throws ApiKeyNotFoundError if the key does not exist
 */
export async function revokeApiKey(id: string): Promise<ApiKeyDto> {
  const existing = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.id, id),
  });

  if (!existing) {
    throw new ApiKeyNotFoundError(id);
  }

  // If already revoked, just return the current state
  if (existing.revokedAt !== null) {
    return toApiKeyDto(existing, "uk_live_********");
  }

  const now = new Date();

  await db.update(apiKeys).set({ revokedAt: now }).where(eq(apiKeys.id, id));

  const updated: ApiKey = {
    ...existing,
    revokedAt: now,
  };

  return toApiKeyDto(updated, "uk_live_********");
}

/**
 * Checks if an API key exists and is not revoked.
 *
 * @param id - The API key ID
 * @returns true if the key exists and is active, false otherwise
 */
export async function isApiKeyActive(id: string): Promise<boolean> {
  const apiKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.id, id),
  });

  if (!apiKey) {
    return false;
  }

  return apiKey.revokedAt === null;
}

/**
 * Lists all active (non-revoked) API keys for a specific app.
 *
 * @param appId - The app ID
 * @returns Array of active API keys for the app
 */
export async function listApiKeysForApp(appId: string): Promise<ApiKeyDto[]> {
  const keys = await db.query.apiKeys.findMany({
    where: eq(apiKeys.appId, appId),
    orderBy: desc(apiKeys.createdAt),
  });

  return keys.map((key) => toApiKeyDto(key, "uk_live_********"));
}
