import { eq, and } from "drizzle-orm";
import { ulid } from "ulid";
import { db, installers, releases } from "../db/index.js";
import type { Installer, NewInstaller } from "../db/schema.js";
import type { InstallerPlatform, InstallerDto } from "../types/index.js";
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
 * Error thrown when an installer is not found
 */
export class InstallerNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Installer with identifier '${identifier}' was not found`);
    this.name = "InstallerNotFoundError";
  }
}

/**
 * Error thrown when an installer platform conflicts with an existing installer
 */
export class InstallerPlatformConflictError extends Error {
  constructor(releaseId: string, platform: string) {
    super(
      `An installer for platform '${platform}' already exists for release '${releaseId}'`
    );
    this.name = "InstallerPlatformConflictError";
  }
}

/**
 * Error thrown when the release is not found for an installer operation
 */
export class ReleaseNotFoundForInstallerError extends Error {
  constructor(releaseId: string) {
    super(`Release with identifier '${releaseId}' was not found`);
    this.name = "ReleaseNotFoundForInstallerError";
  }
}

/**
 * Error thrown when an installer upload confirmation fails
 */
export class InstallerUploadNotFoundError extends Error {
  constructor(r2Key: string) {
    super(`Installer file not found in storage at '${r2Key}'`);
    this.name = "InstallerUploadNotFoundError";
  }
}

/**
 * Error thrown when installer is not in pending state for confirmation
 */
export class InstallerNotPendingError extends Error {
  constructor(installerId: string) {
    super(`Installer '${installerId}' is not in pending state or already has a download URL`);
    this.name = "InstallerNotPendingError";
  }
}

/**
 * Input data for creating a new installer with direct URL
 */
export interface CreateInstallerInput {
  platform: InstallerPlatform;
  filename: string;
  displayName?: string | null;
  downloadUrl?: string | null;
  fileSize?: number | null;
  checksum?: string | null;
}

/**
 * Input for creating a pending installer for R2 upload
 */
export interface CreatePendingInstallerInput {
  platform: InstallerPlatform;
  filename: string;
  displayName?: string | null;
  r2Key: string;
  replaceExisting?: boolean;
}

/**
 * Input for confirming an installer upload
 */
export interface ConfirmInstallerUploadInput {
  checksum?: string | null;
}

/**
 * Converts a database Installer record to an InstallerDto for API responses.
 *
 * @param installer - The database record
 * @returns The installer DTO
 */
function toInstallerDto(installer: Installer): InstallerDto {
  return {
    id: installer.id,
    releaseId: installer.releaseId,
    platform: installer.platform as InstallerPlatform,
    filename: installer.filename,
    displayName: installer.displayName,
    r2Key: installer.r2Key,
    downloadUrl: installer.downloadUrl,
    fileSize: installer.fileSize,
    checksum: installer.checksum,
    createdAt: installer.createdAt.toISOString(),
  };
}

/**
 * Verifies that a release exists and optionally belongs to a specific app.
 *
 * @param releaseId - The release ID to verify
 * @param appId - Optional app ID to verify ownership
 * @throws ReleaseNotFoundForInstallerError if the release does not exist
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
    throw new ReleaseNotFoundForInstallerError(releaseId);
  }
}

/**
 * Creates a new installer for a release with a direct download URL.
 *
 * @param releaseId - The release ID to create the installer for
 * @param data - The installer creation data
 * @param appId - Optional app ID for ownership verification
 * @returns The created installer DTO
 * @throws ReleaseNotFoundForInstallerError if the release does not exist
 * @throws InstallerPlatformConflictError if an installer for the platform already exists
 */
export async function createInstaller(
  releaseId: string,
  data: CreateInstallerInput,
  appId?: string
): Promise<InstallerDto> {
  await verifyReleaseExists(releaseId, appId);

  const existing = await db.query.installers.findFirst({
    where: and(
      eq(installers.releaseId, releaseId),
      eq(installers.platform, data.platform)
    ),
  });

  if (existing) {
    throw new InstallerPlatformConflictError(releaseId, data.platform);
  }

  const now = new Date();
  const newInstaller: NewInstaller = {
    id: ulid(),
    releaseId,
    platform: data.platform,
    filename: data.filename,
    displayName: data.displayName ?? null,
    r2Key: null,
    downloadUrl: data.downloadUrl ?? null,
    fileSize: data.fileSize ?? null,
    checksum: data.checksum ?? null,
    createdAt: now,
  };

  await db.insert(installers).values(newInstaller);

  const createdInstaller: Installer = {
    id: newInstaller.id,
    releaseId: newInstaller.releaseId,
    platform: newInstaller.platform,
    filename: newInstaller.filename,
    displayName: newInstaller.displayName ?? null,
    r2Key: null,
    downloadUrl: newInstaller.downloadUrl ?? null,
    fileSize: newInstaller.fileSize ?? null,
    checksum: newInstaller.checksum ?? null,
    createdAt: now,
  };

  return toInstallerDto(createdInstaller);
}

/**
 * Creates a pending installer record for R2 upload.
 *
 * This creates an installer in a "pending" state (no downloadUrl) that will be
 * completed when the upload is confirmed. The installer is created with an r2Key
 * but no downloadUrl until the upload is verified.
 *
 * @param releaseId - The release ID to create the installer for
 * @param data - Platform, filename, R2 key, and optional replaceExisting flag
 * @param appId - Optional app ID for ownership verification
 * @returns The created installer DTO
 * @throws ReleaseNotFoundForInstallerError if the release does not exist
 * @throws InstallerPlatformConflictError if an installer for the platform already exists and replaceExisting is false
 */
export async function createPendingInstaller(
  releaseId: string,
  data: CreatePendingInstallerInput,
  appId?: string
): Promise<InstallerDto> {
  await verifyReleaseExists(releaseId, appId);

  const existing = await db.query.installers.findFirst({
    where: and(
      eq(installers.releaseId, releaseId),
      eq(installers.platform, data.platform)
    ),
  });

  if (existing) {
    if (data.replaceExisting) {
      if (existing.r2Key && isR2Configured()) {
        try {
          await deleteR2File(existing.r2Key);
        } catch (error) {
          console.error(
            `Warning: Failed to delete existing R2 file '${existing.r2Key}':`,
            error instanceof R2Error ? error.message : error
          );
        }
      }
      await db.delete(installers).where(eq(installers.id, existing.id));
    } else {
      throw new InstallerPlatformConflictError(releaseId, data.platform);
    }
  }

  const now = new Date();
  const newInstaller: NewInstaller = {
    id: ulid(),
    releaseId,
    platform: data.platform,
    filename: data.filename,
    displayName: data.displayName ?? null,
    r2Key: data.r2Key,
    downloadUrl: null,
    fileSize: null,
    checksum: null,
    createdAt: now,
  };

  await db.insert(installers).values(newInstaller);

  const createdInstaller: Installer = {
    id: newInstaller.id,
    releaseId: newInstaller.releaseId,
    platform: newInstaller.platform,
    filename: newInstaller.filename,
    displayName: newInstaller.displayName ?? null,
    r2Key: data.r2Key,
    downloadUrl: null,
    fileSize: null,
    checksum: null,
    createdAt: now,
  };

  return toInstallerDto(createdInstaller);
}

/**
 * Confirms an installer upload by verifying the file exists in R2 and updating
 * the installer record with download URL and file size.
 *
 * @param releaseId - The release ID for ownership check
 * @param installerId - The installer ID to confirm
 * @param data - Optional checksum to set
 * @param appId - Optional app ID for ownership verification
 * @returns The confirmed installer DTO
 * @throws ReleaseNotFoundForInstallerError if the release does not exist
 * @throws InstallerNotFoundError if the installer does not exist
 * @throws InstallerNotPendingError if the installer already has a downloadUrl
 * @throws InstallerUploadNotFoundError if the file does not exist in R2
 */
export async function confirmInstallerUpload(
  releaseId: string,
  installerId: string,
  data: ConfirmInstallerUploadInput,
  appId?: string
): Promise<InstallerDto> {
  await verifyReleaseExists(releaseId, appId);

  const existing = await db.query.installers.findFirst({
    where: and(
      eq(installers.id, installerId),
      eq(installers.releaseId, releaseId)
    ),
  });

  if (!existing) {
    throw new InstallerNotFoundError(installerId);
  }

  if (!existing.r2Key) {
    throw new InstallerNotPendingError(installerId);
  }

  if (existing.downloadUrl) {
    throw new InstallerNotPendingError(installerId);
  }

  const fileExistsInR2 = await r2FileExists(existing.r2Key);
  if (!fileExistsInR2) {
    throw new InstallerUploadNotFoundError(existing.r2Key);
  }

  const fileInfo = await getR2FileInfo(existing.r2Key);

  let downloadUrl: string;
  const publicUrl = getPublicUrl(existing.r2Key);
  if (publicUrl) {
    downloadUrl = publicUrl;
  } else {
    downloadUrl = await generatePresignedDownloadUrl(existing.r2Key, 604800);
  }

  const updateData: Partial<NewInstaller> = {
    downloadUrl,
    fileSize: fileInfo.size,
  };

  if (data.checksum !== undefined) {
    updateData.checksum = data.checksum ?? null;
  }

  await db.update(installers).set(updateData).where(eq(installers.id, installerId));

  const updated = await db.query.installers.findFirst({
    where: eq(installers.id, installerId),
  });

  if (!updated) {
    throw new InstallerNotFoundError(installerId);
  }

  return toInstallerDto(updated);
}

/**
 * Lists all installers for a release.
 *
 * @param releaseId - The release ID
 * @param appId - Optional app ID for ownership verification
 * @returns Array of installer DTOs
 * @throws ReleaseNotFoundForInstallerError if the release does not exist
 */
export async function listInstallers(
  releaseId: string,
  appId?: string
): Promise<InstallerDto[]> {
  await verifyReleaseExists(releaseId, appId);

  const installersList = await db.query.installers.findMany({
    where: eq(installers.releaseId, releaseId),
  });

  return installersList.map(toInstallerDto);
}

/**
 * Retrieves an installer by ID.
 *
 * @param installerId - The installer ID
 * @returns The installer DTO
 * @throws InstallerNotFoundError if the installer does not exist
 */
export async function getInstallerById(
  installerId: string
): Promise<InstallerDto> {
  const installer = await db.query.installers.findFirst({
    where: eq(installers.id, installerId),
  });

  if (!installer) {
    throw new InstallerNotFoundError(installerId);
  }

  return toInstallerDto(installer);
}

/**
 * Retrieves an installer by release ID and platform.
 *
 * @param releaseId - The release ID
 * @param platform - The platform to get the installer for
 * @param appId - Optional app ID for ownership verification
 * @returns The installer DTO
 * @throws ReleaseNotFoundForInstallerError if the release does not exist
 * @throws InstallerNotFoundError if no installer exists for the platform
 */
export async function getInstallerByPlatform(
  releaseId: string,
  platform: string,
  appId?: string
): Promise<InstallerDto> {
  await verifyReleaseExists(releaseId, appId);

  const installer = await db.query.installers.findFirst({
    where: and(
      eq(installers.releaseId, releaseId),
      eq(installers.platform, platform)
    ),
  });

  if (!installer) {
    throw new InstallerNotFoundError(`${releaseId}/${platform}`);
  }

  return toInstallerDto(installer);
}

/**
 * Deletes an installer and its associated file from R2 storage.
 *
 * @param installerId - The installer ID to delete
 * @throws InstallerNotFoundError if the installer does not exist
 */
export async function deleteInstaller(
  installerId: string
): Promise<void> {
  const existing = await db.query.installers.findFirst({
    where: eq(installers.id, installerId),
  });

  if (!existing) {
    throw new InstallerNotFoundError(installerId);
  }

  if (existing.r2Key && isR2Configured()) {
    try {
      await deleteR2File(existing.r2Key);
    } catch (error) {
      console.error(
        `Warning: Failed to delete R2 file '${existing.r2Key}':`,
        error instanceof R2Error ? error.message : error
      );
    }
  }

  await db.delete(installers).where(eq(installers.id, installerId));
}

/**
 * Gets the raw installer record for internal use.
 *
 * @param installerId - The installer ID
 * @returns The installer record or null
 */
export async function getRawInstallerById(
  installerId: string
): Promise<Installer | null> {
  const installer = await db.query.installers.findFirst({
    where: eq(installers.id, installerId),
  });

  return installer ?? null;
}

/**
 * Checks if an installer exists for a specific platform in a release.
 *
 * @param releaseId - The release ID
 * @param platform - The platform to check
 * @returns true if an installer exists for the platform
 */
export async function installerExistsForPlatform(
  releaseId: string,
  platform: string
): Promise<boolean> {
  const installer = await db.query.installers.findFirst({
    where: and(
      eq(installers.releaseId, releaseId),
      eq(installers.platform, platform)
    ),
  });

  return installer !== undefined;
}
