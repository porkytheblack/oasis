# Tauri Update Server Architecture

## Overview

A self-hosted, multi-tenant update infrastructure for Tauri desktop applications with yearly license-based distribution. The system supports multiple apps from a single deployment and consists of three main components:

1. **Update Server** (Hono) — API for Tauri updater protocol + admin operations
2. **Storage Layer** (Cloudflare R2) — Binary hosting for update packages
3. **Admin Dashboard** (Next.js) — Web-based command and control for release management
 
---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              RELEASE PIPELINE                                 │
└──────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────┐          ┌─────────────────┐         ┌─────────────────┐
  │  GitHub Actions │          │  Next.js Admin  │         │   Manual Upload │
  │  (automated CI) │          │   (web app)     │         │   (fallback)    │
  └────────┬────────┘          └────────┬────────┘         └────────┬────────┘
           │                            │                           │
           │  POST /apps/:slug/releases │  Full CRUD                │
           │  POST /artifacts           │  operations               │
           │  POST /publish             │                           │
           ▼                            ▼                           ▼
  ┌────────────────────────────────────────────────────────────────────────────┐
  │                            HONO UPDATE SERVER                               │
  │                                                                            │
  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
  │  │  Public API │  │  Admin API  │  │  Auth Layer │  │  R2 Client  │       │
  │  │  (updater)  │  │  (dashboard)│  │  (API keys) │  │  (uploads)  │       │
  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
  │                                                                            │
  └────────────────────────────────────────────┬───────────────────────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
                    ▼                          ▼                          ▼
           ┌─────────────┐            ┌─────────────┐            ┌─────────────┐
           │  Database   │            │ Cloudflare  │            │   Tauri     │
           │  (metadata) │            │     R2      │            │   Clients   │
           └─────────────┘            │  (binaries) │            │  (App A, B) │
                                      └─────────────┘            └─────────────┘


┌──────────────────────────────────────────────────────────────────────────────┐
│                              UPDATE CHECK FLOW                                │
└──────────────────────────────────────────────────────────────────────────────┘

  Tauri App                    Update Server                 Cloudflare R2
      │                              │                              │
      │  GET /:app/update/{target}/{ver}                            │
      │─────────────────────────────▶│                              │
      │                              │                              │
      │                              │  Query latest release        │
      │                              │  for app + target platform   │
      │                              │                              │
      │  { version, sig, url, ... }  │                              │
      │◀─────────────────────────────│                              │
      │                              │                              │
      │  Download binary from R2 URL                                │
      │────────────────────────────────────────────────────────────▶│
      │                              │                              │
      │  Binary file (.tar.gz, .nsis.zip, etc.)                     │
      │◀────────────────────────────────────────────────────────────│
      │                              │                              │
      │  Verify signature locally    │                              │
      │  Install update              │                              │
      │                              │                              │
```

---

## Components

### 1. Update Server (Hono)

**Responsibilities:**
- Serve Tauri-compatible update manifests for multiple apps
- Store release metadata (versions, notes, signatures) per app
- Handle artifact uploads (direct or via presigned URLs)
- Authenticate CI and admin requests
- Manage release lifecycle (draft → published → archived)
- App registration and management

**Recommended Stack:**
- Runtime: Cloudflare Workers (pairs well with R2) or Fly.io
- Framework: Hono
- Database: SQLite (via Turso) or Postgres (Neon, Supabase)
- Storage Client: Cloudflare R2 SDK / AWS S3-compatible client

### 2. Storage Layer (Cloudflare R2)

**Responsibilities:**
- Host update binaries (`.tar.gz`, `.nsis.zip`, `.AppImage.tar.gz`)
- Serve downloads directly to end users (zero egress fees)
- Store signature files (`.sig`) as backup

**Why R2:**
- No egress fees (major cost savings for update distribution)
- S3-compatible API
- Native integration with Cloudflare Workers
- Global CDN built-in

**Bucket Structure (Multi-App):**
```
your-updates-bucket/
├── my-first-app/
│   ├── releases/
│   │   ├── 1.0.0/
│   │   │   ├── app-1.0.0-darwin-aarch64.tar.gz
│   │   │   ├── app-1.0.0-darwin-x86_64.tar.gz
│   │   │   ├── app-1.0.0-linux-x86_64.AppImage.tar.gz
│   │   │   └── app-1.0.0-windows-x86_64.nsis.zip
│   │   └── 1.1.0/
│   │       └── ...
│   └── signatures/
│       └── (optional backup)
├── my-second-app/
│   ├── releases/
│   │   └── ...
│   └── signatures/
└── another-app/
    └── ...
```

### 3. Admin Dashboard (Next.js Web App)

**Responsibilities:**
- Manage multiple apps from a single interface
- Create and edit releases per app
- Write/preview release notes (Markdown)
- Upload binaries manually
- Manage release states (draft, published, archived)
- View download analytics (optional)
- Manage API keys per app or global

**Recommended Stack:**
- Framework: Next.js 14+ (App Router)
- Styling: Tailwind CSS + shadcn/ui
- Auth: NextAuth.js, Clerk, or custom JWT
- Hosting: Vercel, Cloudflare Pages, or self-hosted

**Why Web App:**
- Access from anywhere (phone, laptop, any device)
- No installation required
- Easy to share access with team members
- Can be protected behind auth provider

---

## Data Model

### Tables

```sql
-- Apps table (multi-tenant support)
CREATE TABLE apps (
    id              TEXT PRIMARY KEY,           -- UUID or ULID
    slug            TEXT NOT NULL UNIQUE,       -- URL-safe identifier: "my-app"
    name            TEXT NOT NULL,              -- Display name: "My App"
    description     TEXT,                       -- Optional description
    public_key      TEXT,                       -- Tauri signing public key (for reference)
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- Releases table
CREATE TABLE releases (
    id              TEXT PRIMARY KEY,           -- UUID or ULID
    app_id          TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    version         TEXT NOT NULL,              -- Semver: "1.2.0"
    notes           TEXT,                       -- Markdown release notes
    pub_date        TIMESTAMP,                  -- When published
    status          TEXT DEFAULT 'draft',       -- draft | published | archived
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(app_id, version)                     -- Version unique per app
);

-- Artifacts table (one per platform per release)
CREATE TABLE artifacts (
    id              TEXT PRIMARY KEY,
    release_id      TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
    platform        TEXT NOT NULL,              -- e.g., "darwin-aarch64"
    signature       TEXT NOT NULL,              -- Base64 signature from Tauri
    r2_key          TEXT NOT NULL,              -- Path in R2 bucket
    download_url    TEXT NOT NULL,              -- Full public URL
    file_size       INTEGER,                    -- Bytes (optional, for display)
    checksum        TEXT,                       -- SHA256 (optional)
    created_at      TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(release_id, platform)
);

-- API Keys table (for CI and admin access)
CREATE TABLE api_keys (
    id              TEXT PRIMARY KEY,
    app_id          TEXT REFERENCES apps(id),   -- NULL = global access to all apps
    name            TEXT NOT NULL,              -- "GitHub Actions - My App", "Admin"
    key_hash        TEXT NOT NULL,              -- Hashed API key
    scope           TEXT NOT NULL,              -- "ci" | "admin"
    last_used_at    TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    revoked_at      TIMESTAMP                   -- NULL if active
);

-- Optional: Download analytics
CREATE TABLE download_events (
    id              TEXT PRIMARY KEY,
    artifact_id     TEXT REFERENCES artifacts(id),
    app_id          TEXT NOT NULL REFERENCES apps(id),
    platform        TEXT NOT NULL,
    version         TEXT NOT NULL,
    ip_country      TEXT,                       -- Geo lookup
    downloaded_at   TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_releases_app_status ON releases(app_id, status);
CREATE INDEX idx_releases_app_version ON releases(app_id, version);
CREATE INDEX idx_artifacts_release ON artifacts(release_id);
CREATE INDEX idx_api_keys_app ON api_keys(app_id);
CREATE INDEX idx_downloads_app ON download_events(app_id, downloaded_at);
```

### Platform Identifiers

Tauri uses the following target triple format:

| Platform | Identifier |
|----------|------------|
| macOS (Apple Silicon) | `darwin-aarch64` |
| macOS (Intel) | `darwin-x86_64` |
| Windows (64-bit) | `windows-x86_64` |
| Linux (AppImage) | `linux-x86_64` |

---

## API Specification

### Public Endpoints (Tauri Updater)

#### Check for Updates

```
GET /:app_slug/update/:target/:current_version
```

**Parameters:**
- `app_slug` — App identifier (e.g., `my-app`)
- `target` — Platform identifier (e.g., `darwin-aarch64`)
- `current_version` — Currently installed version (e.g., `1.0.0`)

**Response (update available):** `200 OK`
```json
{
    "version": "1.2.0",
    "notes": "### What's New\n\n- Feature X\n- Bug fix Y",
    "pub_date": "2026-02-01T12:00:00Z",
    "platforms": {
        "darwin-aarch64": {
            "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVR...",
            "url": "https://your-bucket.r2.cloudflarestorage.com/my-app/releases/1.2.0/app-1.2.0-darwin-aarch64.tar.gz"
        }
    }
}
```

**Response (no update):** `204 No Content`

**Logic:**
1. Look up app by `app_slug`
2. Query latest published release where `version > current_version`
3. Check if artifact exists for requested `target`
4. Return manifest or 204

---

### Admin Endpoints (Protected)

All admin endpoints require authentication via `Authorization: Bearer <api_key>` header.

#### App Management

##### List Apps

```
GET /admin/apps
```

**Response:**
```json
{
    "apps": [
        {
            "id": "app_abc123",
            "slug": "my-app",
            "name": "My App",
            "description": "A cool desktop app",
            "release_count": 5,
            "latest_version": "1.2.0",
            "created_at": "2025-01-01T00:00:00Z"
        }
    ]
}
```

##### Create App

```
POST /admin/apps
```

**Request Body:**
```json
{
    "slug": "my-new-app",
    "name": "My New App",
    "description": "Another cool app",
    "public_key": "dW50cnVzdGVkIGNvbW1lbnQ6..."
}
```

##### Update App

```
PATCH /admin/apps/:app_id
```

##### Delete App

```
DELETE /admin/apps/:app_id
```

Only allowed if app has no published releases. Returns `400` otherwise.

---

#### Release Management

##### List Releases

```
GET /admin/apps/:app_id/releases
```

**Query Parameters:**
- `status` — Filter by status: `draft`, `published`, `archived`, `all`
- `limit` — Number of results (default: 20)
- `offset` — Pagination offset

**Response:**
```json
{
    "releases": [
        {
            "id": "rel_abc123",
            "version": "1.2.0",
            "status": "published",
            "notes": "### What's New...",
            "pub_date": "2026-02-01T12:00:00Z",
            "artifacts": [
                { "platform": "darwin-aarch64", "file_size": 45678901 },
                { "platform": "windows-x86_64", "file_size": 52345678 }
            ],
            "created_at": "2026-01-30T10:00:00Z"
        }
    ],
    "total": 15
}
```

##### Create Release

```
POST /admin/apps/:app_id/releases
```

**Request Body:**
```json
{
    "version": "1.2.0",
    "notes": "### What's New\n\n- Feature X\n- Bug fix Y"
}
```

**Response:** `201 Created`
```json
{
    "id": "rel_abc123",
    "app_id": "app_xyz",
    "version": "1.2.0",
    "status": "draft",
    "notes": "...",
    "created_at": "2026-02-01T10:00:00Z"
}
```

##### Update Release

```
PATCH /admin/apps/:app_id/releases/:release_id
```

**Request Body:**
```json
{
    "notes": "Updated release notes...",
    "status": "draft"
}
```

##### Delete Release

```
DELETE /admin/apps/:app_id/releases/:release_id
```

Only allowed for `draft` releases. Returns `400` if release is published.

---

#### Artifact Management

##### Upload Artifact

**Option A: Direct Upload (small files)**

```
POST /admin/apps/:app_id/releases/:release_id/artifacts
Content-Type: multipart/form-data

platform=darwin-aarch64
signature=dW50cnVzdGVkIGNvbW1lbnQ6...
file=@app-1.2.0-darwin-aarch64.tar.gz
```

**Option B: Presigned URL (large files, recommended)**

```
POST /admin/apps/:app_id/releases/:release_id/artifacts/presign
```

**Request Body:**
```json
{
    "platform": "darwin-aarch64",
    "filename": "app-1.2.0-darwin-aarch64.tar.gz",
    "signature": "dW50cnVzdGVkIGNvbW1lbnQ6..."
}
```

**Response:**
```json
{
    "artifact_id": "art_xyz789",
    "upload_url": "https://bucket.r2.cloudflarestorage.com/my-app/releases/1.2.0/...?X-Amz-Signature=...",
    "expires_in": 3600
}
```

Client then uploads directly to R2 using the presigned URL.

##### Confirm Upload (for presigned flow)

```
POST /admin/apps/:app_id/releases/:release_id/artifacts/:artifact_id/confirm
```

Server verifies the file exists in R2 and marks artifact as ready.

##### Delete Artifact

```
DELETE /admin/apps/:app_id/releases/:release_id/artifacts/:artifact_id
```

---

#### Release Lifecycle

##### Publish Release

```
POST /admin/apps/:app_id/releases/:release_id/publish
```

**Preconditions:**
- Release must have status `draft`
- At least one artifact must be uploaded

**Response:**
```json
{
    "id": "rel_abc123",
    "version": "1.2.0",
    "status": "published",
    "pub_date": "2026-02-01T12:00:00Z"
}
```

##### Unpublish / Archive Release

```
POST /admin/apps/:app_id/releases/:release_id/archive
```

Moves release to `archived` status. No longer served to clients.

---

### CI Endpoints (Protected)

Separate scope for CI to limit blast radius of compromised credentials.

#### CI: Create or Update Release

```
POST /ci/apps/:app_slug/releases
```

**Request Body:**
```json
{
    "version": "1.2.0",
    "notes": "### What's New\n\n- Feature X",
    "artifacts": [
        {
            "platform": "darwin-aarch64",
            "signature": "dW50cnVzdGVkIGNvbW1lbnQ6...",
            "r2_key": "my-app/releases/1.2.0/app-1.2.0-darwin-aarch64.tar.gz"
        },
        {
            "platform": "windows-x86_64",
            "signature": "...",
            "r2_key": "my-app/releases/1.2.0/app-1.2.0-windows-x86_64.nsis.zip"
        }
    ],
    "auto_publish": false
}
```

This is a convenience endpoint for CI that creates the release and all artifacts in one call. CI uploads to R2 first (with separate credentials), then calls this endpoint.

---

## Authentication

### API Key Strategy

| Key Type | Scope | App Scope | Permissions |
|----------|-------|-----------|-------------|
| CI Key | `ci` | Per-app | Create releases, upload artifacts for specific app |
| Admin Key | `admin` | Per-app or Global | Full access (CRUD, publish, delete) |

**App-Scoped Keys:**
- Tied to a specific `app_id`
- Can only access resources for that app
- Best for CI pipelines (one key per app)

**Global Keys:**
- `app_id` is NULL
- Can access all apps
- Best for admin dashboard, cross-app operations

### Implementation

```
Authorization: Bearer uk_live_abc123xyz...
```

- Store hashed keys in database (bcrypt or SHA256)
- Include key scope in token or lookup from DB
- Validate app access on every request
- Rate limit by key
- Audit log all operations

### GitHub Actions Authentication

**Option 1: Static API Key (simpler)**
- Store as GitHub secret: `UPDATE_SERVER_API_KEY`
- Create one CI key per app
- Pass in Authorization header

**Option 2: GitHub OIDC (more secure)**
- Configure server to accept GitHub OIDC tokens
- No static secrets to rotate
- Tokens are short-lived and scoped to repo

---

## GitHub Actions Workflow

### Workflow Overview

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

env:
  UPDATE_SERVER_URL: https://updates.yourapp.com
  APP_SLUG: my-app  # Identifies which app this repo builds

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: aarch64-apple-darwin
            platform: darwin-aarch64
          - os: macos-latest
            target: x86_64-apple-darwin
            platform: darwin-x86_64
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
            platform: linux-x86_64
          - os: windows-latest
            target: x86_64-pc-windows-msvc
            platform: windows-x86_64

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-action@stable

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Build Tauri
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}

      - name: Upload to R2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_BUCKET: your-updates-bucket
          R2_ENDPOINT: https://your-account-id.r2.cloudflarestorage.com
        run: |
          VERSION=${GITHUB_REF#refs/tags/v}
          
          # Find the built artifacts (paths vary by platform)
          # Adjust these paths based on your tauri.conf.json
          
          aws s3 cp \
            ./target/release/bundle/*.tar.gz \
            s3://$R2_BUCKET/$APP_SLUG/releases/$VERSION/ \
            --endpoint-url $R2_ENDPOINT

      - name: Read signature
        id: signature
        run: |
          SIG=$(cat ./target/release/bundle/*.sig)
          echo "signature=$SIG" >> $GITHUB_OUTPUT

      - name: Upload artifact info
        uses: actions/upload-artifact@v4
        with:
          name: release-${{ matrix.platform }}
          path: |
            ./target/release/bundle/*.sig
          retention-days: 1

    outputs:
      version: ${{ steps.version.outputs.version }}

  publish:
    needs: build
    runs-on: ubuntu-latest

    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4

      - name: Create release on update server
        env:
          UPDATE_SERVER_API_KEY: ${{ secrets.UPDATE_SERVER_API_KEY }}
        run: |
          VERSION=${GITHUB_REF#refs/tags/v}
          
          # Collect all platform signatures
          # Build the release payload
          # POST to your update server (note: app_slug in URL)
          
          curl -X POST "$UPDATE_SERVER_URL/ci/apps/$APP_SLUG/releases" \
            -H "Authorization: Bearer $UPDATE_SERVER_API_KEY" \
            -H "Content-Type: application/json" \
            -d @- <<EOF
          {
            "version": "$VERSION",
            "notes": "$(cat CHANGELOG.md | head -50)",
            "artifacts": [
              {
                "platform": "darwin-aarch64",
                "signature": "$(cat release-darwin-aarch64/*.sig)",
                "r2_key": "$APP_SLUG/releases/$VERSION/app-darwin-aarch64.tar.gz"
              },
              // ... other platforms
            ],
            "auto_publish": false
          }
          EOF
```

### Required GitHub Secrets (Per App Repository)

| Secret | Purpose |
|--------|---------|
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri update signing key (unique per app) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for signing key |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 upload credentials |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 upload credentials |
| `UPDATE_SERVER_API_KEY` | API key for update server (scoped to this app) |

---

## Admin Dashboard Features (Next.js)

### Core Features

#### 1. App Management

- **App Switcher**: Dropdown or sidebar to switch between apps
- **App List**: Overview of all registered apps with stats
- **Create App**: Register new apps with slug, name, description
- **App Settings**: Edit app details, view/copy public key

#### 2. Release Management (Per App)

- **List View**: Table of all releases with version, status, date, platform coverage
- **Filters**: By status (draft, published, archived), date range, search
- **Bulk Actions**: Archive multiple releases

#### 3. Release Editor

- **Version Input**: Semver validation
- **Release Notes Editor**: Markdown with live preview (use `@uiw/react-md-editor` or similar)
- **Platform Checklist**: Visual indicator of which platforms have artifacts
- **Status Badge**: Current state (draft/published/archived)

#### 4. Artifact Management

- **Upload Interface**: Drag-and-drop for binaries (use `react-dropzone`)
- **Platform Selector**: Dropdown to assign platform to upload
- **Signature Input**: Paste or upload `.sig` file
- **Progress Indicator**: Upload progress with presigned URL flow
- **Validation**: Verify file exists in R2 before allowing publish

#### 5. Publish Controls

- **Publish Button**: Requires confirmation dialog
- **Unpublish/Archive**: Move live release to archived
- **Rollback**: Quick action to archive current and re-publish previous

#### 6. API Key Management

- **Create Keys**: Generate new CI or admin keys (global or per-app)
- **Revoke Keys**: Immediately invalidate compromised keys
- **Usage Log**: When each key was last used
- **Copy to Clipboard**: Easy copy for adding to CI secrets

### Optional Features

#### 7. Analytics Dashboard

- Download counts by version, platform, app
- Geographic distribution
- Update adoption rate (% of users on latest)

#### 8. Notifications

- Webhook to Slack/Discord on publish
- Email notification for failed CI uploads

### Recommended Next.js Stack

```
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── apps/
│   │   │   ├── page.tsx              # List all apps
│   │   │   ├── new/page.tsx          # Create app
│   │   │   └── [appId]/
│   │   │       ├── page.tsx          # App overview
│   │   │       ├── releases/
│   │   │       │   ├── page.tsx      # List releases
│   │   │       │   ├── new/page.tsx  # Create release
│   │   │       │   └── [releaseId]/
│   │   │       │       └── page.tsx  # Edit release
│   │   │       └── settings/page.tsx # App settings
│   │   ├── api-keys/page.tsx         # Manage API keys
│   │   ├── analytics/page.tsx        # Optional analytics
│   │   └── layout.tsx                # Dashboard shell
│   └── api/
│       └── [...proxy]/route.ts       # Proxy to Hono server (optional)
├── components/
│   ├── app-switcher.tsx
│   ├── release-editor.tsx
│   ├── artifact-uploader.tsx
│   ├── markdown-editor.tsx
│   └── ...
└── lib/
    ├── api-client.ts                 # Typed API client
    └── auth.ts                       # Auth utilities
```

### Tech Stack Recommendations

| Concern | Recommendation |
|---------|----------------|
| Framework | Next.js 14+ (App Router) |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Auth | NextAuth.js, Clerk, or Lucia |
| Forms | React Hook Form + Zod |
| API Client | fetch wrapper or tRPC |
| File Upload | react-dropzone + presigned URLs |
| Markdown | @uiw/react-md-editor |
| Hosting | Vercel (easy), Cloudflare Pages, or self-hosted |

### UI Mockup (Conceptual)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🚀 Update Manager          [My App ▼]              [Settings] [API Keys]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐                                                               │
│  │ Apps     │  Releases for: My App                     [+ New Release]     │
│  │ ──────── │                                                               │
│  │ • My App │  ┌─────────────────────────────────────────────────────────┐  │
│  │   Other  │  │ Filter: [All Statuses ▼]  [Search...]                   │  │
│  │   App 2  │  └─────────────────────────────────────────────────────────┘  │
│  │          │                                                               │
│  │ [+ Add]  │  ┌─────────────────────────────────────────────────────────┐  │
│  └──────────┘  │  v1.2.0  │ ● Published │ Feb 1  │ 🍎🪟🐧 │ [Edit]       │  │
│                │  v1.1.0  │ ○ Archived  │ Jan 15 │ 🍎🪟🐧 │ [View]       │  │
│                │  v1.0.0  │ ○ Archived  │ Dec 20 │ 🍎🪟   │ [View]       │  │
│                └─────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Editing: v1.3.0 (Draft)                                     [Delete Draft] │
│                                                                             │
│  Version: [1.3.0        ]                                                   │
│                                                                             │
│  Release Notes:                                                             │
│  ┌─────────────────────────────────┬─────────────────────────────────────┐  │
│  │ ### What's New                  │ What's New                          │  │
│  │                                 │                                     │  │
│  │ - Added dark mode               │ • Added dark mode                   │  │
│  │ - Fixed crash on startup        │ • Fixed crash on startup            │  │
│  │ - Performance improvements      │ • Performance improvements          │  │
│  │                                 │                                     │  │
│  │ [Markdown]                      │ [Preview]                           │  │
│  └─────────────────────────────────┴─────────────────────────────────────┘  │
│                                                                             │
│  Artifacts:                                        [Drop files or click]    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  darwin-aarch64  │ ✅ Uploaded │ 45.2 MB │ [Replace] [×]            │   │
│  │  darwin-x86_64   │ ✅ Uploaded │ 48.1 MB │ [Replace] [×]            │   │
│  │  windows-x86_64  │ ✅ Uploaded │ 52.3 MB │ [Replace] [×]            │   │
│  │  linux-x86_64    │ ⬜ Missing  │    —    │ [Upload]                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [Save Draft]                                           [Publish Release]   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Security Considerations

### Server Security

1. **API Authentication**: All mutation endpoints require valid API key
2. **Key Scoping**: CI keys are app-scoped and cannot publish (only create drafts)
3. **App Isolation**: Verify app access on every request (prevent cross-app access)
4. **Rate Limiting**: Protect against abuse (per key and per IP)
5. **Input Validation**: Strict semver validation, sanitize notes
6. **Audit Logging**: Record all admin actions with timestamp, key ID, and app ID

### Dashboard Security

1. **Authentication**: Require login (OAuth, magic link, or credentials)
2. **Session Management**: Secure, httpOnly cookies with proper expiry
3. **CSRF Protection**: Built into Next.js Server Actions
4. **Role-Based Access**: Consider admin vs viewer roles if multi-user

### Update Security

1. **Signature Verification**: Tauri verifies signatures client-side using public key embedded in app
2. **HTTPS Only**: All download URLs must be HTTPS
3. **Key Rotation**: Document process for rotating signing keys
4. **Per-App Keys**: Each app has its own signing keypair

### R2 Security

1. **Separate Credentials**: CI gets write-only to specific prefix, server gets read-only
2. **Bucket Policy**: Block public listing, allow only specific paths
3. **CORS Configuration**: Restrict to your domains for presigned uploads
4. **Object Lifecycle**: Consider auto-delete for very old archived releases

---

## Implementation Checklist

### Phase 1: Core Server

- [ ] Set up Hono project with TypeScript
- [ ] Configure database (Turso/SQLite or Postgres)
- [ ] Implement data models and migrations (apps, releases, artifacts, api_keys)
- [ ] Create app management endpoints (CRUD)
- [ ] Create public update endpoint (`GET /:app_slug/update/:target/:version`)
- [ ] Test with Tauri updater locally

### Phase 2: Admin API

- [ ] Implement API key authentication middleware
- [ ] Add app-scoped authorization checks
- [ ] Create release CRUD endpoints (per app)
- [ ] Implement artifact upload (direct or presigned)
- [ ] Add publish/archive endpoints
- [ ] Add input validation and error handling

### Phase 3: R2 Integration

- [ ] Set up Cloudflare R2 bucket
- [ ] Configure bucket CORS for presigned uploads
- [ ] Implement presigned URL generation
- [ ] Add file existence verification
- [ ] Set up public access for downloads (or signed URLs)
- [ ] Test upload/download flow

### Phase 4: CI Integration

- [ ] Create CI-specific endpoints (`/ci/apps/:slug/releases`)
- [ ] Set up GitHub Actions workflow template
- [ ] Generate and store Tauri signing keys per app
- [ ] Test end-to-end release flow
- [ ] Document CI setup for new apps

### Phase 5: Admin Dashboard (Next.js)

- [ ] Set up Next.js project with Tailwind + shadcn/ui
- [ ] Implement authentication (NextAuth, Clerk, or custom)
- [ ] Build app list and app switcher
- [ ] Build release list view with filters
- [ ] Build release editor with Markdown preview
- [ ] Implement file upload with progress (presigned URL flow)
- [ ] Add publish confirmation dialog
- [ ] Build API key management page
- [ ] Deploy to Vercel/Cloudflare Pages

### Phase 6: Polish

- [ ] Add download analytics (optional)
- [ ] Set up monitoring and alerting
- [ ] Write operational documentation
- [ ] Create backup/recovery procedures
- [ ] Document onboarding process for new apps

---

## Appendix

### Tauri Configuration (Per App)

Your `tauri.conf.json` updater section (note the app slug in the URL):

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "active": true,
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6...",
      "endpoints": [
        "https://updates.yourserver.com/my-app/update/{{target}}/{{current_version}}"
      ]
    }
  }
}
```

### Generating Signing Keys (Per App)

```bash
# Generate a new keypair for each app
npx @tauri-apps/cli signer generate -w ~/.tauri/my-app.key

# This outputs:
# - Private key (store securely, add to GitHub secrets)
# - Public key (embed in tauri.conf.json AND store in your apps table for reference)
```

### Cloudflare R2 Setup

```bash
# Install wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create bucket
wrangler r2 bucket create your-updates-bucket

# Create API token for server (read-only)
# Go to: Cloudflare Dashboard > R2 > Manage R2 API Tokens

# Create API token for CI (write to specific prefix)
# Restrict to: your-updates-bucket, Object Write only
```

**R2 CORS Configuration (for presigned uploads from dashboard):**

```json
[
  {
    "AllowedOrigins": ["https://admin.yourserver.com"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

### Useful Resources

- [Tauri Updater Documentation](https://v2.tauri.app/plugin/updater/)
- [Hono Documentation](https://hono.dev/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Cloudflare R2 S3 API Compatibility](https://developers.cloudflare.com/r2/api/s3/)
- [Turso Documentation](https://docs.turso.tech/)
- [Next.js App Router](https://nextjs.org/docs/app)
- [shadcn/ui](https://ui.shadcn.com/)