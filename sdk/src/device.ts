/**
 * @oasis/sdk - Device Information Collection
 *
 * Collects non-PII device information for crash and feedback context.
 */

import type { DeviceInfo } from "./types.js";

// Declare process for Node.js environments
declare const process: {
  platform?: string;
  arch?: string;
} | undefined;

/**
 * Detects the current platform from the user agent or environment.
 *
 * @returns Platform identifier (e.g., "darwin-aarch64", "windows-x86_64")
 */
export function detectPlatform(): string {
  // Check for Tauri environment
  if (typeof window !== "undefined" && "__TAURI__" in window) {
    // In Tauri, we can get more accurate info from the API
    // For now, use a generic detection
  }

  // Browser/Node.js detection
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent.toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const platformStr = (navigator.platform ?? "").toLowerCase();

    // Detect OS
    let os = "unknown";
    if (ua.includes("mac") || platformStr.includes("mac")) {
      os = "darwin";
    } else if (ua.includes("win") || platformStr.includes("win")) {
      os = "windows";
    } else if (ua.includes("linux") || platformStr.includes("linux")) {
      os = "linux";
    }

    // Detect architecture (limited in browser)
    let arch = "x86_64"; // Default assumption
    if (ua.includes("arm64") || ua.includes("aarch64")) {
      arch = "aarch64";
    } else if (ua.includes("arm")) {
      arch = "armv7";
    }

    return `${os}-${arch}`;
  }

  // Node.js environment
  if (typeof process !== "undefined" && process?.platform) {
    const os = process.platform === "darwin" ? "darwin" :
               process.platform === "win32" ? "windows" :
               process.platform === "linux" ? "linux" : "unknown";

    const arch = process.arch === "arm64" ? "aarch64" :
                 process.arch === "arm" ? "armv7" :
                 process.arch === "x64" ? "x86_64" : "x86_64";

    return `${os}-${arch}`;
  }

  return "unknown-unknown";
}

/**
 * Detects the OS version.
 *
 * @returns OS version string or undefined
 */
export function detectOsVersion(): string | undefined {
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent;

    // macOS
    const macMatch = ua.match(/Mac OS X (\d+[._]\d+[._]?\d*)/);
    if (macMatch) {
      return `macOS ${macMatch[1].replace(/_/g, ".")}`;
    }

    // Windows
    const winMatch = ua.match(/Windows NT (\d+\.\d+)/);
    if (winMatch) {
      const version = winMatch[1];
      const versionMap: Record<string, string> = {
        "10.0": "10/11",
        "6.3": "8.1",
        "6.2": "8",
        "6.1": "7",
      };
      return `Windows ${versionMap[version] ?? version}`;
    }

    // Linux (limited info available)
    if (ua.includes("Linux")) {
      return "Linux";
    }
  }

  return undefined;
}

/**
 * Collects device information.
 *
 * @returns Device info object with available information
 */
export function collectDeviceInfo(): DeviceInfo {
  const info: DeviceInfo = {};

  // Browser environment
  if (typeof window !== "undefined" && typeof navigator !== "undefined") {
    // Screen info
    if (typeof screen !== "undefined") {
      info.screenWidth = screen.width;
      info.screenHeight = screen.height;
      info.pixelRatio = window.devicePixelRatio;
    }

    // User agent
    info.userAgent = navigator.userAgent;

    // Locale and timezone
    info.locale = navigator.language;
    try {
      info.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      // Timezone detection not available
    }

    // Hardware concurrency (CPU cores estimate)
    if (navigator.hardwareConcurrency) {
      info.cpuCores = navigator.hardwareConcurrency;
    }

    // Memory (if available - Chrome only)
    const nav = navigator as Navigator & { deviceMemory?: number };
    if (nav.deviceMemory) {
      info.memoryTotal = nav.deviceMemory * 1024 * 1024 * 1024; // Convert GB to bytes
    }
  }

  return info;
}

/**
 * Generates a stable device fingerprint (non-PII).
 * Used for tracking affected users count without storing PII.
 *
 * @returns A stable hash representing this device
 */
export function generateDeviceFingerprint(): string {
  const components: string[] = [];

  if (typeof navigator !== "undefined") {
    components.push(navigator.userAgent);
    components.push(navigator.language);
    components.push(String(navigator.hardwareConcurrency ?? ""));
  }

  if (typeof screen !== "undefined") {
    components.push(`${screen.width}x${screen.height}`);
    components.push(String(screen.colorDepth ?? ""));
  }

  // Simple hash function
  const str = components.join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return `device_${Math.abs(hash).toString(36)}`;
}
