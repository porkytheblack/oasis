# @oasis/sdk

TypeScript SDK for Oasis - Feedback and Crash Analytics for Tauri applications.

## Installation

```bash
npm install @oasis/sdk
# or
yarn add @oasis/sdk
# or
pnpm add @oasis/sdk
```

## Quick Start

```typescript
import { initOasis } from '@oasis/sdk';

// Initialize the SDK
const oasis = initOasis({
  apiKey: 'pk_my-app_a1b2c3d4e5f6g7h8',
  serverUrl: 'https://updates.myapp.com',
  appVersion: '1.2.3',
  enableAutoCrashReporting: true,
});

// Submit feedback
await oasis.feedback.submit({
  category: 'bug',
  message: 'The save button does not work',
  email: 'user@example.com', // optional
});

// Report a crash
try {
  riskyOperation();
} catch (error) {
  oasis.crashes.captureException(error);
}
```

## Configuration

```typescript
const oasis = initOasis({
  // Required
  apiKey: 'pk_my-app_...',      // Your public API key from Oasis dashboard
  serverUrl: 'https://...',      // Your Oasis server URL
  appVersion: '1.2.3',           // Current app version (semver)

  // Optional
  enableAutoCrashReporting: true,  // Auto-capture uncaught errors (default: false)
  maxBreadcrumbs: 50,              // Max breadcrumbs to keep (default: 50)
  timeout: 10000,                  // Request timeout in ms (default: 10000)
  debug: false,                    // Enable debug logging (default: false)

  // Hooks
  beforeSend: (event) => {
    // Modify or filter events before sending
    // Return null to drop the event
    return event;
  },
  onError: (error, event) => {
    // Called when an event fails to send
    console.error('Failed to send event:', error);
  },
});
```

## Feedback

### Submit Feedback

```typescript
await oasis.feedback.submit({
  category: 'bug',        // 'bug' | 'feature' | 'general'
  message: 'Description of the issue',
  email: 'user@example.com',  // Optional contact email
  metadata: {                  // Optional metadata
    screen: 'settings',
    action: 'save',
  },
});
```

### Convenience Methods

```typescript
// Report a bug
await oasis.feedback.reportBug('The save button does not work');

// Request a feature
await oasis.feedback.requestFeature('Add dark mode support');

// Send general feedback
await oasis.feedback.sendFeedback('Great app!');
```

## Crash Reporting

### Capture Exceptions

```typescript
try {
  riskyOperation();
} catch (error) {
  await oasis.crashes.captureException(error, {
    appState: { currentScreen: 'checkout' },
    severity: 'error',  // 'warning' | 'error' | 'fatal'
  });
}
```

### Report Crashes Manually

```typescript
await oasis.crashes.report({
  error: new Error('Something went wrong'),
  appState: { userId: 'user-123' },
  severity: 'fatal',
});
```

### Automatic Crash Reporting

```typescript
// Enable auto-capture of uncaught errors
const oasis = initOasis({
  // ...
  enableAutoCrashReporting: true,
});

// Or enable/disable at runtime
oasis.crashes.enableAutoCrashReporting();
oasis.crashes.disableAutoCrashReporting();
```

## Breadcrumbs

Breadcrumbs provide context for crash reports by tracking user actions leading up to an error.

```typescript
// Add custom breadcrumbs
oasis.breadcrumbs.add({
  type: 'navigation',
  message: 'User navigated to Settings',
  data: { from: '/home', to: '/settings' },
});

// Convenience methods
oasis.breadcrumbs.addNavigation('/home', '/settings');
oasis.breadcrumbs.addClick('Save Button');
oasis.breadcrumbs.addHttp('POST', '/api/save', 200);
oasis.breadcrumbs.addUserAction('Changed notification settings');
```

Automatic breadcrumbs are collected for:
- Navigation (History API changes)
- Clicks
- Console messages (log, warn, error)
- Fetch requests

## User Tracking

Track affected users without storing PII:

```typescript
// Set user (optional)
oasis.setUser({
  id: 'user-123',
  email: 'user@example.com',  // Optional
  username: 'johndoe',        // Optional
});

// Clear user
oasis.setUser(null);
```

## Offline Support

Events are automatically queued when offline and sent when connectivity is restored.

```typescript
// Manually flush the queue
await oasis.flush();

// The queue is persisted to localStorage
```

## Cleanup

```typescript
// Destroy the SDK instance
oasis.destroy();
```

## API Reference

### `initOasis(config: OasisConfig): OasisInstance`

Initialize the SDK with the given configuration.

### `OasisInstance`

- `feedback` - Feedback submission interface
- `crashes` - Crash reporting interface
- `breadcrumbs` - Breadcrumb management
- `setUser(user: UserInfo | null)` - Set current user
- `getConfig()` - Get current configuration
- `flush()` - Manually flush event queue
- `destroy()` - Clean up resources

### `FeedbackManager`

- `submit(options: FeedbackOptions)` - Submit feedback
- `reportBug(message, email?)` - Submit bug report
- `requestFeature(message, email?)` - Submit feature request
- `sendFeedback(message, email?)` - Submit general feedback

### `CrashReporter`

- `report(options: CrashReportOptions)` - Report a crash
- `captureException(error, options?)` - Capture an exception
- `setUser(user: UserInfo | null)` - Set user for attribution
- `enableAutoCrashReporting()` - Enable auto-capture
- `disableAutoCrashReporting()` - Disable auto-capture

### `BreadcrumbManager`

- `add(breadcrumb)` - Add a breadcrumb
- `addNavigation(from, to)` - Add navigation breadcrumb
- `addClick(target, data?)` - Add click breadcrumb
- `addHttp(method, url, statusCode?)` - Add HTTP breadcrumb
- `addConsole(level, message)` - Add console breadcrumb
- `addUserAction(action, data?)` - Add user action breadcrumb
- `addCustom(type, message, data?)` - Add custom breadcrumb
- `getAll()` - Get all breadcrumbs
- `clear()` - Clear all breadcrumbs

## License

MIT
