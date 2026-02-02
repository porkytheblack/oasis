import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Error class for R2 storage operations.
 * Provides structured error information for R2-related failures.
 */
export class R2Error extends Error {
  /** The underlying cause of the error, if available */
  public readonly cause: unknown;
  /** The R2 key involved in the operation, if applicable */
  public readonly key: string | undefined;
  /** The operation that failed */
  public readonly operation: string;

  constructor(
    message: string,
    operation: string,
    options?: { cause?: unknown; key?: string }
  ) {
    super(message);
    this.name = "R2Error";
    this.operation = operation;
    this.cause = options?.cause;
    this.key = options?.key ?? undefined;
  }
}

/**
 * Error class for R2 configuration issues.
 */
export class R2ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "R2ConfigurationError";
  }
}

/**
 * R2 client configuration derived from environment variables.
 */
interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl?: string;
}

/**
 * File information returned from R2.
 */
export interface R2FileInfo {
  /** Size of the file in bytes */
  size: number;
  /** Content type (MIME type) of the file */
  contentType: string | null;
  /** Last modified timestamp */
  lastModified: Date | null;
  /** ETag of the file */
  etag: string | null;
}

// Singleton S3Client instance
let r2ClientInstance: S3Client | null = null;
let cachedConfig: R2Config | null = null;

/**
 * Validates and retrieves R2 configuration from environment variables.
 *
 * @throws R2ConfigurationError if required environment variables are missing
 */
function getR2Config(): R2Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_URL || undefined;

  const missingVars: string[] = [];

  if (!endpoint) {
    missingVars.push("R2_ENDPOINT");
  }
  if (!accessKeyId) {
    missingVars.push("R2_ACCESS_KEY_ID");
  }
  if (!secretAccessKey) {
    missingVars.push("R2_SECRET_ACCESS_KEY");
  }
  if (!bucket) {
    missingVars.push("R2_BUCKET");
  }

  if (missingVars.length > 0) {
    throw new R2ConfigurationError(
      `Missing required R2 configuration: ${missingVars.join(", ")}. ` +
        "Please ensure these environment variables are set."
    );
  }

  const config: R2Config = {
    endpoint: endpoint as string,
    accessKeyId: accessKeyId as string,
    secretAccessKey: secretAccessKey as string,
    bucket: bucket as string,
  };

  // Only set publicUrl if it has a non-empty value
  if (publicUrl && publicUrl.trim() !== "") {
    config.publicUrl = publicUrl.trim();
  }

  cachedConfig = config;
  return config;
}

/**
 * Returns the configured bucket name from environment variables.
 *
 * @throws R2ConfigurationError if R2_BUCKET is not configured
 */
export function getR2Bucket(): string {
  const config = getR2Config();
  return config.bucket;
}

/**
 * Returns a configured S3Client singleton instance for Cloudflare R2.
 *
 * The client is lazily instantiated on first call and reused for all subsequent
 * operations. This ensures connection pooling and efficient resource usage.
 *
 * @returns Configured S3Client instance
 * @throws R2ConfigurationError if required environment variables are missing
 */
export function getR2Client(): S3Client {
  if (r2ClientInstance) {
    return r2ClientInstance;
  }

  const config = getR2Config();

  const clientConfig: S3ClientConfig = {
    endpoint: config.endpoint,
    region: "auto",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // Cloudflare R2 specific settings
    forcePathStyle: true,
  };

  r2ClientInstance = new S3Client(clientConfig);
  return r2ClientInstance;
}

/**
 * Builds a consistent R2 key path for artifact storage.
 *
 * Key format: `{appSlug}/releases/{version}/{filename}`
 *
 * @param appSlug - The application slug (e.g., "my-app")
 * @param version - The release version (e.g., "1.2.0")
 * @param filename - The artifact filename (e.g., "app-1.2.0-darwin-aarch64.tar.gz")
 * @returns The constructed R2 key path
 *
 * @example
 * buildR2Key("my-app", "1.2.0", "app-1.2.0-darwin-aarch64.tar.gz")
 * // Returns: "my-app/releases/1.2.0/app-1.2.0-darwin-aarch64.tar.gz"
 */
export function buildR2Key(
  appSlug: string,
  version: string,
  filename: string
): string {
  // Sanitize inputs to prevent directory traversal and ensure valid paths
  const sanitizedSlug = appSlug.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const sanitizedVersion = version.replace(/[^a-z0-9.-]/gi, "-");
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "-");

  return `${sanitizedSlug}/releases/${sanitizedVersion}/${sanitizedFilename}`;
}

/**
 * Builds a consistent R2 key path for installer storage.
 *
 * Key format: `{appSlug}/installers/{version}/{filename}`
 *
 * @param appSlug - The application slug (e.g., "my-app")
 * @param version - The release version (e.g., "1.2.0")
 * @param filename - The installer filename (e.g., "MyApp-1.2.0.dmg")
 * @returns The constructed R2 key path
 *
 * @example
 * buildInstallerR2Key("my-app", "1.2.0", "MyApp-1.2.0.dmg")
 * // Returns: "my-app/installers/1.2.0/MyApp-1.2.0.dmg"
 */
export function buildInstallerR2Key(
  appSlug: string,
  version: string,
  filename: string
): string {
  // Sanitize inputs to prevent directory traversal and ensure valid paths
  const sanitizedSlug = appSlug.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const sanitizedVersion = version.replace(/[^a-z0-9.-]/gi, "-");
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "-");

  return `${sanitizedSlug}/installers/${sanitizedVersion}/${sanitizedFilename}`;
}

/**
 * Uploads a buffer directly to R2.
 *
 * @param key - The R2 object key (path)
 * @param buffer - The file contents as a Buffer
 * @param contentType - The MIME type of the file
 * @throws R2Error if the upload fails
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const client = getR2Client();
  const config = getR2Config();

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ContentLength: buffer.length,
  });

  try {
    await client.send(command);
  } catch (error) {
    throw new R2Error(
      `Failed to upload file to R2: ${error instanceof Error ? error.message : String(error)}`,
      "uploadFile",
      { cause: error, key }
    );
  }
}

/**
 * Generates a presigned URL for uploading a file to R2.
 *
 * The client can use this URL to upload the file directly to R2 without
 * the file passing through this server.
 *
 * @param key - The R2 object key (path) where the file will be stored
 * @param expiresIn - URL validity duration in seconds (default: 3600 = 1 hour)
 * @param contentType - Optional content type to enforce during upload
 * @returns The presigned upload URL
 * @throws R2Error if URL generation fails
 */
export async function generatePresignedUploadUrl(
  key: string,
  expiresIn: number = 3600,
  contentType?: string
): Promise<string> {
  const client = getR2Client();
  const config = getR2Config();

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ...(contentType && { ContentType: contentType }),
  });

  try {
    const url = await getSignedUrl(client, command, { expiresIn });
    return url;
  } catch (error) {
    throw new R2Error(
      `Failed to generate presigned upload URL: ${error instanceof Error ? error.message : String(error)}`,
      "generatePresignedUploadUrl",
      { cause: error, key }
    );
  }
}

/**
 * Generates a presigned URL for downloading a file from R2.
 *
 * If R2_PUBLIC_URL is configured, this returns a public URL instead of
 * a presigned URL (more efficient for public buckets).
 *
 * @param key - The R2 object key (path) to download
 * @param expiresIn - URL validity duration in seconds (default: 3600 = 1 hour)
 * @returns The presigned download URL or public URL
 * @throws R2Error if URL generation fails
 */
export async function generatePresignedDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const config = getR2Config();

  // If a public URL is configured, return that instead
  if (config.publicUrl) {
    return getPublicUrl(key)!;
  }

  const client = getR2Client();

  // Using dynamic import for GetObjectCommand to avoid bundling issues
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");

  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  });

  try {
    const url = await getSignedUrl(client, command, { expiresIn });
    return url;
  } catch (error) {
    throw new R2Error(
      `Failed to generate presigned download URL: ${error instanceof Error ? error.message : String(error)}`,
      "generatePresignedDownloadUrl",
      { cause: error, key }
    );
  }
}

/**
 * Returns the public URL for an R2 object if R2_PUBLIC_URL is configured.
 *
 * This is useful for buckets with public access enabled or custom domains.
 *
 * @param key - The R2 object key (path)
 * @returns The public URL, or null if R2_PUBLIC_URL is not configured
 */
export function getPublicUrl(key: string): string | null {
  const config = getR2Config();

  if (!config.publicUrl) {
    return null;
  }

  // Ensure the public URL doesn't have a trailing slash
  const baseUrl = config.publicUrl.replace(/\/+$/, "");
  // Ensure the key doesn't have a leading slash
  const cleanKey = key.replace(/^\/+/, "");

  return `${baseUrl}/${cleanKey}`;
}

/**
 * Deletes a file from R2.
 *
 * @param key - The R2 object key (path) to delete
 * @throws R2Error if the deletion fails
 */
export async function deleteFile(key: string): Promise<void> {
  const client = getR2Client();
  const config = getR2Config();

  const command = new DeleteObjectCommand({
    Bucket: config.bucket,
    Key: key,
  });

  try {
    await client.send(command);
  } catch (error) {
    throw new R2Error(
      `Failed to delete file from R2: ${error instanceof Error ? error.message : String(error)}`,
      "deleteFile",
      { cause: error, key }
    );
  }
}

/**
 * Checks if a file exists in R2.
 *
 * @param key - The R2 object key (path) to check
 * @returns true if the file exists, false otherwise
 * @throws R2Error if the check fails for reasons other than file not found
 */
export async function fileExists(key: string): Promise<boolean> {
  const client = getR2Client();
  const config = getR2Config();

  const command = new HeadObjectCommand({
    Bucket: config.bucket,
    Key: key,
  });

  try {
    await client.send(command);
    return true;
  } catch (error: unknown) {
    // Check if this is a "not found" error
    const errorName = error instanceof Error ? error.name : "";
    const isNotFound =
      errorName === "NotFound" ||
      errorName === "NoSuchKey" ||
      (error && typeof error === "object" && "$metadata" in error &&
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404);

    if (isNotFound) {
      return false;
    }

    throw new R2Error(
      `Failed to check file existence in R2: ${error instanceof Error ? error.message : String(error)}`,
      "fileExists",
      { cause: error, key }
    );
  }
}

/**
 * Retrieves information about a file in R2.
 *
 * @param key - The R2 object key (path)
 * @returns File information including size, content type, and metadata
 * @throws R2Error if the file does not exist or the request fails
 */
export async function getFileInfo(key: string): Promise<R2FileInfo> {
  const client = getR2Client();
  const config = getR2Config();

  const command = new HeadObjectCommand({
    Bucket: config.bucket,
    Key: key,
  });

  try {
    const response = await client.send(command);

    return {
      size: response.ContentLength ?? 0,
      contentType: response.ContentType ?? null,
      lastModified: response.LastModified ?? null,
      etag: response.ETag ?? null,
    };
  } catch (error: unknown) {
    // Check if this is a "not found" error
    const errorName = error instanceof Error ? error.name : "";
    const isNotFound =
      errorName === "NotFound" ||
      errorName === "NoSuchKey" ||
      (error && typeof error === "object" && "$metadata" in error &&
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404);

    if (isNotFound) {
      throw new R2Error(
        `File not found in R2: ${key}`,
        "getFileInfo",
        { cause: error, key }
      );
    }

    throw new R2Error(
      `Failed to get file info from R2: ${error instanceof Error ? error.message : String(error)}`,
      "getFileInfo",
      { cause: error, key }
    );
  }
}

/**
 * Checks if R2 is properly configured.
 *
 * @returns true if all required R2 environment variables are set
 */
export function isR2Configured(): boolean {
  try {
    getR2Config();
    return true;
  } catch {
    return false;
  }
}

/**
 * Resets the R2 client singleton.
 * Primarily useful for testing or when configuration changes.
 */
export function resetR2Client(): void {
  r2ClientInstance = null;
  cachedConfig = null;
}
