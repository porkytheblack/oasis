/**
 * @oasis/sdk - Type Definitions
 */

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * SDK initialization options
 */
export interface OasisConfig {
  /** Public API key (format: pk_app-slug_randomchars) */
  apiKey: string;

  /** Oasis server URL (e.g., "https://updates.myapp.com") */
  serverUrl: string;

  /** Current app version (semver, e.g., "1.2.3") */
  appVersion: string;

  /** Enable automatic crash reporting for uncaught errors */
  enableAutoCrashReporting?: boolean;

  /** Maximum number of breadcrumbs to keep (default: 50) */
  maxBreadcrumbs?: number;

  /** Hook to modify or filter events before sending */
  beforeSend?: (event: FeedbackEvent | CrashEvent) => FeedbackEvent | CrashEvent | null;

  /** Called when an event fails to send */
  onError?: (error: Error, event: FeedbackEvent | CrashEvent) => void;

  /** Timeout for API requests in milliseconds (default: 10000) */
  timeout?: number;

  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// Feedback Types
// ============================================================================

/** Feedback category types */
export type FeedbackCategory = "bug" | "feature" | "general";

/**
 * Options for submitting feedback
 */
export interface FeedbackOptions {
  /** Feedback category */
  category: FeedbackCategory;

  /** Feedback message */
  message: string;

  /** Optional user email for follow-up */
  email?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Internal feedback event structure
 */
export interface FeedbackEvent {
  type: "feedback";
  category: FeedbackCategory;
  message: string;
  email?: string;
  appVersion: string;
  platform: string;
  osVersion?: string;
  deviceInfo?: DeviceInfo;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

// ============================================================================
// Crash Report Types
// ============================================================================

/** Crash severity levels */
export type CrashSeverity = "warning" | "error" | "fatal";

/**
 * Stack frame information
 */
export interface StackFrame {
  file?: string;
  line?: number;
  column?: number;
  function?: string;
  isNative?: boolean;
}

/**
 * Breadcrumb for crash context
 */
export interface Breadcrumb {
  /** Type of breadcrumb (navigation, click, xhr, console, etc.) */
  type: string;

  /** Human-readable message */
  message: string;

  /** ISO timestamp */
  timestamp: string;

  /** Additional data */
  data?: Record<string, unknown>;
}

/**
 * Options for reporting a crash
 */
export interface CrashReportOptions {
  /** The error that occurred */
  error: Error;

  /** App state at the time of crash */
  appState?: Record<string, unknown>;

  /** Severity level (default: "error") */
  severity?: CrashSeverity;

  /** Additional tags */
  tags?: Record<string, string>;
}

/**
 * Options for capturing an exception
 */
export interface CaptureExceptionOptions {
  /** App state at the time of crash */
  appState?: Record<string, unknown>;

  /** Severity level (default: "error") */
  severity?: CrashSeverity;

  /** Additional tags */
  tags?: Record<string, string>;
}

/**
 * Internal crash event structure
 */
export interface CrashEvent {
  type: "crash";
  errorType: string;
  errorMessage: string;
  stackTrace: StackFrame[];
  appVersion: string;
  platform: string;
  osVersion?: string;
  deviceInfo?: DeviceInfo;
  appState?: Record<string, unknown>;
  breadcrumbs: Breadcrumb[];
  severity: CrashSeverity;
  userId?: string;
  timestamp: string;
}

// ============================================================================
// Device Info Types
// ============================================================================

/**
 * Device information collected automatically
 */
export interface DeviceInfo {
  /** Device model (if available) */
  model?: string;

  /** Device manufacturer (if available) */
  manufacturer?: string;

  /** Number of CPU cores */
  cpuCores?: number;

  /** Total memory in bytes */
  memoryTotal?: number;

  /** Free memory in bytes */
  memoryFree?: number;

  /** Screen width */
  screenWidth?: number;

  /** Screen height */
  screenHeight?: number;

  /** Device pixel ratio */
  pixelRatio?: number;

  /** Browser or runtime info */
  userAgent?: string;

  /** Locale (e.g., "en-US") */
  locale?: string;

  /** Timezone */
  timezone?: string;
}

// ============================================================================
// User Types
// ============================================================================

/**
 * User identification (optional)
 */
export interface UserInfo {
  /** Unique user identifier */
  id: string;

  /** User email (optional) */
  email?: string;

  /** Username (optional) */
  username?: string;

  /** Additional user data */
  [key: string]: unknown;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * API success response
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * API error response
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
 * Combined API response type
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Feedback submission response
 */
export interface FeedbackSubmitResponse {
  id: string;
}

/**
 * Crash report submission response
 */
export interface CrashReportResponse {
  id: string;
  groupId: string;
}

// ============================================================================
// Queue Types
// ============================================================================

/**
 * Queued event for offline storage
 */
export interface QueuedEvent {
  id: string;
  event: FeedbackEvent | CrashEvent;
  attempts: number;
  createdAt: string;
  lastAttemptAt?: string;
}
