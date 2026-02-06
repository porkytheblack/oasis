/**
 * @oasis/sdk - Feedback Submission
 *
 * Handles user feedback collection and submission.
 */

import type {
  OasisConfig,
  FeedbackEvent,
  FeedbackOptions,
} from "./types.js";
import { OasisClient } from "./client.js";
import { EventQueue } from "./queue.js";
import { detectPlatform, detectOsVersion, collectDeviceInfo } from "./device.js";

/**
 * Feedback manager for submitting user feedback.
 */
export class FeedbackManager {
  private config: OasisConfig;
  private client: OasisClient;
  private queue: EventQueue;

  constructor(config: OasisConfig, client: OasisClient, queue: EventQueue) {
    this.config = config;
    this.client = client;
    this.queue = queue;
  }

  /**
   * Submit user feedback to Oasis.
   *
   * @param options - Feedback options
   *
   * @example
   * ```typescript
   * await oasis.feedback.submit({
   *   category: "bug",
   *   message: "The save button doesn't work",
   *   email: "user@example.com"
   * });
   * ```
   */
  async submit(options: FeedbackOptions): Promise<void> {
    const event = this.createFeedbackEvent(options);
    await this.sendOrQueue(event);
  }

  /**
   * Submit a bug report.
   *
   * @param message - Bug description
   * @param email - Optional contact email
   */
  async reportBug(message: string, email?: string): Promise<void> {
    await this.submit({ category: "bug", message, email });
  }

  /**
   * Submit a feature request.
   *
   * @param message - Feature description
   * @param email - Optional contact email
   */
  async requestFeature(message: string, email?: string): Promise<void> {
    await this.submit({ category: "feature", message, email });
  }

  /**
   * Submit general feedback.
   *
   * @param message - Feedback message
   * @param email - Optional contact email
   */
  async sendFeedback(message: string, email?: string): Promise<void> {
    await this.submit({ category: "general", message, email });
  }

  /**
   * Create a feedback event from options.
   */
  private createFeedbackEvent(options: FeedbackOptions): FeedbackEvent {
    const deviceInfo = collectDeviceInfo();
    const platform = detectPlatform();
    const osVersion = detectOsVersion();

    return {
      type: "feedback",
      category: options.category,
      message: options.message,
      email: options.email,
      appVersion: this.config.appVersion,
      platform,
      osVersion,
      deviceInfo,
      metadata: options.metadata,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Send event or queue it for later if offline/failed.
   */
  private async sendOrQueue(event: FeedbackEvent): Promise<void> {
    // Apply beforeSend hook
    if (this.config.beforeSend) {
      const modified = this.config.beforeSend(event);
      if (!modified) {
        // Event was filtered out
        if (this.config.debug) {
          console.log("[Oasis] Feedback event filtered by beforeSend");
        }
        return;
      }
      Object.assign(event, modified);
    }

    try {
      await this.client.sendFeedback(event);
      if (this.config.debug) {
        console.log("[Oasis] Feedback sent successfully");
      }
    } catch (error) {
      if (this.config.debug) {
        console.error("[Oasis] Failed to send feedback, queueing:", error);
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
