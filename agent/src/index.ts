/**
 * @oasis/agent - Agent Skill for Oasis
 *
 * A Node.js-native skill that enables AI agents to report feedback, errors,
 * and execution context to an Oasis server. Designed for integration into
 * agent workflows, tool chains, and multi-agent systems.
 *
 * @example
 * ```typescript
 * import { initOasisAgent } from '@oasis/agent';
 *
 * const agent = initOasisAgent({
 *   apiKey: 'pk_my-app_a1b2c3d4e5f6g7h8',
 *   serverUrl: 'https://updates.myapp.com',
 *   appVersion: '1.0.0',
 *   agentName: 'code-review-agent',
 *   agentModel: 'claude-3',
 * });
 *
 * // Track execution steps
 * agent.breadcrumbs.addStep('analyze', 'Analyzing repository structure');
 * agent.breadcrumbs.addToolCall('file-read', { path: 'src/index.ts' });
 *
 * // Report errors
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   await agent.errors.captureException(error, {
 *     stepName: 'code-generation',
 *     severity: 'error',
 *   });
 * }
 *
 * // Submit feedback
 * await agent.feedback.reportAgentIssue('Model produced invalid JSON output', {
 *   input: prompt,
 *   output: response,
 * });
 *
 * // Report tool failures
 * await agent.errors.reportToolFailure('database-query', error, {
 *   query: 'SELECT ...',
 * });
 *
 * // Clean up
 * agent.destroy();
 * ```
 */

import type {
  OasisAgentConfig,
  AgentContext,
  AgentFeedbackEvent,
  AgentErrorEvent,
} from "./types.js";
import { AgentClient } from "./client.js";
import { AgentFeedbackManager } from "./feedback.js";
import { AgentErrorReporter } from "./errors.js";
import { AgentBreadcrumbManager } from "./breadcrumbs.js";
import { buildAgentContext } from "./context.js";

// Re-export all types
export * from "./types.js";
export { OasisAgentApiError } from "./client.js";

/**
 * The main Oasis agent skill instance.
 */
export interface OasisAgentInstance {
  /** Feedback submission interface */
  feedback: AgentFeedbackManager;

  /** Error reporting interface */
  errors: AgentErrorReporter;

  /** Execution breadcrumb tracker */
  breadcrumbs: AgentBreadcrumbManager;

  /**
   * Get the agent execution context.
   */
  getContext(): Readonly<AgentContext>;

  /**
   * Get the current configuration.
   */
  getConfig(): Readonly<OasisAgentConfig>;

  /**
   * Update the agent context (e.g., when starting a new task).
   *
   * @param updates - Context fields to update
   */
  updateContext(updates: Partial<Pick<AgentContext, "taskName" | "sessionId" | "parentAgent" | "metadata">>): void;

  /**
   * Set the user/agent identity for error attribution.
   *
   * @param userId - Unique identifier for the agent or user
   */
  setUserId(userId: string | undefined): void;

  /**
   * Convenience: wrap an async function with automatic error reporting.
   * If the function throws, the error is reported and re-thrown.
   *
   * @param stepName - Name of the step for error context
   * @param fn - The async function to wrap
   * @returns The result of the function
   */
  wrapStep<T>(stepName: string, fn: () => Promise<T>): Promise<T>;

  /**
   * Destroy the agent skill instance and clean up resources.
   */
  destroy(): void;
}

/**
 * Validates the agent skill configuration.
 */
function validateConfig(config: OasisAgentConfig): void {
  if (!config.apiKey) {
    throw new Error("OasisAgent: apiKey is required");
  }

  if (!config.apiKey.startsWith("pk_")) {
    throw new Error("OasisAgent: apiKey must be a public key (starting with pk_)");
  }

  if (!config.serverUrl) {
    throw new Error("OasisAgent: serverUrl is required");
  }

  if (!config.appVersion) {
    throw new Error("OasisAgent: appVersion is required");
  }

  if (!/^\d+\.\d+\.\d+/.test(config.appVersion)) {
    throw new Error("OasisAgent: appVersion must be a valid semver (e.g., 1.0.0)");
  }

  if (!config.agentName) {
    throw new Error("OasisAgent: agentName is required");
  }
}

/**
 * Initialize the Oasis agent skill.
 *
 * @param config - Agent skill configuration
 * @returns Initialized agent skill instance
 *
 * @example
 * ```typescript
 * const agent = initOasisAgent({
 *   apiKey: 'pk_my-app_a1b2c3d4e5f6g7h8',
 *   serverUrl: 'https://updates.myapp.com',
 *   appVersion: '1.0.0',
 *   agentName: 'deploy-agent',
 *   agentModel: 'gpt-4',
 * });
 * ```
 */
export function initOasisAgent(config: OasisAgentConfig): OasisAgentInstance {
  validateConfig(config);

  const fullConfig: OasisAgentConfig = {
    maxBreadcrumbs: 100,
    timeout: 10000,
    debug: false,
    ...config,
  };

  // Build agent context
  const context = buildAgentContext(fullConfig);

  // Create components
  const client = new AgentClient(fullConfig);
  const breadcrumbs = new AgentBreadcrumbManager(fullConfig.maxBreadcrumbs);
  const feedback = new AgentFeedbackManager(fullConfig, client, context);
  const errors = new AgentErrorReporter(fullConfig, client, breadcrumbs, context);

  if (fullConfig.debug) {
    console.log(`[OasisAgent] Initialized agent "${config.agentName}" for app: ${client.getAppSlug()}`);
  }

  const instance: OasisAgentInstance = {
    feedback,
    errors,
    breadcrumbs,

    getContext(): Readonly<AgentContext> {
      return Object.freeze({ ...context });
    },

    getConfig(): Readonly<OasisAgentConfig> {
      return Object.freeze({ ...fullConfig });
    },

    updateContext(updates) {
      if (updates.taskName !== undefined) context.taskName = updates.taskName;
      if (updates.sessionId !== undefined) context.sessionId = updates.sessionId;
      if (updates.parentAgent !== undefined) context.parentAgent = updates.parentAgent;
      if (updates.metadata !== undefined) {
        context.metadata = { ...context.metadata, ...updates.metadata };
      }

      if (fullConfig.debug) {
        console.log("[OasisAgent] Context updated:", updates);
      }
    },

    setUserId(userId: string | undefined) {
      errors.setUserId(userId);
    },

    async wrapStep<T>(stepName: string, fn: () => Promise<T>): Promise<T> {
      breadcrumbs.addStep(stepName, "Starting");
      try {
        const result = await fn();
        breadcrumbs.addStep(stepName, "Completed");
        return result;
      } catch (error) {
        breadcrumbs.addError(`Step "${stepName}" failed: ${error instanceof Error ? error.message : String(error)}`);
        await errors.captureException(error, {
          stepName,
          severity: "error",
        });
        throw error;
      }
    },

    destroy() {
      breadcrumbs.clear();
      if (fullConfig.debug) {
        console.log("[OasisAgent] Agent skill destroyed");
      }
    },
  };

  return instance;
}

// Default export
export default initOasisAgent;
