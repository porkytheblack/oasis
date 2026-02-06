/**
 * @oasis/sdk - Crash Reporting
 *
 * Handles crash report creation and submission.
 */

import type {
  OasisConfig,
  CrashEvent,
  CrashReportOptions,
  CaptureExceptionOptions,
  StackFrame,
  UserInfo,
} from "./types.js";
import { OasisClient } from "./client.js";
import { BreadcrumbManager } from "./breadcrumbs.js";
import { EventQueue } from "./queue.js";
import { detectPlatform, detectOsVersion, collectDeviceInfo } from "./device.js";

/**
 * Parse a stack trace string into structured frames.
 *
 * @param stack - The stack trace string
 * @returns Array of stack frames
 */
function parseStackTrace(stack: string | undefined): StackFrame[] {
  if (!stack) {
    return [];
  }

  const frames: StackFrame[] = [];
  const lines = stack.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip the error message line
    if (!trimmed.startsWith("at ")) {
      continue;
    }

    const frame = parseStackFrame(trimmed);
    if (frame) {
      frames.push(frame);
    }
  }

  return frames;
}

/**
 * Parse a single stack frame line.
 *
 * @param line - The stack frame line
 * @returns Parsed stack frame or null
 */
function parseStackFrame(line: string): StackFrame | null {
  // Remove "at " prefix
  const content = line.slice(3);

  // Pattern: functionName (file:line:column)
  // Or: functionName (file:line)
  // Or: file:line:column
  // Or: native code

  if (content.includes("[native code]") || content.includes("<native>")) {
    return { isNative: true };
  }

  // Try to match: functionName (file:line:column)
  const matchWithParen = content.match(/^(.+?)\s*\((.+?):(\d+):(\d+)\)$/);
  if (matchWithParen) {
    return {
      function: matchWithParen[1],
      file: matchWithParen[2],
      line: parseInt(matchWithParen[3], 10),
      column: parseInt(matchWithParen[4], 10),
    };
  }

  // Try to match: functionName (file:line)
  const matchWithParenNoCol = content.match(/^(.+?)\s*\((.+?):(\d+)\)$/);
  if (matchWithParenNoCol) {
    return {
      function: matchWithParenNoCol[1],
      file: matchWithParenNoCol[2],
      line: parseInt(matchWithParenNoCol[3], 10),
    };
  }

  // Try to match: file:line:column (no function name)
  const matchNoFn = content.match(/^(.+?):(\d+):(\d+)$/);
  if (matchNoFn) {
    return {
      file: matchNoFn[1],
      line: parseInt(matchNoFn[2], 10),
      column: parseInt(matchNoFn[3], 10),
    };
  }

  // Try to match: file:line (no function name, no column)
  const matchNoFnNoCol = content.match(/^(.+?):(\d+)$/);
  if (matchNoFnNoCol) {
    return {
      file: matchNoFnNoCol[1],
      line: parseInt(matchNoFnNoCol[2], 10),
    };
  }

  // Function name only
  if (content && !content.includes(":")) {
    return { function: content };
  }

  return null;
}

/**
 * Crash reporter for capturing and sending error reports.
 */
export class CrashReporter {
  private config: OasisConfig;
  private client: OasisClient;
  private breadcrumbs: BreadcrumbManager;
  private queue: EventQueue;
  private user: UserInfo | null = null;
  private globalCleanup: (() => void) | null = null;

  constructor(
    config: OasisConfig,
    client: OasisClient,
    breadcrumbs: BreadcrumbManager,
    queue: EventQueue
  ) {
    this.config = config;
    this.client = client;
    this.breadcrumbs = breadcrumbs;
    this.queue = queue;
  }

  /**
   * Report a crash/error to Oasis.
   *
   * @param options - Crash report options
   */
  async report(options: CrashReportOptions): Promise<void> {
    const event = this.createCrashEvent(options.error, options);
    await this.sendOrQueue(event);
  }

  /**
   * Capture an exception and report it.
   * Useful for try/catch blocks.
   *
   * @param error - The error to capture
   * @param options - Additional options
   */
  async captureException(
    error: unknown,
    options?: CaptureExceptionOptions
  ): Promise<void> {
    const errorObj = this.normalizeError(error);
    const event = this.createCrashEvent(errorObj, options);
    await this.sendOrQueue(event);
  }

  /**
   * Set the current user for crash attribution.
   *
   * @param user - User information
   */
  setUser(user: UserInfo | null): void {
    this.user = user;
  }

  /**
   * Enable automatic crash reporting for uncaught errors.
   */
  enableAutoCrashReporting(): void {
    if (typeof window === "undefined") {
      return;
    }

    // Prevent double registration
    if (this.globalCleanup) {
      return;
    }

    // Handle uncaught errors
    const errorHandler = (event: ErrorEvent) => {
      const error = event.error ?? new Error(event.message);
      this.captureException(error, { severity: "fatal" });
    };

    // Handle unhandled promise rejections
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const error = this.normalizeError(event.reason);
      this.captureException(error, { severity: "error" });
    };

    window.addEventListener("error", errorHandler);
    window.addEventListener("unhandledrejection", rejectionHandler);

    this.globalCleanup = () => {
      window.removeEventListener("error", errorHandler);
      window.removeEventListener("unhandledrejection", rejectionHandler);
    };
  }

  /**
   * Disable automatic crash reporting.
   */
  disableAutoCrashReporting(): void {
    if (this.globalCleanup) {
      this.globalCleanup();
      this.globalCleanup = null;
    }
  }

  /**
   * Create a crash event from an error.
   */
  private createCrashEvent(
    error: Error,
    options?: CaptureExceptionOptions
  ): CrashEvent {
    const stackTrace = parseStackTrace(error.stack);
    const deviceInfo = collectDeviceInfo();
    const platform = detectPlatform();
    const osVersion = detectOsVersion();

    return {
      type: "crash",
      errorType: error.name || "Error",
      errorMessage: error.message || "Unknown error",
      stackTrace,
      appVersion: this.config.appVersion,
      platform,
      osVersion,
      deviceInfo,
      appState: options?.appState,
      breadcrumbs: this.breadcrumbs.getAll(),
      severity: options?.severity ?? "error",
      userId: this.user?.id,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Normalize any value to an Error object.
   */
  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    if (typeof error === "string") {
      return new Error(error);
    }

    if (typeof error === "object" && error !== null) {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string") {
        const err = new Error(message);
        const name = (error as Record<string, unknown>).name;
        if (typeof name === "string") {
          err.name = name;
        }
        return err;
      }
    }

    return new Error(String(error));
  }

  /**
   * Send event or queue it for later if offline/failed.
   */
  private async sendOrQueue(event: CrashEvent): Promise<void> {
    // Apply beforeSend hook
    if (this.config.beforeSend) {
      const modified = this.config.beforeSend(event);
      if (!modified) {
        // Event was filtered out
        if (this.config.debug) {
          console.log("[Oasis] Crash event filtered by beforeSend");
        }
        return;
      }
      Object.assign(event, modified);
    }

    try {
      await this.client.sendCrash(event);
      if (this.config.debug) {
        console.log("[Oasis] Crash report sent successfully");
      }
    } catch (error) {
      if (this.config.debug) {
        console.error("[Oasis] Failed to send crash report, queueing:", error);
      }

      // Queue for later retry
      this.queue.enqueue(event);

      // Call error callback
      if (this.config.onError && error instanceof Error) {
        this.config.onError(error, event);
      }
    }
  }
}
