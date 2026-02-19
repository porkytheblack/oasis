/**
 * @oasis/agent - API Client
 *
 * Node.js-native HTTP client for communicating with the Oasis server.
 * No browser dependencies - uses global fetch (Node 18+).
 */

import type {
  OasisAgentConfig,
  AgentFeedbackEvent,
  AgentErrorEvent,
  ApiResponse,
  FeedbackSubmitResponse,
  ErrorReportResponse,
} from "./types.js";

const DEFAULT_TIMEOUT = 10000;

/**
 * API client for agent communication with the Oasis server.
 */
export class AgentClient {
  private config: OasisAgentConfig;
  private appSlug: string;

  constructor(config: OasisAgentConfig) {
    this.config = config;
    this.appSlug = this.extractAppSlug(config.apiKey);
  }

  /**
   * Extract the app slug from the API key.
   * Format: pk_app-slug_randomchars
   */
  private extractAppSlug(apiKey: string): string {
    const parts = apiKey.split("_");
    if (parts.length < 3 || parts[0] !== "pk") {
      throw new Error("Invalid API key format. Expected: pk_app-slug_randomchars");
    }

    const lastUnderscoreIndex = apiKey.lastIndexOf("_");
    const slugStart = 3; // After "pk_"
    return apiKey.slice(slugStart, lastUnderscoreIndex);
  }

  /**
   * Send a feedback event to the server.
   */
  async sendFeedback(event: AgentFeedbackEvent): Promise<FeedbackSubmitResponse> {
    const url = `${this.config.serverUrl}/sdk/${this.appSlug}/feedback`;

    const body = {
      category: event.category,
      message: event.message,
      email: event.email,
      appVersion: event.appVersion,
      platform: event.platform,
      osVersion: event.osVersion,
      deviceInfo: event.deviceInfo,
      metadata: event.metadata,
    };

    return this.request<FeedbackSubmitResponse>(url, body);
  }

  /**
   * Send an error report to the server.
   */
  async sendError(event: AgentErrorEvent): Promise<ErrorReportResponse> {
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

    return this.request<ErrorReportResponse>(url, body);
  }

  /**
   * Make an HTTP request to the Oasis server.
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
          "X-Agent-Name": this.config.agentName,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const data = (await response.json()) as ApiResponse<T>;

      if (!data.success) {
        throw new OasisAgentApiError(
          data.error.message,
          data.error.code,
          response.status,
        );
      }

      return data.data;
    } catch (error) {
      if (error instanceof OasisAgentApiError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new OasisAgentApiError("Request timeout", "TIMEOUT", 0);
        }
        throw new OasisAgentApiError(error.message, "NETWORK_ERROR", 0);
      }

      throw new OasisAgentApiError("Unknown error", "UNKNOWN_ERROR", 0);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Get the extracted app slug.
   */
  getAppSlug(): string {
    return this.appSlug;
  }
}

/**
 * Error class for Oasis Agent API errors.
 */
export class OasisAgentApiError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = "OasisAgentApiError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
