/**
 * @oasis/sdk - API Client
 *
 * Handles HTTP communication with the Oasis server.
 */

import type {
  OasisConfig,
  FeedbackEvent,
  CrashEvent,
  ApiResponse,
  FeedbackSubmitResponse,
  CrashReportResponse,
} from "./types.js";

const DEFAULT_TIMEOUT = 10000;

/**
 * API client for communicating with the Oasis server.
 */
export class OasisClient {
  private config: OasisConfig;
  private appSlug: string;

  constructor(config: OasisConfig) {
    this.config = config;
    this.appSlug = this.extractAppSlug(config.apiKey);
  }

  /**
   * Extract the app slug from the API key.
   *
   * @param apiKey - The public API key (format: pk_app-slug_randomchars)
   * @returns The app slug
   */
  private extractAppSlug(apiKey: string): string {
    // Format: pk_app-slug_randomchars
    const parts = apiKey.split("_");
    if (parts.length < 3 || parts[0] !== "pk") {
      throw new Error("Invalid API key format. Expected: pk_app-slug_randomchars");
    }

    // The slug is everything between pk_ and the last _randomchars
    // Handle slugs that may contain underscores
    const lastUnderscoreIndex = apiKey.lastIndexOf("_");
    const slugStart = 3; // After "pk_"
    const slug = apiKey.slice(slugStart, lastUnderscoreIndex);

    return slug;
  }

  /**
   * Send a feedback event to the server.
   *
   * @param event - The feedback event
   * @returns The server response
   */
  async sendFeedback(event: FeedbackEvent): Promise<FeedbackSubmitResponse> {
    const url = `${this.config.serverUrl}/sdk/${this.appSlug}/feedback`;

    const body = {
      category: event.category,
      message: event.message,
      email: event.email,
      appVersion: event.appVersion,
      platform: event.platform,
      osVersion: event.osVersion,
      deviceInfo: event.deviceInfo,
    };

    const response = await this.request<FeedbackSubmitResponse>(url, body);
    return response;
  }

  /**
   * Send a crash report to the server.
   *
   * @param event - The crash event
   * @returns The server response
   */
  async sendCrash(event: CrashEvent): Promise<CrashReportResponse> {
    const url = `${this.config.serverUrl}/sdk/${this.appSlug}/crashes`;

    const body = {
      errorType: event.errorType,
      errorMessage: event.errorMessage,
      stackTrace: event.stackTrace,
      appVersion: event.appVersion,
      platform: event.platform,
      osVersion: event.osVersion,
      deviceInfo: event.deviceInfo,
      appState: event.appState,
      breadcrumbs: event.breadcrumbs,
      severity: event.severity,
      userId: event.userId,
    };

    const response = await this.request<CrashReportResponse>(url, body);
    return response;
  }

  /**
   * Make an HTTP request to the Oasis server.
   *
   * @param url - Request URL
   * @param body - Request body
   * @returns Parsed response data
   */
  private async request<T>(url: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.config.timeout ?? DEFAULT_TIMEOUT);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.config.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const data = await response.json() as ApiResponse<T>;

      if (!data.success) {
        throw new OasisApiError(
          data.error.message,
          data.error.code,
          response.status
        );
      }

      return data.data;
    } catch (error) {
      if (error instanceof OasisApiError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new OasisApiError("Request timeout", "TIMEOUT", 0);
        }
        throw new OasisApiError(error.message, "NETWORK_ERROR", 0);
      }

      throw new OasisApiError("Unknown error", "UNKNOWN_ERROR", 0);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Get the app slug.
   */
  getAppSlug(): string {
    return this.appSlug;
  }
}

/**
 * Error class for Oasis API errors.
 */
export class OasisApiError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = "OasisApiError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
