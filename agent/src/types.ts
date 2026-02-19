/**
 * @oasis/agent - Type Definitions
 *
 * Types for the Oasis agent skill, designed for AI agent workflows.
 */

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the Oasis agent skill.
 */
export interface OasisAgentConfig {
  /** Public API key (format: pk_app-slug_randomchars) */
  apiKey: string;

  /** Oasis server URL (e.g., "https://updates.myapp.com") */
  serverUrl: string;

  /** Version of the agent or application (semver, e.g., "1.0.0") */
  appVersion: string;

  /** Name of the agent (e.g., "code-review-agent", "deploy-agent") */
  agentName: string;

  /** Agent framework or model identifier (e.g., "claude-3", "gpt-4", "langchain") */
  agentModel?: string;

  /** Timeout for API requests in milliseconds (default: 10000) */
  timeout?: number;

  /** Maximum number of breadcrumbs to keep (default: 100) */
  maxBreadcrumbs?: number;

  /** Hook to modify or filter events before sending */
  beforeSend?: (event: AgentFeedbackEvent | AgentErrorEvent) => AgentFeedbackEvent | AgentErrorEvent | null;

  /** Called when an event fails to send */
  onError?: (error: Error, event: AgentFeedbackEvent | AgentErrorEvent) => void;

  /** Enable debug logging (default: false) */
  debug?: boolean;
}

// ============================================================================
// Agent Context Types
// ============================================================================

/**
 * Contextual information about the agent's execution environment.
 */
export interface AgentContext {
  /** Name of the agent */
  agentName: string;

  /** Agent model/framework */
  agentModel?: string;

  /** Current task or workflow the agent is executing */
  taskName?: string;

  /** Unique identifier for the current execution/session */
  sessionId?: string;

  /** Parent agent name if this is a sub-agent */
  parentAgent?: string;

  /** Runtime environment (e.g., "node", "deno", "bun") */
  runtime: string;

  /** Runtime version */
  runtimeVersion: string;

  /** Operating system platform */
  platform: string;

  /** OS architecture */
  arch: string;

  /** Additional context metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Feedback Types
// ============================================================================

/** Feedback category types */
export type AgentFeedbackCategory = "bug" | "feature" | "general" | "agent-issue" | "workflow-issue";

/**
 * Options for submitting agent feedback.
 */
export interface AgentFeedbackOptions {
  /** Feedback category */
  category: AgentFeedbackCategory;

  /** Feedback message */
  message: string;

  /** Optional contact email for follow-up */
  email?: string;

  /** Name of the task or workflow that prompted this feedback */
  taskName?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Internal feedback event structure for agents.
 */
export interface AgentFeedbackEvent {
  type: "feedback";
  category: AgentFeedbackCategory;
  message: string;
  email?: string;
  appVersion: string;
  platform: string;
  osVersion?: string;
  deviceInfo?: AgentDeviceInfo;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

// ============================================================================
// Error Report Types
// ============================================================================

/** Error severity levels */
export type AgentErrorSeverity = "warning" | "error" | "fatal";

/**
 * Options for reporting an agent error.
 */
export interface AgentErrorReportOptions {
  /** The error that occurred */
  error: Error;

  /** Severity level (default: "error") */
  severity?: AgentErrorSeverity;

  /** Execution state at the time of the error */
  executionState?: Record<string, unknown>;

  /** Name of the step/tool that failed */
  stepName?: string;

  /** Additional tags for categorization */
  tags?: Record<string, string>;
}

/**
 * Options for capturing an exception in agent code.
 */
export interface AgentCaptureOptions {
  /** Severity level (default: "error") */
  severity?: AgentErrorSeverity;

  /** Execution state at the time of the error */
  executionState?: Record<string, unknown>;

  /** Name of the step/tool that failed */
  stepName?: string;

  /** Additional tags for categorization */
  tags?: Record<string, string>;
}

/**
 * Internal error event structure for agents.
 */
export interface AgentErrorEvent {
  type: "crash";
  errorType: string;
  errorMessage: string;
  stackTrace: AgentStackFrame[];
  appVersion: string;
  platform: string;
  osVersion?: string;
  deviceInfo?: AgentDeviceInfo;
  appState?: Record<string, unknown>;
  breadcrumbs: AgentBreadcrumb[];
  severity: AgentErrorSeverity;
  userId?: string;
  timestamp: string;
}

/**
 * Stack frame information.
 */
export interface AgentStackFrame {
  file?: string;
  line?: number;
  column?: number;
  function?: string;
  isNative?: boolean;
}

// ============================================================================
// Breadcrumb Types
// ============================================================================

/**
 * Breadcrumb types specific to agent workflows.
 */
export type AgentBreadcrumbType =
  | "tool-call"
  | "tool-result"
  | "step"
  | "decision"
  | "api-call"
  | "file-operation"
  | "user-interaction"
  | "error"
  | "custom";

/**
 * Breadcrumb for tracking agent execution context.
 */
export interface AgentBreadcrumb {
  /** Type of breadcrumb */
  type: string;

  /** Human-readable message */
  message: string;

  /** ISO timestamp */
  timestamp: string;

  /** Additional data */
  data?: Record<string, unknown>;
}

// ============================================================================
// Device Info Types (Agent Runtime Info)
// ============================================================================

/**
 * Agent runtime information (analogous to device info for browser SDK).
 */
export interface AgentDeviceInfo {
  /** Runtime identifier (e.g., "node", "deno") */
  userAgent?: string;

  /** Number of CPU cores */
  cpuCores?: number;

  /** Total memory in bytes */
  memoryTotal?: number;

  /** Free memory in bytes */
  memoryFree?: number;

  /** OS locale */
  locale?: string;

  /** Timezone */
  timezone?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * API success response.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * API error response.
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Combined API response type.
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Feedback submission response.
 */
export interface FeedbackSubmitResponse {
  id: string;
}

/**
 * Error report submission response.
 */
export interface ErrorReportResponse {
  id: string;
  groupId: string;
}
