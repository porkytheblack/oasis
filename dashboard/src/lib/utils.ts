import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names using clsx and merges Tailwind CSS classes intelligently
 * using tailwind-merge to handle conflicting utility classes.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats a file size in bytes to a human-readable string.
 * Examples: "1.5 MB", "256 KB", "2.1 GB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const base = 1024;
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(base));
  const clampedIndex = Math.min(unitIndex, units.length - 1);

  const value = bytes / Math.pow(base, clampedIndex);
  const formattedValue = value < 10 ? value.toFixed(2) : value < 100 ? value.toFixed(1) : value.toFixed(0);

  return `${formattedValue} ${units[clampedIndex]}`;
}

/**
 * Formats a date string to a localized format.
 * Falls back to ISO string if parsing fails.
 */
export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return dateString;
    }
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return dateString;
  }
}

/**
 * Formats a date string to relative time (e.g., "2 hours ago", "3 days ago").
 */
export function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return dateString;
    }

    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return "just now";
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
      return `${diffInMinutes} ${diffInMinutes === 1 ? "minute" : "minutes"} ago`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours} ${diffInHours === 1 ? "hour" : "hours"} ago`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) {
      return `${diffInDays} ${diffInDays === 1 ? "day" : "days"} ago`;
    }

    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) {
      return `${diffInMonths} ${diffInMonths === 1 ? "month" : "months"} ago`;
    }

    const diffInYears = Math.floor(diffInMonths / 12);
    return `${diffInYears} ${diffInYears === 1 ? "year" : "years"} ago`;
  } catch {
    return dateString;
  }
}

/**
 * Truncates a string to the specified length with ellipsis.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Redacts an API key, showing only the first and last few characters.
 * Example: "sk_live_abc...xyz"
 */
export function redactApiKey(key: string, visibleChars: number = 8): string {
  if (key.length <= visibleChars * 2) {
    return key.slice(0, 4) + "..." + key.slice(-4);
  }
  return key.slice(0, visibleChars) + "..." + key.slice(-visibleChars);
}

/**
 * Converts a platform string to a display-friendly name.
 */
export function formatPlatform(platform: string): string {
  const platformNames: Record<string, string> = {
    darwin: "macOS",
    "darwin-aarch64": "macOS (Apple Silicon)",
    "darwin-x86_64": "macOS (Intel)",
    windows: "Windows",
    "windows-x86_64": "Windows (64-bit)",
    "windows-x86": "Windows (32-bit)",
    linux: "Linux",
    "linux-x86_64": "Linux (64-bit)",
    "linux-aarch64": "Linux (ARM64)",
  };

  return platformNames[platform.toLowerCase()] || platform;
}

/**
 * Gets the base platform from a full platform string (e.g., "darwin-aarch64" -> "darwin")
 */
export function getBasePlatform(platform: string): "darwin" | "windows" | "linux" {
  const lower = platform.toLowerCase();
  if (lower.includes("darwin") || lower.includes("macos")) return "darwin";
  if (lower.includes("windows") || lower.includes("win")) return "windows";
  return "linux";
}

/**
 * Generates a slug from a string (lowercase, hyphen-separated).
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Validates a semantic version string.
 */
export function isValidSemver(version: string): boolean {
  const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverRegex.test(version);
}

/**
 * Copies text to the clipboard with fallback for older browsers.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand("copy");
      return true;
    } finally {
      textArea.remove();
    }
  } catch {
    console.error("Failed to copy to clipboard");
    return false;
  }
}

/**
 * Extracts the filename from an R2 key or download URL.
 * R2 keys are typically in format: "artifacts/{releaseId}/{filename}"
 * Returns the last path segment as the filename.
 */
export function extractFilename(r2Key: string | null, downloadUrl: string | null): string {
  if (r2Key) {
    const segments = r2Key.split("/");
    const lastSegment = segments[segments.length - 1];
    if (lastSegment) {
      return lastSegment;
    }
  }

  if (downloadUrl) {
    try {
      const url = new URL(downloadUrl);
      const pathSegments = url.pathname.split("/");
      const lastSegment = pathSegments[pathSegments.length - 1];
      if (lastSegment) {
        return decodeURIComponent(lastSegment);
      }
    } catch {
      // Fall through to return unknown
    }
  }

  return "Unknown file";
}

/**
 * Extracts the hash value from a checksum string.
 * Checksums are stored in format: "sha256:{hash}" or just the raw hash.
 * Returns just the hash portion.
 */
export function extractHash(checksum: string | null): string | null {
  if (!checksum) {
    return null;
  }

  // Handle "sha256:abc123..." format
  if (checksum.includes(":")) {
    const parts = checksum.split(":");
    return parts[1] || checksum;
  }

  return checksum;
}

/**
 * Valid Tauri artifact file extensions for uploads.
 * These are the common file types produced by Tauri builds.
 */
export const VALID_ARTIFACT_EXTENSIONS = [
  ".tar.gz",
  ".app.tar.gz",
  ".dmg",
  ".msi",
  ".exe",
  ".AppImage",
  ".deb",
  ".nsis.zip",
  ".sig",
] as const;

/**
 * Validates if a filename has a valid Tauri artifact extension.
 * Returns true if the file is a valid artifact type.
 */
export function isValidArtifactFile(filename: string): boolean {
  const lowerFilename = filename.toLowerCase();
  return VALID_ARTIFACT_EXTENSIONS.some((ext) =>
    lowerFilename.endsWith(ext.toLowerCase())
  );
}

/**
 * Gets a human-readable description of valid artifact file types.
 */
export function getValidArtifactTypesDescription(): string {
  return VALID_ARTIFACT_EXTENSIONS.join(", ");
}

/**
 * Sanitizes a filename for upload by replacing invalid characters with hyphens.
 * The server only accepts filenames matching: /^[a-zA-Z0-9._-]+$/
 * This function replaces any character not in that set with a hyphen,
 * then collapses consecutive hyphens into a single one.
 *
 * @param filename - The original filename to sanitize
 * @returns A sanitized filename safe for the server's validation
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) {
    return filename;
  }

  // Replace any character that is not alphanumeric, dot, underscore, or hyphen
  let sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "-");

  // Collapse consecutive hyphens into a single hyphen
  sanitized = sanitized.replace(/-+/g, "-");

  // Remove leading/trailing hyphens (but preserve extension dots)
  sanitized = sanitized.replace(/^-+/, "").replace(/-+$/, "");

  // Ensure the filename is not empty after sanitization
  if (!sanitized) {
    return "artifact";
  }

  return sanitized;
}

/**
 * Content-Type mapping for Tauri artifact file extensions.
 * The browser's file.type is often empty or unreliable for many of these formats.
 */
const CONTENT_TYPE_MAP: Record<string, string> = {
  ".tar.gz": "application/gzip",
  ".app.tar.gz": "application/gzip",
  ".dmg": "application/x-apple-diskimage",
  ".msi": "application/x-msi",
  ".exe": "application/x-msdownload",
  ".appimage": "application/x-executable",
  ".deb": "application/vnd.debian.binary-package",
  ".nsis.zip": "application/zip",
  ".zip": "application/zip",
  ".sig": "application/pgp-signature",
};

/**
 * Determines the correct Content-Type for a file based on its extension.
 * This is more reliable than using file.type from the browser, which is often
 * empty or incorrect for many Tauri artifact types (.tar.gz, .AppImage, etc.).
 *
 * @param filename - The filename to determine Content-Type for
 * @returns The appropriate MIME type for the file
 */
export function getContentTypeFromFilename(filename: string): string {
  if (!filename) {
    return "application/octet-stream";
  }

  const lowerFilename = filename.toLowerCase();

  // Check extensions from longest to shortest to match compound extensions first
  // (e.g., ".app.tar.gz" before ".tar.gz" before ".gz")
  const sortedExtensions = Object.keys(CONTENT_TYPE_MAP).sort(
    (a, b) => b.length - a.length
  );

  for (const ext of sortedExtensions) {
    if (lowerFilename.endsWith(ext)) {
      return CONTENT_TYPE_MAP[ext];
    }
  }

  return "application/octet-stream";
}
