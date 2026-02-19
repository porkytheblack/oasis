/**
 * @oasis/agent - Agent Error Reporting
 *
 * Handles error capture and reporting from agent workflows.
 */

import type {
  OasisAgentConfig,
  AgentErrorEvent,
  AgentErrorReportOptions,
  AgentCaptureOptions,
  AgentStackFrame,
  AgentContext,
} from "./types.js";
import { AgentClient } from "./client.js";
import { AgentBreadcrumbManager } from "./breadcrumbs.js";
import { detectPlatform, detectOsVersion, collectAgentDeviceInfo } from "./context.js";

/**
 * Parse a stack trace string into structured frames.
 */
function parseStackTrace(stack: string | undefined): AgentStackFrame[] {
  if (!stack) {
    return [];
  }

  const frames: AgentStackFrame[] = [];
  const lines = stack.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

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
 */
function parseStackFrame(line: string): AgentStackFrame | null {
  const content = line.slice(3);

  if (content.includes("[native code]") || content.includes("<native>")) {
    return { isNative: true };
  }

  // functionName (file:line:column)
  const matchWithParen = content.match(/^(.+?)\s*\((.+?):(\d+):(\d+)\)$/);
  if (matchWithParen) {
    return {
      function: matchWithParen[1],
      file: matchWithParen[2],
      line: parseInt(matchWithParen[3], 10),
      column: parseInt(matchWithParen[4], 10),
    };
  }

  // functionName (file:line)
  const matchWithParenNoCol = content.match(/^(.+?)\s*\((.+?):(\d+)\)$/);
  if (matchWithParenNoCol) {
    return {
      function: matchWithParenNoCol[1],
      file: matchWithParenNoCol[2],
      line: parseInt(matchWithParenNoCol[3], 10),
    };
  }

  // file:line:column
  const matchNoFn = content.match(/^(.+?):(\d+):(\d+)$/);
  if (matchNoFn) {
    return {
      file: matchNoFn[1],
      line: parseInt(matchNoFn[2], 10),
      column: parseInt(matchNoFn[3], 10),
    };
  }

  // file:line
  const matchNoFnNoCol = content.match(/^(.+?):(\d+)$/);
  if (matchNoFnNoCol) {
    return {
      file: matchNoFnNoCol[1],
      line: parseInt(matchNoFnNoCol[2], 10),
    };
  }

  if (content && !content.includes(":")) {
    return { function: content };
  }

  return null;
}

/**
 * Error reporter for agent workflows.
 */
export class AgentErrorReporter {
  private config: OasisAgentConfig;
  private client: AgentClient;
  private breadcrumbs: AgentBreadcrumbManager;
  private context: AgentContext;
  private userId: string | undefined;

  constructor(
    config: OasisAgentConfig,
    client: AgentClient,
    breadcrumbs: AgentBreadcrumbManager,
    context: AgentContext,
  ) {
    this.config = config;
    this.client = client;
    this.breadcrumbs = breadcrumbs;
    this.context = context;
  }

  /**
   * Report an error from the agent workflow.
   *
   * @param options - Error report options
   *
   * @example
   * ```typescript
   * try {
   *   await toolCall();
   * } catch (error) {
   *   await agent.errors.report({
   *     error,
   *     stepName: "file-read",
   *     severity: "error",
   *     executionState: { file: "config.json" },
   *   });
   * }
   * ```
   */
  async report(options: AgentErrorReportOptions): Promise<void> {
    const event = this.createErrorEvent(options.error, options);
    await this.sendEvent(event);
  }

  /**
   * Capture any thrown value and report it as an error.
   * Useful for wrapping try/catch blocks in agent code.
   *
   * @param error - The thrown value (Error, string, or unknown)
   * @param options - Additional options
   */
  async captureException(error: unknown, options?: AgentCaptureOptions): Promise<void> {
    const errorObj = this.normalizeError(error);
    const event = this.createErrorEvent(errorObj, options);
    await this.sendEvent(event);
  }

  /**
   * Report a tool execution failure.
   *
   * @param toolName - Name of the tool that failed
   * @param error - The error that occurred
   * @param context - Additional context about the tool call
   */
  async reportToolFailure(
    toolName: string,
    error: unknown,
    context?: Record<string, unknown>,
  ): Promise<void> {
    const errorObj = this.normalizeError(error);
    await this.report({
      error: errorObj,
      stepName: toolName,
      severity: "error",
      executionState: {
        toolName,
        ...context,
      },
      tags: { source: "tool-failure", tool: toolName },
    });
  }

  /**
   * Report a step/task failure in the agent workflow.
   *
   * @param stepName - Name of the step that failed
   * @param error - The error that occurred
   * @param context - Additional context
   */
  async reportStepFailure(
    stepName: string,
    error: unknown,
    context?: Record<string, unknown>,
  ): Promise<void> {
    const errorObj = this.normalizeError(error);
    await this.report({
      error: errorObj,
      stepName,
      severity: "error",
      executionState: {
        stepName,
        ...context,
      },
      tags: { source: "step-failure", step: stepName },
    });
  }

  /**
   * Set the user/agent identity for error attribution.
   */
  setUserId(userId: string | undefined): void {
    this.userId = userId;
  }

  /**
   * Create an error event.
   */
  private createErrorEvent(error: Error, options?: AgentCaptureOptions): AgentErrorEvent {
    const stackTrace = parseStackTrace(error.stack);
    const deviceInfo = collectAgentDeviceInfo(this.config);
    const platform = detectPlatform();
    const osVersion = detectOsVersion();

    const appState: Record<string, unknown> = {
      agentName: this.context.agentName,
      agentModel: this.context.agentModel,
      taskName: this.context.taskName,
      sessionId: this.context.sessionId,
      parentAgent: this.context.parentAgent,
      stepName: options?.stepName,
      tags: options?.tags,
      ...options?.executionState,
    };

    return {
      type: "crash",
      errorType: error.name || "Error",
      errorMessage: error.message || "Unknown error",
      stackTrace,
      appVersion: this.config.appVersion,
      platform,
      osVersion,
      deviceInfo,
      appState,
      breadcrumbs: this.breadcrumbs.getAll(),
      severity: options?.severity ?? "error",
      userId: this.userId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Normalize any thrown value to an Error object.
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
   * Send the event, applying hooks.
   */
  private async sendEvent(event: AgentErrorEvent): Promise<void> {
    if (this.config.beforeSend) {
      const modified = this.config.beforeSend(event);
      if (!modified) {
        if (this.config.debug) {
          console.log("[OasisAgent] Error event filtered by beforeSend");
        }
        return;
      }
      Object.assign(event, modified);
    }

    try {
      await this.client.sendError(event);
      if (this.config.debug) {
        console.log("[OasisAgent] Error report sent successfully");
      }
    } catch (error) {
      if (this.config.debug) {
        console.error("[OasisAgent] Failed to send error report:", error);
      }
      if (this.config.onError && error instanceof Error) {
        this.config.onError(error, event);
      }
    }
  }
}
