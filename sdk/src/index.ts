/**
 * @oasis/sdk - Main Entry Point
 *
 * TypeScript SDK for Oasis - Feedback and Crash Analytics for Tauri apps
 *
 * @example
 * ```typescript
 * import { initOasis } from '@oasis/sdk';
 *
 * const oasis = initOasis({
 *   apiKey: 'pk_my-app_a1b2c3d4e5f6g7h8',
 *   serverUrl: 'https://updates.myapp.com',
 *   appVersion: '1.2.3',
 *   enableAutoCrashReporting: true,
 * });
 *
 * // Submit feedback
 * await oasis.feedback.submit({
 *   category: 'bug',
 *   message: 'Something went wrong',
 *   email: 'user@example.com',
 * });
 *
 * // Report a crash manually
 * await oasis.crashes.report({
 *   error: new Error('Failed to save'),
 *   appState: { screen: 'settings' },
 * });
 *
 * // Capture exception in try/catch
 * try {
 *   riskyOperation();
 * } catch (error) {
 *   oasis.crashes.captureException(error);
 * }
 *
 * // Add breadcrumbs for crash context
 * oasis.breadcrumbs.add({
 *   type: 'navigation',
 *   message: 'User navigated to Settings',
 * });
 *
 * // Set user for tracking
 * oasis.setUser({ id: 'user-123' });
 * ```
 */

import type { OasisConfig, UserInfo, FeedbackEvent, CrashEvent } from "./types.js";
import { OasisClient } from "./client.js";
import { FeedbackManager } from "./feedback.js";
import { CrashReporter } from "./crashes.js";
import { BreadcrumbManager, setupAutoBreadcrumbs } from "./breadcrumbs.js";
import { EventQueue, setupQueueListeners } from "./queue.js";

// Re-export types
export * from "./types.js";

/**
 * The main Oasis SDK instance.
 */
export interface OasisInstance {
  /** Feedback submission interface */
  feedback: FeedbackManager;

  /** Crash reporting interface */
  crashes: CrashReporter;

  /** Breadcrumb management interface */
  breadcrumbs: BreadcrumbManager;

  /**
   * Set the current user for crash attribution.
   *
   * @param user - User information or null to clear
   */
  setUser(user: UserInfo | null): void;

  /**
   * Get the current configuration.
   */
  getConfig(): Readonly<OasisConfig>;

  /**
   * Manually flush the event queue.
   */
  flush(): Promise<void>;

  /**
   * Destroy the SDK instance and clean up resources.
   */
  destroy(): void;
}

/**
 * Validates the SDK configuration.
 *
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 */
function validateConfig(config: OasisConfig): void {
  if (!config.apiKey) {
    throw new Error("Oasis SDK: apiKey is required");
  }

  if (!config.apiKey.startsWith("pk_")) {
    throw new Error("Oasis SDK: apiKey must be a public key (starting with pk_)");
  }

  if (!config.serverUrl) {
    throw new Error("Oasis SDK: serverUrl is required");
  }

  if (!config.appVersion) {
    throw new Error("Oasis SDK: appVersion is required");
  }

  // Validate semver format (basic check)
  if (!/^\d+\.\d+\.\d+/.test(config.appVersion)) {
    throw new Error("Oasis SDK: appVersion must be a valid semver (e.g., 1.2.3)");
  }
}

/**
 * Initialize the Oasis SDK.
 *
 * @param config - SDK configuration
 * @returns Initialized SDK instance
 *
 * @example
 * ```typescript
 * const oasis = initOasis({
 *   apiKey: 'pk_my-app_a1b2c3d4e5f6g7h8',
 *   serverUrl: 'https://updates.myapp.com',
 *   appVersion: '1.2.3',
 *   enableAutoCrashReporting: true,
 * });
 * ```
 */
export function initOasis(config: OasisConfig): OasisInstance {
  // Validate configuration
  validateConfig(config);

  // Apply defaults
  const fullConfig: OasisConfig = {
    maxBreadcrumbs: 50,
    timeout: 10000,
    enableAutoCrashReporting: false,
    debug: false,
    ...config,
  };

  // Create components
  const client = new OasisClient(fullConfig);
  const breadcrumbs = new BreadcrumbManager(fullConfig.maxBreadcrumbs);
  const queue = new EventQueue();
  const feedback = new FeedbackManager(fullConfig, client, queue);
  const crashes = new CrashReporter(fullConfig, client, breadcrumbs, queue);

  // Setup queue send function
  queue.setSendFunction(async (event: FeedbackEvent | CrashEvent) => {
    if (event.type === "feedback") {
      await client.sendFeedback(event);
    } else {
      await client.sendCrash(event);
    }
  });

  // Track cleanup functions
  const cleanupFns: Array<() => void> = [];

  // Setup auto breadcrumbs
  const breadcrumbCleanup = setupAutoBreadcrumbs(breadcrumbs);
  cleanupFns.push(breadcrumbCleanup);

  // Setup queue listeners
  const queueCleanup = setupQueueListeners(queue);
  cleanupFns.push(queueCleanup);

  // Setup auto crash reporting if enabled
  if (fullConfig.enableAutoCrashReporting) {
    crashes.enableAutoCrashReporting();
  }

  if (fullConfig.debug) {
    console.log("[Oasis] SDK initialized for app:", client.getAppSlug());
  }

  // Create the instance
  const instance: OasisInstance = {
    feedback,
    crashes,
    breadcrumbs,

    setUser(user: UserInfo | null): void {
      crashes.setUser(user);
    },

    getConfig(): Readonly<OasisConfig> {
      return Object.freeze({ ...fullConfig });
    },

    async flush(): Promise<void> {
      await queue.processQueue();
    },

    destroy(): void {
      crashes.disableAutoCrashReporting();
      cleanupFns.forEach((fn) => fn());
      queue.clear();

      if (fullConfig.debug) {
        console.log("[Oasis] SDK destroyed");
      }
    },
  };

  return instance;
}

// Default export
export default initOasis;
