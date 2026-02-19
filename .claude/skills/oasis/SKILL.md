---
name: oasis
description: Integrate Oasis feedback collection, crash/error reporting, and breadcrumb tracking into Tauri applications. Use when a user wants to add user feedback, bug reporting, crash analytics, or error tracking to their app using the Oasis platform.
argument-hint: "[setup|feedback|crashes|breadcrumbs]"
---

# Oasis — Feedback & Error Collection for Tauri Apps

Oasis is a self-hosted update server for Tauri applications with integrated feedback and crash analytics. This skill covers integrating the `@oasis/sdk` into a Tauri app to enable user feedback collection, automatic crash reporting, and execution breadcrumbs.

## Prerequisites

The user needs a running Oasis server and an SDK key (`pk_*` format) obtained from the Oasis admin dashboard under their app's "SDK Keys" page.

## 1. Installation

Install the SDK in the Tauri app's frontend:

```bash
npm install @oasis/sdk
```

## 2. SDK Initialization

Create an Oasis SDK instance early in the app lifecycle. The SDK must be initialized with a public API key, the Oasis server URL, and the current app version.

```typescript
import { initOasis } from "@oasis/sdk";

const oasis = initOasis({
  // Required
  apiKey: "pk_my-app_a1b2c3d4e5f6g7h8", // SDK key from Oasis dashboard
  serverUrl: "https://updates.myapp.com", // Oasis server URL
  appVersion: "1.2.3",                    // Current app version (semver)

  // Optional
  enableAutoCrashReporting: true, // Auto-capture uncaught errors (default: false)
  maxBreadcrumbs: 50,             // Max breadcrumbs to retain (default: 50)
  timeout: 10000,                 // API request timeout in ms (default: 10000)
  debug: false,                   // Enable debug logging (default: false)

  // Hooks (optional)
  beforeSend: (event) => {
    // Return null to drop the event, or modify and return it
    return event;
  },
  onError: (error, event) => {
    // Called when an event fails to send
  },
});
```

The `apiKey` must start with `pk_` and follow the format `pk_<app-slug>_<random>`. The app slug is extracted automatically from the key.

### Environment Variables

The API key and server URL should be loaded from environment variables, never hardcoded. The variable naming and access pattern depends on the frontend framework:

**Vite (Tauri default, SvelteKit, etc.):**

```bash
# .env
VITE_OASIS_API_KEY=pk_my-app_a1b2c3d4e5f6g7h8
VITE_OASIS_SERVER_URL=https://updates.myapp.com
```

```typescript
const oasis = initOasis({
  apiKey: import.meta.env.VITE_OASIS_API_KEY,
  serverUrl: import.meta.env.VITE_OASIS_SERVER_URL,
  appVersion: "1.0.0",
  enableAutoCrashReporting: true,
});
```

**Next.js:**

```bash
# .env.local
NEXT_PUBLIC_OASIS_API_KEY=pk_my-app_a1b2c3d4e5f6g7h8
NEXT_PUBLIC_OASIS_SERVER_URL=https://updates.myapp.com
```

```typescript
const oasis = initOasis({
  apiKey: process.env.NEXT_PUBLIC_OASIS_API_KEY!,
  serverUrl: process.env.NEXT_PUBLIC_OASIS_SERVER_URL!,
  appVersion: "1.0.0",
  enableAutoCrashReporting: true,
});
```

**Create React App:**

```bash
# .env
REACT_APP_OASIS_API_KEY=pk_my-app_a1b2c3d4e5f6g7h8
REACT_APP_OASIS_SERVER_URL=https://updates.myapp.com
```

```typescript
const oasis = initOasis({
  apiKey: process.env.REACT_APP_OASIS_API_KEY!,
  serverUrl: process.env.REACT_APP_OASIS_SERVER_URL!,
  appVersion: "1.0.0",
  enableAutoCrashReporting: true,
});
```

**Nuxt 3:**

```bash
# .env
NUXT_PUBLIC_OASIS_API_KEY=pk_my-app_a1b2c3d4e5f6g7h8
NUXT_PUBLIC_OASIS_SERVER_URL=https://updates.myapp.com
```

```typescript
const config = useRuntimeConfig();
const oasis = initOasis({
  apiKey: config.public.oasisApiKey,
  serverUrl: config.public.oasisServerUrl,
  appVersion: "1.0.0",
  enableAutoCrashReporting: true,
});
```

**Plain TypeScript / No framework (direct env):**

```bash
# .env
OASIS_API_KEY=pk_my-app_a1b2c3d4e5f6g7h8
OASIS_SERVER_URL=https://updates.myapp.com
```

```typescript
const oasis = initOasis({
  apiKey: process.env.OASIS_API_KEY!,
  serverUrl: process.env.OASIS_SERVER_URL!,
  appVersion: "1.0.0",
  enableAutoCrashReporting: true,
});
```

When creating the initialization file, detect the user's framework from their project config (`vite.config.*`, `next.config.*`, `nuxt.config.*`, `package.json` scripts) and use the matching env variable convention. Always add the env variables to `.env.example` (or the relevant env file) and remind the user to set the actual values.

### Tauri Integration Pattern

In a typical Tauri app, create a shared SDK instance and initialize it early in the app lifecycle:

```typescript
// src/lib/oasis.ts — shared instance
import { initOasis } from "@oasis/sdk";

export const oasis = initOasis({
  apiKey: import.meta.env.VITE_OASIS_API_KEY,  // Use framework-appropriate env access
  serverUrl: import.meta.env.VITE_OASIS_SERVER_URL,
  appVersion: __APP_VERSION__, // Injected at build time via vite define
  enableAutoCrashReporting: true,
});
```

Call `oasis.destroy()` on app unmount to clean up event listeners.

## 3. Feedback Collection

The SDK supports three feedback categories: `"bug"`, `"feature"`, and `"general"`.

### Convenience Methods

```typescript
// Bug report
await oasis.feedback.reportBug("The save button doesn't work", "user@email.com");

// Feature request
await oasis.feedback.requestFeature("Add dark mode support", "user@email.com");

// General feedback
await oasis.feedback.sendFeedback("Great app!", "user@email.com");
```

The second parameter (email) is optional in all methods.

### Full Control

```typescript
await oasis.feedback.submit({
  category: "bug",           // "bug" | "feature" | "general"
  message: "Description",   // Required, max 10000 chars
  email: "user@email.com",  // Optional
  metadata: {                // Optional, arbitrary key-value pairs
    screen: "settings",
    action: "save",
  },
});
```

### Server Endpoint

Feedback is sent to `POST /sdk/:app_slug/feedback` with the `X-API-Key` header. The request body schema:

```
{
  category: "bug" | "feature" | "general"   (required)
  message: string                            (required, 1-10000 chars)
  email?: string                             (valid email)
  appVersion: string                         (semver, e.g. "1.2.3")
  platform: string                           (e.g. "darwin-aarch64")
  osVersion?: string
  deviceInfo?: { model?, manufacturer?, cpuCores?, memoryTotal?, memoryFree? }
  attachments?: Array<{ data: string, filename: string, mimeType: string }> (max 5)
}
```

Response: `201 { success: true, data: { id: string } }`

## 4. Crash / Error Reporting

### Automatic Crash Capture

When `enableAutoCrashReporting: true` is set (or called at runtime), the SDK hooks into:
- `window.addEventListener("error", ...)` — uncaught errors (severity: `"fatal"`)
- `window.addEventListener("unhandledrejection", ...)` — unhandled promise rejections (severity: `"error"`)

```typescript
// Enable/disable at runtime
oasis.crashes.enableAutoCrashReporting();
oasis.crashes.disableAutoCrashReporting();
```

### Manual Exception Capture

```typescript
try {
  riskyOperation();
} catch (error) {
  await oasis.crashes.captureException(error, {
    appState: { currentScreen: "checkout" }, // Optional execution context
    severity: "error",                        // "warning" | "error" | "fatal"
    tags: { component: "payment" },           // Optional tags
  });
}
```

`captureException` accepts any thrown value (`Error`, `string`, object, or `unknown`) and normalizes it to an `Error`.

### Manual Crash Report

```typescript
await oasis.crashes.report({
  error: new Error("Something went wrong"),
  appState: { userId: "user-123" },
  severity: "fatal",
  tags: { subsystem: "database" },
});
```

### User Attribution

```typescript
// Set user for crash attribution
oasis.setUser({ id: "user-123", email: "user@email.com", username: "johndoe" });

// Clear user
oasis.setUser(null);
```

### Server Endpoint

Crashes are sent to `POST /sdk/:app_slug/crashes` with the `X-API-Key` header. The request body schema:

```
{
  errorType: string               (required, e.g. "TypeError")
  errorMessage: string            (required, max 5000 chars)
  stackTrace: StackFrame[]        (required, min 1 frame)
  appVersion: string              (semver)
  platform: string
  osVersion?: string
  deviceInfo?: object
  appState?: Record<string, unknown>
  breadcrumbs?: Breadcrumb[]      (max 100)
  severity?: "warning" | "error" | "fatal"  (default: "error")
  userId?: string                 (max 100 chars)
}

StackFrame: { file?, line?, column?, function?, isNative? }
Breadcrumb: { type: string, message: string, timestamp: string, data?: object }
```

Response: `201 { success: true, data: { id: string, groupId: string } }`

The server groups crashes by fingerprint (SHA-256 hash of normalized stack frames).

## 5. Breadcrumbs

Breadcrumbs track user actions leading up to a crash. They are automatically attached to crash reports.

### Auto-Collected Breadcrumbs

When the SDK initializes, it automatically tracks:
- **Navigation**: `history.pushState`, `replaceState`, `popstate` events
- **Clicks**: All click events with element description (tag, aria-label, text content)
- **Console**: `console.log`, `console.warn`, `console.error` messages
- **Fetch**: All `fetch()` requests with method, URL, and status code

### Manual Breadcrumbs

```typescript
oasis.breadcrumbs.addNavigation("/home", "/settings");
oasis.breadcrumbs.addClick("Save Button", { formId: "settings" });
oasis.breadcrumbs.addHttp("POST", "/api/save", 200);
oasis.breadcrumbs.addConsole("error", "Failed to parse config");
oasis.breadcrumbs.addUserAction("Changed notification settings", { enabled: true });
oasis.breadcrumbs.addCustom("payment", "Payment initiated", { amount: 29.99 });

// Generic add
oasis.breadcrumbs.add({
  type: "custom-type",
  message: "Something happened",
  data: { key: "value" },
});
```

## 6. Offline Support

Events that fail to send are automatically queued in `localStorage` and retried when connectivity is restored:
- Max queue size: 100 events
- Max retry attempts: 3 per event
- Queue is persisted across app restarts

```typescript
// Manually flush the queue
await oasis.flush();
```

## 7. Cleanup

Always destroy the SDK when the app unmounts:

```typescript
oasis.destroy();
```

This removes all global event listeners (error handlers, click tracking, console patches, fetch patches, History API patches) and clears the event queue.

## 8. Complete Integration Example

```typescript
// src/lib/oasis.ts
// Use the env variable convention matching your framework:
//   Vite:            import.meta.env.VITE_OASIS_API_KEY
//   Next.js:         process.env.NEXT_PUBLIC_OASIS_API_KEY
//   Create React App: process.env.REACT_APP_OASIS_API_KEY
//   Nuxt 3:          useRuntimeConfig().public.oasisApiKey
import { initOasis } from "@oasis/sdk";

export const oasis = initOasis({
  apiKey: import.meta.env.VITE_OASIS_API_KEY,       // Example: Vite
  serverUrl: import.meta.env.VITE_OASIS_SERVER_URL,
  appVersion: "1.0.0",
  enableAutoCrashReporting: true,
  beforeSend: (event) => {
    // Strip PII from metadata if present
    if (event.type === "feedback" && event.metadata) {
      delete event.metadata.privateData;
    }
    return event;
  },
});

// src/components/FeedbackDialog.tsx (React example)
import { oasis } from "../lib/oasis";

function FeedbackDialog() {
  const handleSubmit = async (category, message, email) => {
    await oasis.feedback.submit({ category, message, email });
  };
  // ... render form
}

// src/App.tsx
import { useEffect } from "react";
import { oasis } from "./lib/oasis";

function App() {
  useEffect(() => {
    oasis.setUser({ id: currentUser.id });
    return () => oasis.destroy();
  }, []);
  // ...
}

// Anywhere in the app — manual error capture
async function saveDocument(doc) {
  oasis.breadcrumbs.addUserAction("Save document", { docId: doc.id });
  try {
    await api.save(doc);
  } catch (error) {
    await oasis.crashes.captureException(error, {
      appState: { documentId: doc.id, documentSize: doc.content.length },
      severity: "error",
    });
    throw error;
  }
}
```
