/**
 * @oasis/agent - Agent Breadcrumb / Execution Tracker
 *
 * Tracks agent execution steps, tool calls, decisions, and other actions
 * to provide context for error reports and debugging.
 */

import type { AgentBreadcrumb, AgentBreadcrumbType } from "./types.js";

/**
 * Breadcrumb manager for tracking agent execution context.
 *
 * Unlike the browser SDK which auto-tracks DOM events, the agent breadcrumb
 * manager is designed for explicit tracking of agent workflow steps.
 */
export class AgentBreadcrumbManager {
  private breadcrumbs: AgentBreadcrumb[] = [];
  private maxBreadcrumbs: number;

  constructor(maxBreadcrumbs = 100) {
    this.maxBreadcrumbs = maxBreadcrumbs;
  }

  /**
   * Add a breadcrumb to the trail.
   */
  add(breadcrumb: Omit<AgentBreadcrumb, "timestamp">): void {
    const crumb: AgentBreadcrumb = {
      ...breadcrumb,
      timestamp: new Date().toISOString(),
    };

    this.breadcrumbs.push(crumb);

    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.maxBreadcrumbs);
    }
  }

  /**
   * Record a tool call made by the agent.
   *
   * @param toolName - Name of the tool being called
   * @param input - Tool input/parameters (will be truncated for large values)
   */
  addToolCall(toolName: string, input?: Record<string, unknown>): void {
    this.add({
      type: "tool-call",
      message: `Called tool: ${toolName}`,
      data: { toolName, input: input ? truncateData(input) : undefined },
    });
  }

  /**
   * Record a tool result.
   *
   * @param toolName - Name of the tool
   * @param success - Whether the tool call succeeded
   * @param summary - Brief summary of the result
   */
  addToolResult(toolName: string, success: boolean, summary?: string): void {
    this.add({
      type: "tool-result",
      message: `Tool ${toolName}: ${success ? "success" : "failed"}${summary ? ` - ${summary}` : ""}`,
      data: { toolName, success, summary },
    });
  }

  /**
   * Record an agent execution step.
   *
   * @param stepName - Name of the step
   * @param description - Description of what the step does
   * @param data - Additional step data
   */
  addStep(stepName: string, description?: string, data?: Record<string, unknown>): void {
    this.add({
      type: "step",
      message: description ? `${stepName}: ${description}` : stepName,
      data: { stepName, ...data },
    });
  }

  /**
   * Record a decision made by the agent.
   *
   * @param decision - Description of the decision
   * @param reasoning - Why this decision was made
   * @param alternatives - Other options that were considered
   */
  addDecision(decision: string, reasoning?: string, alternatives?: string[]): void {
    this.add({
      type: "decision",
      message: `Decision: ${decision}`,
      data: { reasoning, alternatives },
    });
  }

  /**
   * Record an API call made during agent execution.
   *
   * @param method - HTTP method
   * @param url - Request URL
   * @param statusCode - Response status code
   */
  addApiCall(method: string, url: string, statusCode?: number): void {
    this.add({
      type: "api-call",
      message: `${method} ${url}${statusCode ? ` [${statusCode}]` : ""}`,
      data: { method, url, statusCode },
    });
  }

  /**
   * Record a file operation (read, write, delete).
   *
   * @param operation - The operation type
   * @param filePath - Path to the file
   * @param data - Additional data
   */
  addFileOperation(
    operation: "read" | "write" | "delete" | "create",
    filePath: string,
    data?: Record<string, unknown>,
  ): void {
    this.add({
      type: "file-operation",
      message: `${operation}: ${filePath}`,
      data: { operation, filePath, ...data },
    });
  }

  /**
   * Record a user interaction or prompt.
   *
   * @param action - Description of the interaction
   * @param data - Additional data
   */
  addUserInteraction(action: string, data?: Record<string, unknown>): void {
    this.add({
      type: "user-interaction",
      message: action,
      data,
    });
  }

  /**
   * Record an error breadcrumb (non-fatal, for context).
   *
   * @param message - Error message
   * @param data - Additional error data
   */
  addError(message: string, data?: Record<string, unknown>): void {
    this.add({
      type: "error",
      message,
      data,
    });
  }

  /**
   * Add a custom breadcrumb.
   *
   * @param type - Breadcrumb type
   * @param message - Breadcrumb message
   * @param data - Additional data
   */
  addCustom(type: AgentBreadcrumbType | string, message: string, data?: Record<string, unknown>): void {
    this.add({ type, message, data });
  }

  /**
   * Get all breadcrumbs.
   */
  getAll(): AgentBreadcrumb[] {
    return [...this.breadcrumbs];
  }

  /**
   * Clear all breadcrumbs.
   */
  clear(): void {
    this.breadcrumbs = [];
  }

  /**
   * Get the number of breadcrumbs.
   */
  size(): number {
    return this.breadcrumbs.length;
  }
}

/**
 * Truncate data values to prevent excessively large breadcrumbs.
 */
function truncateData(
  data: Record<string, unknown>,
  maxStringLength = 500,
): Record<string, unknown> {
  const truncated: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && value.length > maxStringLength) {
      truncated[key] = value.slice(0, maxStringLength) + "...(truncated)";
    } else if (typeof value === "object" && value !== null) {
      const serialized = JSON.stringify(value);
      if (serialized.length > maxStringLength) {
        truncated[key] = serialized.slice(0, maxStringLength) + "...(truncated)";
      } else {
        truncated[key] = value;
      }
    } else {
      truncated[key] = value;
    }
  }

  return truncated;
}
