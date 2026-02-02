import { eq, and } from "drizzle-orm";
import { ulid } from "ulid";
import { db, artifacts, releases } from "../db/index.js";
import type { Artifact, NewArtifact } from "../db/schema.js";
import type { Platform, ArtifactDto } from "../types/index.js";
import {
  deleteFile as deleteR2File,
  fileExists as r2FileExists,
  getFileInfo as getR2FileInfo,
  getPublicUrl,
  generatePresignedDownloadUrl,
  isR2Configured,
  R2Error,
} from "./r2.service.js";

/**
 * Error thrown when an artifact is not found
 */
export class ArtifactNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Artifact with identifier '${identifier}' was not found`);
    this.name = "ArtifactNotFoundError";
  }
}

/**
 * Error thrown when an artifact platform conflicts with an existing artifact
 */
export class ArtifactPlatformConflictError extends Error {
  constructor(releaseId: string, platform: string) {
    super(
      `An artifact for platform '${platform}' already exists for release '${releaseId}'`
    );
    this.name = "ArtifactPlatformConflictError";
  }
}

/**
 * Error thrown when the release is not found for an artifact operation
 */
export class ReleaseNotFoundForArtifactError extends Error {
  constructor(releaseId: string) {
    super(`Release with identifier '${releaseId}' was not found`);
    this.name = "ReleaseNotFoundForArtifactError";
  }
}

/**
 * Error thrown when an artifact upload confirmation fails
 */
export class ArtifactUploadNotFoundError extends Error {
  constructor(r2Key: string) {
    super(`Artifact file not found in storage at '${r2Key}'`);
    this.name = "ArtifactUploadNotFoundError";
  }
}

/**
 * Error thrown when artifact is not in pending state for confirmation
 */
export class ArtifactNotPendingError extends Error {
  constructor(artifactId: string) {
    super(`Artifact '${artifactId}' is not in pending state or already has a download URL`);
    this.name = "ArtifactNotPendingError";
  }
}

/**
 * Input data for creating a new artifact
 */
export interface CreateArtifactInput {
  platform: Platform;
  signature?: string | null;
  downloadUrl?: string | null;
  fileSize?: number | null;
  checksum?: string | null;
}

/**
 * Converts a database Artifact record to an ArtifactDto for API responses.
 *
 * @param artifact - The database record
 * @returns The artifact DTO
 */
function toArtifactDto(artifact: Artifact): ArtifactDto {
  return {
    id: artifact.id,
    releaseId: artifact.releaseId,
    platform: artifact.platform as Platform,
    signature: artifact.signature,
    r2Key: artifact.r2Key,
    downloadUrl: artifact.downloadUrl,
    fileSize: artifact.fileSize,
    checksum: artifact.checksum,
    createdAt: artifact.createdAt.toISOString(),
  };
}

/**
 * Verifies that a release exists and optionally belongs to a specific app.
 *
 * @param releaseId - The release ID to verify
 * @param appId - Optional app ID to verify ownership
 * @throws ReleaseNotFoundForArtifactError if the release does not exist
 */
async function verifyReleaseExists(
  releaseId: string,
  appId?: string
): Promise<void> {
  const conditions = [eq(releases.id, releaseId)];
  if (appId !== undefined) {
    conditions.push(eq(releases.appId, appId));
  }

  const release = await db.query.releases.findFirst({
    where: and(...conditions),
  });

  if (!release) {
    throw new ReleaseNotFoundForArtifactError(releaseId);
  }
}

/**
 * Creates a new artifact for a release.
 *
 * @param releaseId - The release ID to create the artifact for
 * @param data - The artifact creation data
 * @param appId - Optional app ID for ownership verification
 * @returns The created artifact DTO
 * @throws ReleaseNotFoundForArtifactError if the release does not exist
 * @throws ArtifactPlatformConflictError if an artifact for the platform already exists
 */
export async function createArtifact(
  releaseId: string,
  data: CreateArtifactInput,
  appId?: string
): Promise<ArtifactDto> {
  // Verify release exists (and optionally belongs to app)
  await verifyReleaseExists(releaseId, appId);

  // Check for existing platform
  const existing = await db.query.artifacts.findFirst({
    where: and(
      eq(artifacts.releaseId, releaseId),
      eq(artifacts.platform, data.platform)
    ),
  });

  if (existing) {
    throw new ArtifactPlatformConflictError(releaseId, data.platform);
  }

  const now = new Date();
  const newArtifact: NewArtifact = {
    id: ulid(),
    releaseId,
    platform: data.platform,
    signature: data.signature ?? null,
    r2Key: null, // r2Key is set by upload process, not during creation
    downloadUrl: data.downloadUrl ?? null,
    fileSize: data.fileSize ?? null,
    checksum: data.checksum ?? null,
    createdAt: now,
  };

  await db.insert(artifacts).values(newArtifact);

  const createdArtifact: Artifact = {
    id: newArtifact.id,
    releaseId: newArtifact.releaseId,
    platform: newArtifact.platform,
    signature: newArtifact.signature ?? null,
    r2Key: null,
    downloadUrl: newArtifact.downloadUrl ?? null,
    fileSize: newArtifact.fileSize ?? null,
    checksum: newArtifact.checksum ?? null,
    createdAt: now,
  };

  return toArtifactDto(createdArtifact);
}

/**
 * Lists all artifacts for a release.
 *
 * @param releaseId - The release ID
 * @param appId - Optional app ID for ownership verification
 * @returns Array of artifact DTOs
 * @throws ReleaseNotFoundForArtifactError if the release does not exist
 */
export async function listArtifacts(
  releaseId: string,
  appId?: string
): Promise<ArtifactDto[]> {
  // Verify release exists (and optionally belongs to app)
  await verifyReleaseExists(releaseId, appId);

  const artifactsList = await db.query.artifacts.findMany({
    where: eq(artifacts.releaseId, releaseId),
  });

  return artifactsList.map(toArtifactDto);
}

/**
 * Retrieves an artifact by ID.
 *
 * @param releaseId - The release ID for ownership check
 * @param artifactId - The artifact ID
 * @param appId - Optional app ID for release ownership verification
 * @returns The artifact DTO
 * @throws ReleaseNotFoundForArtifactError if the release does not exist
 * @throws ArtifactNotFoundError if the artifact does not exist or belongs to different release
 */
export async function getArtifactById(
  releaseId: string,
  artifactId: string,
  appId?: string
): Promise<ArtifactDto> {
  // Verify release exists (and optionally belongs to app)
  await verifyReleaseExists(releaseId, appId);

  const artifact = await db.query.artifacts.findFirst({
    where: and(
      eq(artifacts.id, artifactId),
      eq(artifacts.releaseId, releaseId)
    ),
  });

  if (!artifact) {
    throw new ArtifactNotFoundError(artifactId);
  }

  return toArtifactDto(artifact);
}

/**
 * Deletes an artifact and its associated file from R2 storage.
 *
 * @param releaseId - The release ID for ownership check
 * @param artifactId - The artifact ID to delete
 * @param appId - Optional app ID for release ownership verification
 * @throws ReleaseNotFoundForArtifactError if the release does not exist
 * @throws ArtifactNotFoundError if the artifact does not exist or belongs to different release
 */
export async function deleteArtifact(
  releaseId: string,
  artifactId: string,
  appId?: string
): Promise<void> {
  // Verify release exists (and optionally belongs to app)
  await verifyReleaseExists(releaseId, appId);

  // Verify artifact exists and belongs to release
  const existing = await db.query.artifacts.findFirst({
    where: and(
      eq(artifacts.id, artifactId),
      eq(artifacts.releaseId, releaseId)
    ),
  });

  if (!existing) {
    throw new ArtifactNotFoundError(artifactId);
  }

  // Delete the file from R2 if it exists
  if (existing.r2Key && isR2Configured()) {
    try {
      await deleteR2File(existing.r2Key);
    } catch (error) {
      // Log the error but don't fail the deletion - the file may not exist
      // or R2 may be temporarily unavailable
      console.error(
        `Warning: Failed to delete R2 file '${existing.r2Key}':`,
        error instanceof R2Error ? error.message : error
      );
    }
  }

  await db.delete(artifacts).where(eq(artifacts.id, artifactId));
}

/**
 * Updates an artifact.
 *
 * @param releaseId - The release ID for ownership check
 * @param artifactId - The artifact ID to update
 * @param data - The fields to update
 * @param appId - Optional app ID for release ownership verification
 * @returns The updated artifact DTO
 * @throws ReleaseNotFoundForArtifactError if the release does not exist
 * @throws ArtifactNotFoundError if the artifact does not exist or belongs to different release
 */
export async function updateArtifact(
  releaseId: string,
  artifactId: string,
  data: Partial<Omit<CreateArtifactInput, "platform">>,
  appId?: string
): Promise<ArtifactDto> {
  // Verify release exists (and optionally belongs to app)
  await verifyReleaseExists(releaseId, appId);

  // Verify artifact exists and belongs to release
  const existing = await db.query.artifacts.findFirst({
    where: and(
      eq(artifacts.id, artifactId),
      eq(artifacts.releaseId, releaseId)
    ),
  });

  if (!existing) {
    throw new ArtifactNotFoundError(artifactId);
  }

  // Build update object only with provided fields
  const updateData: Partial<NewArtifact> = {};

  if (data.signature !== undefined) {
    updateData.signature = data.signature;
  }

  if (data.downloadUrl !== undefined) {
    updateData.downloadUrl = data.downloadUrl;
  }

  if (data.fileSize !== undefined) {
    updateData.fileSize = data.fileSize;
  }

  if (data.checksum !== undefined) {
    updateData.checksum = data.checksum;
  }

  // Only update if there are changes
  if (Object.keys(updateData).length > 0) {
    await db.update(artifacts).set(updateData).where(eq(artifacts.id, artifactId));
  }

  // Fetch and return updated record
  const updated = await db.query.artifacts.findFirst({
    where: eq(artifacts.id, artifactId),
  });

  if (!updated) {
    throw new ArtifactNotFoundError(artifactId);
  }

  return toArtifactDto(updated);
}

/**
 * Gets the raw artifact record for internal use.
 *
 * @param artifactId - The artifact ID
 * @returns The artifact record or null
 */
export async function getRawArtifactById(
  artifactId: string
): Promise<Artifact | null> {
  const artifact = await db.query.artifacts.findFirst({
    where: eq(artifacts.id, artifactId),
  });

  return artifact ?? null;
}

/**
 * Checks if an artifact exists for a specific platform in a release.
 *
 * @param releaseId - The release ID
 * @param platform - The platform to check
 * @returns true if an artifact exists for the platform
 */
export async function artifactExistsForPlatform(
  releaseId: string,
  platform: string
): Promise<boolean> {
  const artifact = await db.query.artifacts.findFirst({
    where: and(
      eq(artifacts.releaseId, releaseId),
      eq(artifacts.platform, platform)
    ),
  });

  return artifact !== undefined;
}

/**
 * Input for creating a pending artifact.
 */
export interface CreatePendingArtifactInput {
  platform: Platform;
  r2Key: string;
  /** If true, replaces any existing artifact for the same platform */
  replaceExisting?: boolean;
}

/**
 * Creates a pending artifact record for R2 upload.
 *
 * This creates an artifact in a "pending" state (no downloadUrl) that will be
 * completed when the upload is confirmed. The artifact is created with an r2Key
 * but no downloadUrl until the upload is verified.
 *
 * @param releaseId - The release ID to create the artifact for
 * @param data - Platform, R2 key, and optional replaceExisting flag for the artifact
 * @param appId - Optional app ID for ownership verification
 * @returns The created artifact DTO
 * @throws ReleaseNotFoundForArtifactError if the release does not exist
 * @throws ArtifactPlatformConflictError if an artifact for the platform already exists and replaceExisting is false
 */
export async function createPendingArtifact(
  releaseId: string,
  data: CreatePendingArtifactInput,
  appId?: string
): Promise<ArtifactDto> {
  // Verify release exists (and optionally belongs to app)
  await verifyReleaseExists(releaseId, appId);

  // Check for existing platform
  const existing = await db.query.artifacts.findFirst({
    where: and(
      eq(artifacts.releaseId, releaseId),
      eq(artifacts.platform, data.platform)
    ),
  });

  if (existing) {
    if (data.replaceExisting) {
      // Delete the existing artifact and its R2 file before creating new one
      if (existing.r2Key && isR2Configured()) {
        try {
          await deleteR2File(existing.r2Key);
        } catch (error) {
          // Log the error but continue - the file may not exist or R2 may be temporarily unavailable
          console.error(
            `Warning: Failed to delete existing R2 file '${existing.r2Key}':`,
            error instanceof R2Error ? error.message : error
          );
        }
      }
      await db.delete(artifacts).where(eq(artifacts.id, existing.id));
    } else {
      throw new ArtifactPlatformConflictError(releaseId, data.platform);
    }
  }

  const now = new Date();
  const newArtifact: NewArtifact = {
    id: ulid(),
    releaseId,
    platform: data.platform,
    signature: null,
    r2Key: data.r2Key,
    downloadUrl: null, // Will be set when upload is confirmed
    fileSize: null,    // Will be set when upload is confirmed
    checksum: null,
    createdAt: now,
  };

  await db.insert(artifacts).values(newArtifact);

  const createdArtifact: Artifact = {
    id: newArtifact.id,
    releaseId: newArtifact.releaseId,
    platform: newArtifact.platform,
    signature: null,
    r2Key: data.r2Key,
    downloadUrl: null,
    fileSize: null,
    checksum: null,
    createdAt: now,
  };

  return toArtifactDto(createdArtifact);
}

/**
 * Input for confirming an artifact upload.
 */
export interface ConfirmArtifactUploadInput {
  signature?: string | null;
  checksum?: string | null;
}

/**
 * Confirms an artifact upload by verifying the file exists in R2 and updating
 * the artifact record with download URL and file size.
 *
 * @param releaseId - The release ID for ownership check
 * @param artifactId - The artifact ID to confirm
 * @param data - Optional signature and checksum to set
 * @param appId - Optional app ID for ownership verification
 * @returns The confirmed artifact DTO
 * @throws ReleaseNotFoundForArtifactError if the release does not exist
 * @throws ArtifactNotFoundError if the artifact does not exist
 * @throws ArtifactNotPendingError if the artifact already has a downloadUrl
 * @throws ArtifactUploadNotFoundError if the file does not exist in R2
 */
export async function confirmArtifactUpload(
  releaseId: string,
  artifactId: string,
  data: ConfirmArtifactUploadInput,
  appId?: string
): Promise<ArtifactDto> {
  // Verify release exists (and optionally belongs to app)
  await verifyReleaseExists(releaseId, appId);

  // Get the artifact
  const existing = await db.query.artifacts.findFirst({
    where: and(
      eq(artifacts.id, artifactId),
      eq(artifacts.releaseId, releaseId)
    ),
  });

  if (!existing) {
    throw new ArtifactNotFoundError(artifactId);
  }

  // Verify artifact is in pending state (has r2Key but no downloadUrl)
  if (!existing.r2Key) {
    throw new ArtifactNotPendingError(artifactId);
  }

  if (existing.downloadUrl) {
    throw new ArtifactNotPendingError(artifactId);
  }

  // Verify file exists in R2 and get file info
  const fileExistsInR2 = await r2FileExists(existing.r2Key);
  if (!fileExistsInR2) {
    throw new ArtifactUploadNotFoundError(existing.r2Key);
  }

  // Get file info from R2
  const fileInfo = await getR2FileInfo(existing.r2Key);

  // Generate download URL - use public URL if available, otherwise generate presigned URL
  let downloadUrl: string;
  const publicUrl = getPublicUrl(existing.r2Key);
  if (publicUrl) {
    downloadUrl = publicUrl;
  } else {
    // Generate a long-lived presigned URL (7 days)
    downloadUrl = await generatePresignedDownloadUrl(existing.r2Key, 604800);
  }

  // Update the artifact with confirmed details
  const updateData: Partial<NewArtifact> = {
    downloadUrl,
    fileSize: fileInfo.size,
  };

  if (data.signature !== undefined) {
    updateData.signature = data.signature ?? null;
  }

  if (data.checksum !== undefined) {
    updateData.checksum = data.checksum ?? null;
  }

  await db.update(artifacts).set(updateData).where(eq(artifacts.id, artifactId));

  // Fetch and return updated record
  const updated = await db.query.artifacts.findFirst({
    where: eq(artifacts.id, artifactId),
  });

  if (!updated) {
    throw new ArtifactNotFoundError(artifactId);
  }

  return toArtifactDto(updated);
}

/**
 * Gets an artifact by ID without release verification.
 * Used internally when the release has already been verified.
 *
 * @param artifactId - The artifact ID
 * @returns The artifact DTO or null if not found
 */
export async function getArtifactByIdOnly(artifactId: string): Promise<ArtifactDto | null> {
  const artifact = await db.query.artifacts.findFirst({
    where: eq(artifacts.id, artifactId),
  });

  if (!artifact) {
    return null;
  }

  return toArtifactDto(artifact);
}
