/**
 * @oasis/agent - Agent Feedback Submission
 *
 * Handles feedback collection and submission from agent workflows.
 */

import type {
  OasisAgentConfig,
  AgentFeedbackEvent,
  AgentFeedbackOptions,
  AgentContext,
} from "./types.js";
import { AgentClient } from "./client.js";
import { detectPlatform, detectOsVersion, collectAgentDeviceInfo } from "./context.js";

/**
 * Feedback manager for agent workflows.
 */
export class AgentFeedbackManager {
  private config: OasisAgentConfig;
  private client: AgentClient;
  private context: AgentContext;

  constructor(config: OasisAgentConfig, client: AgentClient, context: AgentContext) {
    this.config = config;
    this.client = client;
    this.context = context;
  }

  /**
   * Submit feedback from the agent workflow.
   *
   * @param options - Feedback options
   *
   * @example
   * ```typescript
   * await agent.feedback.submit({
   *   category: "agent-issue",
   *   message: "Model produced inconsistent output for edge case",
   *   metadata: { input: "...", output: "..." },
   * });
   * ```
   */
  async submit(options: AgentFeedbackOptions): Promise<void> {
    const event = this.createFeedbackEvent(options);
    await this.sendEvent(event);
  }

  /**
   * Report a bug encountered during agent execution.
   *
   * @param message - Bug description
   * @param metadata - Additional context
   */
  async reportBug(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.submit({ category: "bug", message, metadata });
  }

  /**
   * Report a workflow issue (e.g., unexpected behavior, degraded performance).
   *
   * @param message - Issue description
   * @param metadata - Additional context
   */
  async reportWorkflowIssue(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.submit({ category: "workflow-issue", message, metadata });
  }

  /**
   * Report an agent-specific issue (e.g., model hallucination, tool failure).
   *
   * @param message - Issue description
   * @param metadata - Additional context
   */
  async reportAgentIssue(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.submit({ category: "agent-issue", message, metadata });
  }

  /**
   * Submit a feature request from agent analysis.
   *
   * @param message - Feature description
   * @param metadata - Additional context
   */
  async requestFeature(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.submit({ category: "feature", message, metadata });
  }

  /**
   * Submit general feedback from the agent.
   *
   * @param message - Feedback message
   * @param metadata - Additional context
   */
  async sendFeedback(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.submit({ category: "general", message, metadata });
  }

  /**
   * Create a feedback event from options.
   */
  private createFeedbackEvent(options: AgentFeedbackOptions): AgentFeedbackEvent {
    const deviceInfo = collectAgentDeviceInfo(this.config);
    const platform = detectPlatform();
    const osVersion = detectOsVersion();

    const agentMetadata: Record<string, unknown> = {
      agentName: this.context.agentName,
      agentModel: this.context.agentModel,
      runtime: this.context.runtime,
      runtimeVersion: this.context.runtimeVersion,
      taskName: options.taskName ?? this.context.taskName,
      sessionId: this.context.sessionId,
      parentAgent: this.context.parentAgent,
      ...options.metadata,
    };

    return {
      type: "feedback",
      category: options.category,
      message: options.message,
      email: options.email,
      appVersion: this.config.appVersion,
      platform,
      osVersion,
      deviceInfo,
      metadata: agentMetadata,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Send the event, applying hooks.
   */
  private async sendEvent(event: AgentFeedbackEvent): Promise<void> {
    if (this.config.beforeSend) {
      const modified = this.config.beforeSend(event);
      if (!modified) {
        if (this.config.debug) {
          console.log("[OasisAgent] Feedback event filtered by beforeSend");
        }
        return;
      }
      Object.assign(event, modified);
    }

    try {
      await this.client.sendFeedback(event);
      if (this.config.debug) {
        console.log("[OasisAgent] Feedback sent successfully");
      }
    } catch (error) {
      if (this.config.debug) {
        console.error("[OasisAgent] Failed to send feedback:", error);
      }
      if (this.config.onError && error instanceof Error) {
        this.config.onError(error, event);
      }
    }
  }
}
