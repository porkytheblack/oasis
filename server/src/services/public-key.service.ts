import { randomBytes, createHash } from "node:crypto";
import { eq, and, isNull, desc, count } from "drizzle-orm";
import { ulid } from "ulid";
import { db, publicApiKeys, apps } from "../db/index.js";
import type { PublicApiKey, NewPublicApiKey } from "../db/schema.js";
import type { PublicApiKeyDto, PublicApiKeyCreateResponse } from "../types/index.js";

/**
 * Error thrown when a public API key is not found
 */
export class PublicKeyNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Public API key with identifier '${identifier}' was not found`);
    this.name = "PublicKeyNotFoundError";
  }
}

/**
 * Error thrown when an app is not found
 */
export class AppNotFoundError extends Error {
  constructor(identifier: string) {
    super(`App with identifier '${identifier}' was not found`);
    this.name = "AppNotFoundError";
  }
}

/**
 * Generates a cryptographically secure public API key.
 *
 * The key format is: pk_{app_slug}_{16 random hex characters}
 * Example: pk_my-app_a1b2c3d4e5f6g7h8
 *
 * @param appSlug - The app slug to include in the key
 * @returns A new public API key string
 */
export function generatePublicApiKey(appSlug: string): string {
  const randomPart = randomBytes(8).toString("hex");
  return `pk_${appSlug}_${randomPart}`;
}

/**
 * Hashes a public API key using SHA-256 for secure storage.
 *
 * @param key - The raw API key
 * @returns The SHA-256 hash of the key as a hex string
 */
export function hashPublicApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Converts a database PublicApiKey record to a PublicApiKeyDto for API responses.
 *
 * @param key - The database record
 * @returns The public API key DTO
 */
function toPublicApiKeyDto(key: PublicApiKey): PublicApiKeyDto {
  return {
    id: key.id,
    appId: key.appId,
    name: key.name,
    keyPrefix: key.keyPrefix,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
    revokedAt: key.revokedAt?.toISOString() ?? null,
  };
}

/**
 * Creates a new public API key for an app.
 *
 * The full key is returned ONLY in this response and should be stored securely.
 * The key is hashed with SHA-256 before storage - the original cannot be recovered.
 *
 * @param appId - The app ID to create the key for
 * @param name - A descriptive name for the key
 * @returns The created key (shown once) and key details
 * @throws AppNotFoundError if the app does not exist
 */
export async function createPublicApiKey(
  appId: string,
  name: string
): Promise<PublicApiKeyCreateResponse> {
  // Look up the app to get the slug
  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
  });

  if (!app) {
    throw new AppNotFoundError(appId);
  }

  const rawKey = generatePublicApiKey(app.slug);
  const keyHash = hashPublicApiKey(rawKey);
  const keyPrefix = rawKey.substring(0, Math.min(24, rawKey.length)); // Show more of the key for identification

  const now = new Date();
  const newKey: NewPublicApiKey = {
    id: ulid(),
    appId,
    name,
    keyHash,
    keyPrefix,
    createdAt: now,
    lastUsedAt: null,
    revokedAt: null,
  };

  await db.insert(publicApiKeys).values(newKey);

  const createdKey: PublicApiKey = {
    id: newKey.id,
    appId,
    name,
    keyHash,
    keyPrefix,
    createdAt: now,
    lastUsedAt: null,
    revokedAt: null,
  };

  return {
    key: rawKey,
    publicApiKey: toPublicApiKeyDto(createdKey),
  };
}

/**
 * Lists public API keys for an app with pagination.
 *
 * @param appId - The app ID
 * @param page - Page number (1-indexed)
 * @param limit - Number of items per page
 * @returns Object with items array and total count
 */
export async function listPublicApiKeys(
  appId: string,
  page: number,
  limit: number
): Promise<{ items: PublicApiKeyDto[]; total: number }> {
  const offset = (page - 1) * limit;

  const [keysList, countResult] = await Promise.all([
    db.query.publicApiKeys.findMany({
      where: eq(publicApiKeys.appId, appId),
      orderBy: desc(publicApiKeys.createdAt),
      limit,
      offset,
    }),
    db
      .select({ count: count() })
      .from(publicApiKeys)
      .where(eq(publicApiKeys.appId, appId)),
  ]);

  const total = countResult[0]?.count ?? 0;
  const items = keysList.map(toPublicApiKeyDto);

  return { items, total };
}

/**
 * Retrieves a public API key by ID.
 *
 * @param id - The key ID
 * @returns The public API key DTO
 * @throws PublicKeyNotFoundError if the key does not exist
 */
export async function getPublicApiKeyById(id: string): Promise<PublicApiKeyDto> {
  const key = await db.query.publicApiKeys.findFirst({
    where: eq(publicApiKeys.id, id),
  });

  if (!key) {
    throw new PublicKeyNotFoundError(id);
  }

  return toPublicApiKeyDto(key);
}

/**
 * Revokes a public API key by setting the revoked_at timestamp.
 * A revoked key can no longer be used for authentication.
 *
 * @param id - The key ID to revoke
 * @throws PublicKeyNotFoundError if the key does not exist
 */
export async function revokePublicApiKey(id: string): Promise<PublicApiKeyDto> {
  const existing = await db.query.publicApiKeys.findFirst({
    where: eq(publicApiKeys.id, id),
  });

  if (!existing) {
    throw new PublicKeyNotFoundError(id);
  }

  // If already revoked, just return the current state
  if (existing.revokedAt !== null) {
    return toPublicApiKeyDto(existing);
  }

  const now = new Date();

  await db
    .update(publicApiKeys)
    .set({ revokedAt: now })
    .where(eq(publicApiKeys.id, id));

  const updated: PublicApiKey = {
    ...existing,
    revokedAt: now,
  };

  return toPublicApiKeyDto(updated);
}

/**
 * Validates a public API key and returns the associated app ID.
 * Updates the last_used_at timestamp asynchronously.
 *
 * @param rawKey - The raw API key from the request
 * @returns The authenticated key info (id, appId) or null if invalid
 */
export async function validatePublicApiKey(
  rawKey: string
): Promise<{ id: string; appId: string } | null> {
  // Validate key format
  if (!rawKey.startsWith("pk_")) {
    return null;
  }

  const keyHash = hashPublicApiKey(rawKey);

  const key = await db.query.publicApiKeys.findFirst({
    where: and(
      eq(publicApiKeys.keyHash, keyHash),
      isNull(publicApiKeys.revokedAt)
    ),
  });

  if (!key) {
    return null;
  }

  // Update last_used_at asynchronously (non-blocking)
  updateLastUsedAsync(key.id);

  return { id: key.id, appId: key.appId };
}

/**
 * Updates the last_used_at timestamp for a public API key asynchronously.
 * This function does not block the request and errors are logged but not thrown.
 *
 * @param keyId - The key ID to update
 */
function updateLastUsedAsync(keyId: string): void {
  const now = new Date();
  db.update(publicApiKeys)
    .set({ lastUsedAt: now })
    .where(eq(publicApiKeys.id, keyId))
    .then(() => {
      // Successfully updated last_used_at
    })
    .catch((error) => {
      console.error(`Failed to update last_used_at for public key ${keyId}:`, error);
    });
}

/**
 * Gets the app ID from a public API key hash (for middleware use).
 *
 * @param keyHash - The hashed API key
 * @returns The app ID if the key is valid, null otherwise
 */
export async function getAppIdFromKeyHash(keyHash: string): Promise<string | null> {
  const key = await db.query.publicApiKeys.findFirst({
    where: and(
      eq(publicApiKeys.keyHash, keyHash),
      isNull(publicApiKeys.revokedAt)
    ),
  });

  return key?.appId ?? null;
}
