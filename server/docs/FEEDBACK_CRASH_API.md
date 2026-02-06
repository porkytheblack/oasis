# Feedback & Crash Analytics API

This document describes the API endpoints for the feedback collection and crash analytics features.

## Authentication

### SDK Endpoints (`/sdk/*`)
SDK endpoints use public API keys with the `pk_` prefix:
```
X-API-Key: pk_my-app_a1b2c3d4e5f6g7h8
```

### Admin Endpoints (`/admin/*`)
Admin endpoints use standard admin API keys:
```
Authorization: Bearer uk_live_xxx
```

---

## SDK Endpoints

These endpoints are used by the `@oasis/sdk` package to submit data from applications.

### Submit Feedback

```
POST /sdk/:app_slug/feedback
```

Submit user feedback from an application.

**Headers:**
```
X-API-Key: pk_my-app_...
Content-Type: application/json
```

**Request Body:**
```json
{
  "category": "bug",
  "message": "The save button does not work when clicked",
  "email": "user@example.com",
  "appVersion": "1.2.3",
  "platform": "darwin-aarch64",
  "osVersion": "macOS 14.0",
  "deviceInfo": {
    "screenWidth": 1920,
    "screenHeight": 1080,
    "pixelRatio": 2,
    "userAgent": "...",
    "locale": "en-US",
    "timezone": "America/New_York",
    "cpuCores": 8,
    "memoryTotal": 17179869184
  },
  "metadata": {
    "screen": "settings",
    "action": "save"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `category` | string | Yes | `"bug"`, `"feature"`, or `"general"` |
| `message` | string | Yes | Feedback message (max 10,000 chars) |
| `email` | string | No | User's contact email |
| `appVersion` | string | Yes | App version (semver) |
| `platform` | string | Yes | Platform identifier |
| `osVersion` | string | No | Operating system version |
| `deviceInfo` | object | No | Device information |
| `metadata` | object | No | Custom metadata |

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "fb_a1b2c3d4"
  }
}
```

### Submit Crash Report

```
POST /sdk/:app_slug/crashes
```

Submit a crash report from an application.

**Headers:**
```
X-API-Key: pk_my-app_...
Content-Type: application/json
```

**Request Body:**
```json
{
  "errorType": "TypeError",
  "errorMessage": "Cannot read property 'map' of undefined",
  "stackTrace": [
    {
      "file": "/src/components/List.tsx",
      "line": 42,
      "column": 15,
      "function": "renderItems",
      "isNative": false
    },
    {
      "file": "/src/App.tsx",
      "line": 28,
      "column": 8,
      "function": "App",
      "isNative": false
    }
  ],
  "appVersion": "1.2.3",
  "platform": "darwin-aarch64",
  "osVersion": "macOS 14.0",
  "severity": "error",
  "breadcrumbs": [
    {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "type": "navigation",
      "message": "Navigated to /settings",
      "data": { "from": "/home", "to": "/settings" }
    },
    {
      "timestamp": "2024-01-15T10:30:05.000Z",
      "type": "click",
      "message": "Clicked Save Button"
    }
  ],
  "deviceInfo": {
    "screenWidth": 1920,
    "screenHeight": 1080,
    "userAgent": "..."
  },
  "appState": {
    "currentScreen": "settings",
    "userId": "user-123"
  },
  "userId": "user-123"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `errorType` | string | Yes | Error type (e.g., "TypeError") |
| `errorMessage` | string | Yes | Error message |
| `stackTrace` | array | Yes | Stack trace frames |
| `appVersion` | string | Yes | App version (semver) |
| `platform` | string | Yes | Platform identifier |
| `osVersion` | string | No | Operating system version |
| `severity` | string | No | `"warning"`, `"error"`, or `"fatal"` (default: `"error"`) |
| `breadcrumbs` | array | No | Event breadcrumbs |
| `deviceInfo` | object | No | Device information |
| `appState` | object | No | Application state at crash |
| `userId` | string | No | User identifier for attribution |

**Stack Frame Object:**
| Field | Type | Description |
|-------|------|-------------|
| `file` | string | Source file path |
| `line` | number | Line number |
| `column` | number | Column number |
| `function` | string | Function name |
| `isNative` | boolean | Is native code |

**Breadcrumb Object:**
| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | string | ISO 8601 timestamp |
| `type` | string | `"navigation"`, `"click"`, `"http"`, `"console"`, `"user"`, `"custom"` |
| `message` | string | Breadcrumb message |
| `data` | object | Additional data |

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "cr_a1b2c3d4",
    "groupId": "cg_x1y2z3w4"
  }
}
```

---

## Admin Endpoints

### SDK Keys (Public API Keys)

#### List SDK Keys

```
GET /admin/apps/:appId/public-keys
```

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "key_a1b2c3",
        "name": "Production",
        "keyPrefix": "pk_my-app_a1b2",
        "createdAt": "2024-01-15T10:00:00.000Z",
        "lastUsedAt": "2024-01-16T15:30:00.000Z",
        "revokedAt": null
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

#### Create SDK Key

```
POST /admin/apps/:appId/public-keys
```

**Request Body:**
```json
{
  "name": "Production"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "key_a1b2c3",
    "name": "Production",
    "key": "pk_my-app_a1b2c3d4e5f6g7h8i9j0",
    "keyPrefix": "pk_my-app_a1b2",
    "createdAt": "2024-01-15T10:00:00.000Z"
  }
}
```

> **Note:** The full `key` value is only returned once at creation time. Store it securely.

#### Revoke SDK Key

```
DELETE /admin/apps/:appId/public-keys/:keyId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "key_a1b2c3",
    "name": "Production",
    "keyPrefix": "pk_my-app_a1b2",
    "revokedAt": "2024-01-16T10:00:00.000Z"
  }
}
```

---

### Feedback

#### List Feedback

```
GET /admin/apps/:appId/feedback
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |
| `status` | string | Filter by status: `"open"`, `"in_progress"`, `"closed"` |
| `category` | string | Filter by category: `"bug"`, `"feature"`, `"general"` |
| `version` | string | Filter by app version |
| `search` | string | Search in message text |

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "fb_a1b2c3d4",
        "category": "bug",
        "message": "The save button does not work",
        "email": "user@example.com",
        "appVersion": "1.2.3",
        "platform": "darwin-aarch64",
        "status": "open",
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 42,
      "totalPages": 3
    }
  }
}
```

#### Get Feedback Details

```
GET /admin/apps/:appId/feedback/:feedbackId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "fb_a1b2c3d4",
    "category": "bug",
    "message": "The save button does not work",
    "email": "user@example.com",
    "appVersion": "1.2.3",
    "platform": "darwin-aarch64",
    "osVersion": "macOS 14.0",
    "deviceInfo": {
      "screenWidth": 1920,
      "screenHeight": 1080,
      "pixelRatio": 2,
      "locale": "en-US"
    },
    "status": "open",
    "internalNotes": null,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

#### Update Feedback

```
PATCH /admin/apps/:appId/feedback/:feedbackId
```

**Request Body:**
```json
{
  "status": "in_progress",
  "internalNotes": "Investigating this issue"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"open"`, `"in_progress"`, or `"closed"` |
| `internalNotes` | string | Internal team notes |

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "fb_a1b2c3d4",
    "status": "in_progress",
    "internalNotes": "Investigating this issue",
    "updatedAt": "2024-01-16T10:00:00.000Z"
  }
}
```

#### Delete Feedback

```
DELETE /admin/apps/:appId/feedback/:feedbackId
```

**Response:**
```json
{
  "success": true,
  "data": { "deleted": true }
}
```

#### Get Feedback Statistics

```
GET /admin/apps/:appId/feedback/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 150,
    "byStatus": {
      "open": 45,
      "in_progress": 20,
      "closed": 85
    },
    "byCategory": {
      "bug": 60,
      "feature": 50,
      "general": 40
    }
  }
}
```

---

### Crash Analytics

#### Get Crash Statistics

```
GET /admin/apps/:appId/crashes/stats
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | string | Time period: `"24h"`, `"7d"`, `"30d"`, `"90d"` (default: `"7d"`) |

**Response:**
```json
{
  "success": true,
  "data": {
    "totalCrashes": 1234,
    "totalGroups": 42,
    "crashFreeRate": 98.5,
    "topCrashGroups": [
      {
        "id": "cg_a1b2c3",
        "errorType": "TypeError",
        "errorMessage": "Cannot read property 'map' of undefined",
        "count": 156
      }
    ]
  }
}
```

#### List Crash Groups

```
GET /admin/apps/:appId/crashes/groups
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |
| `status` | string | Filter by status: `"new"`, `"investigating"`, `"resolved"`, `"ignored"` |
| `sort` | string | Sort by: `"count"`, `"last_seen"`, `"first_seen"` (default: `"last_seen"`) |
| `order` | string | Sort order: `"asc"`, `"desc"` (default: `"desc"`) |

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "cg_a1b2c3",
        "fingerprint": "abc123def456...",
        "errorType": "TypeError",
        "errorMessage": "Cannot read property 'map' of undefined",
        "occurrenceCount": 156,
        "affectedUsersCount": 42,
        "firstSeenAt": "2024-01-10T08:00:00.000Z",
        "lastSeenAt": "2024-01-16T15:30:00.000Z",
        "affectedVersions": ["1.2.0", "1.2.1", "1.2.3"],
        "affectedPlatforms": ["darwin-aarch64", "darwin-x86_64"],
        "status": "investigating"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 42,
      "totalPages": 3
    }
  }
}
```

#### Get Crash Group Details

```
GET /admin/apps/:appId/crashes/groups/:groupId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "cg_a1b2c3",
    "fingerprint": "abc123def456...",
    "errorType": "TypeError",
    "errorMessage": "Cannot read property 'map' of undefined",
    "occurrenceCount": 156,
    "affectedUsersCount": 42,
    "firstSeenAt": "2024-01-10T08:00:00.000Z",
    "lastSeenAt": "2024-01-16T15:30:00.000Z",
    "affectedVersions": ["1.2.0", "1.2.1", "1.2.3"],
    "affectedPlatforms": ["darwin-aarch64", "darwin-x86_64"],
    "status": "investigating",
    "resolutionNotes": "Fixed in commit abc123",
    "resolvedAt": null
  }
}
```

#### Update Crash Group

```
PATCH /admin/apps/:appId/crashes/groups/:groupId
```

**Request Body:**
```json
{
  "status": "resolved",
  "resolutionNotes": "Fixed in commit abc123"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"new"`, `"investigating"`, `"resolved"`, or `"ignored"` |
| `resolutionNotes` | string | Notes about the resolution |

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "cg_a1b2c3",
    "status": "resolved",
    "resolutionNotes": "Fixed in commit abc123",
    "resolvedAt": "2024-01-16T16:00:00.000Z"
  }
}
```

#### List Crash Reports

```
GET /admin/apps/:appId/crashes
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |
| `groupId` | string | Filter by crash group ID |
| `version` | string | Filter by app version |
| `severity` | string | Filter by severity: `"warning"`, `"error"`, `"fatal"` |

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "cr_a1b2c3",
        "crashGroupId": "cg_x1y2z3",
        "errorType": "TypeError",
        "errorMessage": "Cannot read property 'map' of undefined",
        "appVersion": "1.2.3",
        "platform": "darwin-aarch64",
        "severity": "error",
        "createdAt": "2024-01-16T15:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 156,
      "totalPages": 8
    }
  }
}
```

#### Get Crash Report Details

```
GET /admin/apps/:appId/crashes/:crashId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "cr_a1b2c3",
    "crashGroupId": "cg_x1y2z3",
    "errorType": "TypeError",
    "errorMessage": "Cannot read property 'map' of undefined",
    "stackTrace": [
      {
        "file": "/src/components/List.tsx",
        "line": 42,
        "column": 15,
        "function": "renderItems",
        "isNative": false
      }
    ],
    "appVersion": "1.2.3",
    "platform": "darwin-aarch64",
    "osVersion": "macOS 14.0",
    "severity": "error",
    "breadcrumbs": [
      {
        "timestamp": "2024-01-16T15:29:55.000Z",
        "type": "navigation",
        "message": "Navigated to /settings"
      }
    ],
    "deviceInfo": {
      "screenWidth": 1920,
      "screenHeight": 1080
    },
    "appState": {
      "currentScreen": "settings"
    },
    "createdAt": "2024-01-16T15:30:00.000Z"
  }
}
```

#### List Reports for a Crash Group

```
GET /admin/apps/:appId/crashes/groups/:groupId/reports
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |

**Response:** Same as "List Crash Reports" filtered by group.

---

## Crash Fingerprinting Algorithm

Crashes are automatically grouped by a fingerprint computed from:

1. **Error Type** - The error class name (e.g., `TypeError`, `ReferenceError`)
2. **Top 5 Significant Stack Frames** - Filtered to exclude:
   - Native code frames
   - Node.js internal modules
   - Common library frames (node_modules)

The fingerprint is a SHA-256 hash of these components, allowing similar crashes to be grouped together for easier triage.

Example:
```
fingerprint = SHA256("TypeError|renderItems|List.tsx:42|handleClick|Button.tsx:15|...")
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `invalid_api_key` | The SDK key is missing, invalid, or revoked |
| `app_not_found` | The app slug doesn't match the SDK key |
| `validation_error` | Request body validation failed |
| `rate_limited` | Too many requests |
| `internal_error` | Server error |
