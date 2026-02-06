# RFC: Feedback and Crash Analytics System for Oasis

## Status
**Draft** | Version 1.0 | Date: 2025-02-05

## Summary

This RFC proposes adding a comprehensive feedback collection and crash analytics system to Oasis, enabling developers to collect user feedback and crash reports from their Tauri applications. The system includes a new public API key mechanism for SDK authentication, server-side endpoints for data collection, and dashboard UI for viewing and managing the collected data.

## Problem Statement

Currently, Oasis provides excellent update distribution capabilities for Tauri applications. However, developers lack visibility into:

1. **User Feedback**: No mechanism to collect bug reports, feature requests, or general feedback from users within the app
2. **Crash Analytics**: No visibility into application crashes, error rates, or stability metrics
3. **Version-Specific Issues**: No way to correlate issues with specific app versions

This forces developers to use separate third-party services or remain blind to application issues.

## Goals

- Enable feedback collection from Tauri apps with minimal SDK integration
- Provide crash analytics with automatic grouping and deduplication
- Create a public API key system for secure SDK authentication
- Build dashboard interfaces for viewing feedback and crash data
- Maintain Oasis's self-hosted, privacy-respecting philosophy

## Non-Goals

- Real-time crash monitoring/alerting (future enhancement)
- Session replay or user behavior tracking
- APM-level performance monitoring

## Proposed Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Tauri Application                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    @oasis/sdk (TypeScript)                        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │   │
│  │  │   Feedback   │  │    Crash     │  │    Offline Queue     │   │   │
│  │  │  Submission  │  │   Reporter   │  │    + Retry Logic     │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS (pk_* auth)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Oasis Server                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    SDK Routes (/sdk/*)                            │   │
│  │  POST /sdk/:app_slug/feedback                                     │   │
│  │  POST /sdk/:app_slug/crashes                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Services Layer                               │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │   │
│  │  │   Feedback   │  │    Crash     │  │    Public Key        │   │   │
│  │  │   Service    │  │   Service    │  │    Service           │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    PostgreSQL Database                            │   │
│  │  feedback | crash_reports | crash_groups | public_api_keys       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Admin API (uk_live_* auth)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Dashboard (Next.js)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │   Feedback   │  │    Crash     │  │    Public API Key            │  │
│  │     List     │  │  Analytics   │  │     Management               │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1. Public API Key System

#### Key Format
```
pk_{app_slug}_{16_random_hex_chars}
Example: pk_my-app_a1b2c3d4e5f6g7h8
```

#### Characteristics
- Prefix: `pk_` (public key) to distinguish from `uk_live_` (admin/ci keys)
- Contains app slug for quick identification
- Random suffix for security
- Scoped to a single app (cannot access other apps)
- Limited permissions: only submit feedback/crashes

#### Database Schema
```sql
CREATE TABLE public_api_keys (
  id TEXT PRIMARY KEY,                    -- ULID
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                     -- e.g., "Production SDK Key"
  key_hash TEXT NOT NULL,                 -- SHA-256 hash
  key_prefix TEXT NOT NULL,               -- First 16 chars for display
  last_used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP
);

CREATE INDEX public_api_keys_app_id_idx ON public_api_keys(app_id);
CREATE INDEX public_api_keys_key_hash_idx ON public_api_keys(key_hash);
```

### 2. Feedback System

#### Database Schema
```sql
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,                    -- ULID
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  public_key_id TEXT REFERENCES public_api_keys(id) ON DELETE SET NULL,

  -- Content
  category TEXT NOT NULL,                 -- 'bug' | 'feature' | 'general'
  message TEXT NOT NULL,
  email TEXT,                             -- Optional contact email

  -- Context
  app_version TEXT NOT NULL,
  platform TEXT NOT NULL,                 -- darwin-aarch64, windows-x86_64, etc.
  os_version TEXT,                        -- e.g., "macOS 14.2", "Windows 11"
  device_info JSONB,                      -- Additional device metadata

  -- Attachments (stored as R2 keys)
  attachments JSONB DEFAULT '[]',         -- Array of {r2Key, filename, mimeType, size}

  -- Management
  status TEXT NOT NULL DEFAULT 'open',    -- 'open' | 'in_progress' | 'closed'
  internal_notes TEXT,                    -- Developer notes (not visible to user)

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX feedback_app_id_idx ON feedback(app_id);
CREATE INDEX feedback_status_idx ON feedback(status);
CREATE INDEX feedback_category_idx ON feedback(category);
CREATE INDEX feedback_app_version_idx ON feedback(app_version);
CREATE INDEX feedback_created_at_idx ON feedback(created_at);
CREATE INDEX feedback_app_status_idx ON feedback(app_id, status);
```

### 3. Crash Analytics System

#### Crash Grouping Algorithm

Crashes are grouped by a "fingerprint" computed from the stack trace:

```typescript
function computeCrashFingerprint(crash: CrashReport): string {
  // Extract key frames from stack trace
  const significantFrames = extractSignificantFrames(crash.stackTrace);

  // Create fingerprint from:
  // 1. Error type/name
  // 2. Top N (5) significant stack frames (file:line or function names)
  const fingerprintParts = [
    crash.errorType || 'UnknownError',
    ...significantFrames.slice(0, 5).map(frame =>
      frame.function || `${frame.file}:${frame.line}`
    )
  ];

  // SHA-256 hash of the fingerprint
  return sha256(fingerprintParts.join('|'));
}

function extractSignificantFrames(stackTrace: StackFrame[]): StackFrame[] {
  return stackTrace.filter(frame => {
    // Exclude frames from:
    // - Node.js internals
    // - Tauri runtime
    // - Third-party libraries (configurable)
    return !frame.file?.includes('node_modules') &&
           !frame.file?.includes('tauri:') &&
           !frame.isNative;
  });
}
```

**Time Complexity**: O(n) where n is the number of stack frames
**Space Complexity**: O(k) where k is the number of significant frames (typically k << n)

#### Database Schema

```sql
-- Individual crash reports
CREATE TABLE crash_reports (
  id TEXT PRIMARY KEY,                    -- ULID
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  crash_group_id TEXT REFERENCES crash_groups(id) ON DELETE SET NULL,
  public_key_id TEXT REFERENCES public_api_keys(id) ON DELETE SET NULL,

  -- Error details
  error_type TEXT NOT NULL,               -- e.g., "TypeError", "RangeError"
  error_message TEXT NOT NULL,
  stack_trace JSONB NOT NULL,             -- Array of stack frames

  -- Context
  app_version TEXT NOT NULL,
  platform TEXT NOT NULL,
  os_version TEXT,
  device_info JSONB,                      -- RAM, CPU, etc.
  app_state JSONB,                        -- Custom state at crash time
  breadcrumbs JSONB DEFAULT '[]',         -- Recent actions before crash

  -- Metadata
  fingerprint TEXT NOT NULL,              -- Computed crash signature
  severity TEXT DEFAULT 'error',          -- 'warning' | 'error' | 'fatal'
  user_id TEXT,                           -- Optional user identifier

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX crash_reports_app_id_idx ON crash_reports(app_id);
CREATE INDEX crash_reports_group_id_idx ON crash_reports(crash_group_id);
CREATE INDEX crash_reports_fingerprint_idx ON crash_reports(fingerprint);
CREATE INDEX crash_reports_app_version_idx ON crash_reports(app_version);
CREATE INDEX crash_reports_created_at_idx ON crash_reports(created_at);
CREATE INDEX crash_reports_app_created_idx ON crash_reports(app_id, created_at);

-- Grouped/deduplicated crashes
CREATE TABLE crash_groups (
  id TEXT PRIMARY KEY,                    -- ULID
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,

  -- Identification
  fingerprint TEXT NOT NULL UNIQUE,       -- Unique crash signature

  -- Representative error info
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,            -- Message from first occurrence

  -- Statistics
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  affected_users_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMP NOT NULL,
  last_seen_at TIMESTAMP NOT NULL,

  -- Affected versions (for quick filtering)
  affected_versions JSONB DEFAULT '[]',   -- Array of version strings
  affected_platforms JSONB DEFAULT '[]',  -- Array of platform strings

  -- Management
  status TEXT NOT NULL DEFAULT 'new',     -- 'new' | 'investigating' | 'resolved' | 'ignored'
  assigned_to TEXT,                       -- Optional assignee
  resolution_notes TEXT,
  resolved_at TIMESTAMP,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX crash_groups_app_id_idx ON crash_groups(app_id);
CREATE INDEX crash_groups_fingerprint_idx ON crash_groups(fingerprint);
CREATE INDEX crash_groups_status_idx ON crash_groups(status);
CREATE INDEX crash_groups_last_seen_idx ON crash_groups(last_seen_at);
CREATE INDEX crash_groups_count_idx ON crash_groups(occurrence_count);
CREATE INDEX crash_groups_app_status_idx ON crash_groups(app_id, status);
```

### 4. API Endpoints

#### SDK Routes (Public Key Auth)

```
POST /sdk/:app_slug/feedback
  Headers: X-API-Key: pk_my-app_a1b2c3d4e5f6g7h8
  Body: {
    category: "bug" | "feature" | "general",
    message: string,
    email?: string,
    appVersion: string,
    platform: string,
    osVersion?: string,
    deviceInfo?: object,
    attachments?: Array<{data: base64, filename: string, mimeType: string}>
  }
  Response: { success: true, data: { id: string } }

POST /sdk/:app_slug/crashes
  Headers: X-API-Key: pk_my-app_a1b2c3d4e5f6g7h8
  Body: {
    errorType: string,
    errorMessage: string,
    stackTrace: Array<{
      file?: string,
      line?: number,
      column?: number,
      function?: string,
      isNative?: boolean
    }>,
    appVersion: string,
    platform: string,
    osVersion?: string,
    deviceInfo?: object,
    appState?: object,
    breadcrumbs?: Array<{type: string, message: string, timestamp: string}>,
    severity?: "warning" | "error" | "fatal",
    userId?: string
  }
  Response: { success: true, data: { id: string, groupId: string } }
```

#### Admin Routes

```
# Public API Keys
GET    /admin/apps/:app_id/public-keys
POST   /admin/apps/:app_id/public-keys
DELETE /admin/apps/:app_id/public-keys/:key_id

# Feedback
GET    /admin/apps/:app_id/feedback?page=1&limit=20&status=open&category=bug&version=1.0.0
GET    /admin/apps/:app_id/feedback/:id
PATCH  /admin/apps/:app_id/feedback/:id
DELETE /admin/apps/:app_id/feedback/:id

# Crash Analytics
GET    /admin/apps/:app_id/crashes?page=1&limit=20
GET    /admin/apps/:app_id/crashes/groups?status=new&sort=count
GET    /admin/apps/:app_id/crashes/groups/:id
PATCH  /admin/apps/:app_id/crashes/groups/:id
GET    /admin/apps/:app_id/crashes/:id
GET    /admin/apps/:app_id/crashes/stats?period=7d
```

### 5. TypeScript SDK

#### Package Structure
```
sdk/
├── src/
│   ├── index.ts           # Main exports
│   ├── client.ts          # API client with retry logic
│   ├── feedback.ts        # Feedback submission
│   ├── crashes.ts         # Crash reporting
│   ├── breadcrumbs.ts     # Breadcrumb collection
│   ├── queue.ts           # Offline queue with persistence
│   ├── device.ts          # Device info collection
│   └── types.ts           # TypeScript definitions
├── package.json
├── tsconfig.json
└── README.md
```

#### API Design
```typescript
// Initialize the SDK
import { initOasis } from '@oasis/sdk';

const oasis = initOasis({
  apiKey: 'pk_my-app_a1b2c3d4e5f6g7h8',
  serverUrl: 'https://updates.myapp.com',
  appVersion: '1.2.3',
  // Optional configuration
  enableAutoCrashReporting: true,
  maxBreadcrumbs: 50,
  beforeSend: (event) => {
    // Modify or filter events before sending
    return event;
  }
});

// Submit feedback
await oasis.feedback.submit({
  category: 'bug',
  message: 'The save button does not work',
  email: 'user@example.com' // optional
});

// Report a crash manually
await oasis.crashes.report({
  error: new Error('Something went wrong'),
  appState: { currentScreen: 'settings' }
});

// Capture exceptions in try/catch
try {
  riskyOperation();
} catch (error) {
  oasis.crashes.captureException(error, {
    tags: { operation: 'riskyOperation' }
  });
}

// Add breadcrumbs for context
oasis.breadcrumbs.add({
  type: 'navigation',
  message: 'User navigated to Settings',
  data: { from: '/home', to: '/settings' }
});

// Identify user (optional, for tracking affected users)
oasis.setUser({ id: 'user-123' });
```

### 6. Rate Limiting

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| SDK (per key) | 100 requests | 1 minute |
| SDK (per IP) | 200 requests | 1 minute |
| Admin feedback | 100 requests | 1 minute |
| Admin crashes | 100 requests | 1 minute |

### 7. Data Retention Policy

| Data Type | Default Retention | Configurable |
|-----------|------------------|--------------|
| Feedback | 1 year | Yes |
| Crash Reports | 90 days | Yes |
| Crash Groups | Indefinite | N/A |
| Attachments | 30 days | Yes |

Retention can be configured via environment variables:
```
OASIS_FEEDBACK_RETENTION_DAYS=365
OASIS_CRASH_RETENTION_DAYS=90
OASIS_ATTACHMENT_RETENTION_DAYS=30
```

### 8. Security Considerations

1. **Public Key Exposure**: Public keys are designed to be embedded in client apps and are not secret. Security is provided by:
   - Rate limiting per key and per IP
   - Keys scoped to single app (cannot access other apps' data)
   - Keys can only write feedback/crashes, not read
   - Easy revocation if abuse is detected

2. **Data Privacy**:
   - No PII collected by default
   - Email collection is opt-in
   - Device info collection is configurable
   - User ID is optional and opaque
   - IP addresses are not stored

3. **Attachment Security**:
   - Attachments stored in R2 with non-guessable keys
   - File type validation
   - Maximum file size limits (5MB per attachment, 20MB total)
   - Automatic deletion after retention period

## Migration Path

1. **Database Migration**: New tables are additive, no changes to existing tables
2. **Server Update**: New routes are added, existing routes unchanged
3. **Dashboard Update**: New pages added, existing functionality unchanged
4. **SDK Release**: Independent npm package, optional adoption

## Testing Strategy

1. **Unit Tests**: Service layer logic, fingerprint computation
2. **Integration Tests**: API endpoint behavior, database operations
3. **E2E Tests**: SDK to server round-trip
4. **Load Tests**: Rate limiting, concurrent crash submissions

## Rollout Plan

1. **Phase 1**: Database schema + Public key management
2. **Phase 2**: Feedback submission + Dashboard UI
3. **Phase 3**: Crash reporting + Analytics dashboard
4. **Phase 4**: SDK package release

## Future Enhancements

- Real-time crash alerting (webhooks, Slack, Discord)
- Source map support for JavaScript stack traces
- Session replay integration
- Custom event tracking
- Performance monitoring (ANR detection)
- Crash trends and regressions detection

## References

- [Sentry SDK Design](https://develop.sentry.dev/sdk/unified-api/)
- [Tauri Error Handling](https://tauri.app/v1/guides/debugging/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
