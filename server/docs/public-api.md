# Public API Endpoints

These endpoints are public and require no authentication.

## Base URL

All examples assume the API is hosted at:

```
https://updates.example.com
```

Replace with your actual Oasis server URL.

## Update Check (Tauri)

### `GET /:app_slug/update/:target/:current_version`

Checks if an update is available for the given app, platform target, and current version.

**Examples**

```
GET /my-app/update/darwin-aarch64/1.0.0
```

**Response**

- `200 OK` with a raw Tauri update payload when an update is available.
- `204 No Content` when no update is available.
- `404 Not Found` if the app does not exist.
- `400 Bad Request` if parameters are invalid.

**Example 200 response**

```json
{
  "version": "1.1.0",
  "notes": "Bug fixes and improvements",
  "pub_date": "2024-01-15T10:30:00.000Z",
  "url": "https://cdn.example.com/my-app/releases/1.1.0/app.tar.gz",
  "signature": "base64..."
}
```

### `GET /:app_slug/update/:target/:arch/:current_version`

Alternate update check that separates target and arch. Some Tauri clients use this form.

**Example**

```
GET /my-app/update/darwin/aarch64/1.0.0
```

Response semantics are the same as the standard update endpoint.

## Latest Release Details (Landing Pages)

### `GET /:app_slug/releases/latest`

Returns the latest published release details for landing pages.

**Response**

- `200 OK` with latest release metadata and installers list.
- `404 Not Found` if the app does not exist or has no published releases.

**Example 200 response**

```json
{
  "success": true,
  "data": {
    "version": "1.2.0",
    "pubDate": "2024-01-15T10:00:00.000Z",
    "installers": [
      {
        "platform": "darwin-aarch64",
        "filename": "MyApp_1.2.0_darwin-aarch64.dmg",
        "displayName": "macOS (Apple Silicon)",
        "downloadUrl": "https://cdn.example.com/my-app/installers/1.2.0/MyApp_1.2.0_darwin-aarch64.dmg",
        "fileSize": 52428800
      }
    ]
  }
}
```

## Installer Downloads (Latest Release)

### `GET /:app_slug/download/:platform`

Downloads the installer for the latest published release. By default this **redirects** to the artifact URL.

**Query params**

- `format=json` returns JSON instead of a redirect.

**Example**

```
GET /my-app/download/darwin-aarch64
```

**JSON example**

```
GET /my-app/download/darwin-aarch64?format=json
```

```json
{
  "success": true,
  "data": {
    "id": "01HQWX...",
    "platform": "darwin-aarch64",
    "filename": "MyApp_1.2.0_darwin-aarch64.dmg",
    "displayName": "macOS (Apple Silicon)",
    "downloadUrl": "https://cdn.example.com/...",
    "fileSize": 52428800,
    "version": "1.2.0",
    "releaseNotes": "### What's New...",
    "publishedAt": "2024-01-15T10:00:00.000Z"
  }
}
```

**Response codes**

- `302 Found` redirect (default behavior)
- `200 OK` JSON when `format=json`
- `404 Not Found` if the app, release, or installer is missing

**Platform fallbacks**

- `darwin-aarch64` can fall back to `darwin-universal`
- `darwin-x86_64` can fall back to `darwin-universal`
- `windows-aarch64` can fall back to `windows-x86_64` or `windows-x86`

## Installer Downloads (Specific Version)

### `GET /:app_slug/download/:platform/:version`

Downloads the installer for a specific published version. By default this **redirects** to the artifact URL.

**Query params**

- `format=json` returns JSON instead of a redirect.

**Example**

```
GET /my-app/download/darwin-aarch64/1.2.0
```

**Response codes**

- `302 Found` redirect (default behavior)
- `200 OK` JSON when `format=json`
- `404 Not Found` if the app, version, or installer is missing

**Platform fallbacks**

Same as the latest installer endpoint.
