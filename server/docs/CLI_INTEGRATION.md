# Oasis CLI Integration Guide

This document describes how to integrate the Oasis Tauri Update Server with CI/CD pipelines and CLI tools.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Integration Workflows](#integration-workflows)
   - [CI/CD Pipeline Integration](#cicd-pipeline-integration)
   - [Dashboard Manual Upload](#dashboard-manual-upload)
   - [Tauri Client Update Check](#tauri-client-update-check)
4. [Sequence Diagrams](#sequence-diagrams)
5. [API Reference](#api-reference)
6. [Example Implementations](#example-implementations)

---

## Overview

Oasis provides three main integration points:

| Integration Point | Authentication | Purpose |
|-------------------|----------------|---------|
| **CI API** (`/ci/*`) | CI or Admin API Key | Automated release creation from pipelines |
| **Admin API** (`/admin/*`) | Admin API Key | Dashboard and management operations |
| **Public API** (`/:app_slug/update/*`) | None | Tauri client update checks |

---

## Authentication

### API Key Types

| Scope | Access Level | Use Case |
|-------|--------------|----------|
| `admin` | Full access to all apps and operations | Dashboard, management scripts |
| `ci` | Limited to assigned app only | CI/CD pipelines (GitHub Actions, etc.) |

### API Key Format

```
uk_live_<32-character-hex-string>
```

Example: `uk_live_ba14122b793633c6562b4a0cff91f4ec`

### Authentication Header

```http
Authorization: Bearer uk_live_<your-api-key>
```

### Creating API Keys

**Via Admin API:**
```bash
curl -X POST https://your-server.com/admin/api-keys \
  -H "Authorization: Bearer uk_live_<admin-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GitHub Actions - MyApp",
    "scope": "ci",
    "appId": "01HQWX5K8J2MXPZ9Y7VBNC3DFD"
  }'
```

**Via CLI Script:**
```bash
cd server
npx tsx scripts/create-admin-key.ts "My Admin Key"
```

---

## Integration Workflows

### CI/CD Pipeline Integration

The CI workflow allows automated release creation directly from your build pipeline.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CI/CD PIPELINE WORKFLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐          │
│  │  Build   │────▶│  Sign    │────▶│ Upload   │────▶│ Register │          │
│  │  Tauri   │     │ Artifact │     │  to R2   │     │ Release  │          │
│  │   App    │     │          │     │          │     │          │          │
│  └──────────┘     └──────────┘     └──────────┘     └──────────┘          │
│                                                                             │
│  Outputs:          Outputs:         Outputs:         Outputs:              │
│  - .tar.gz         - .sig file      - R2 key         - Release ID         │
│  - .dmg            - signature      - File URL       - Artifact IDs       │
│  - .msi              base64                                                │
│  - .AppImage                                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Steps:**

1. **Build** - Tauri builds platform-specific artifacts
2. **Sign** - Sign artifacts with your private key (generates `.sig` files)
3. **Upload to R2** - Upload artifacts directly to Cloudflare R2
4. **Register Release** - Call Oasis API to create release with artifact metadata

### Dashboard Manual Upload

The dashboard workflow uses presigned URLs for browser-based uploads.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DASHBOARD UPLOAD WORKFLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐          │
│  │  User    │────▶│  Get     │────▶│ Upload   │────▶│ Confirm  │          │
│  │ Selects  │     │ Presign  │     │ to R2    │     │ Upload   │          │
│  │  File    │     │   URL    │     │          │     │          │          │
│  └──────────┘     └──────────┘     └──────────┘     └──────────┘          │
│                                                                             │
│  Browser           Server           R2 Storage       Server                │
│                    returns          (direct          creates               │
│                    presigned        upload)          artifact              │
│                    URL                               record                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Steps:**

1. **Select File** - User selects artifact file in dashboard
2. **Get Presigned URL** - Dashboard requests presigned upload URL from server
3. **Upload to R2** - Browser uploads directly to R2 using presigned URL
4. **Confirm Upload** - Dashboard confirms upload, server creates artifact record

### Tauri Client Update Check

The Tauri updater checks for updates using the public API.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TAURI UPDATE CHECK WORKFLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐          │
│  │  Tauri   │────▶│  Check   │────▶│ Download │────▶│  Apply   │          │
│  │   App    │     │  Update  │     │ Artifact │     │  Update  │          │
│  │ Starts   │     │          │     │          │     │          │          │
│  └──────────┘     └──────────┘     └──────────┘     └──────────┘          │
│                                                                             │
│  On startup        GET request      If 200:          Tauri                 │
│  or manual         to update        download         verifies              │
│  check             endpoint         from URL         signature             │
│                                                      and installs          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Sequence Diagrams

### 1. CI/CD Release Creation Flow

```
┌─────────┐          ┌─────────┐          ┌─────────┐          ┌─────────┐
│ GitHub  │          │   R2    │          │  Oasis  │          │  Tauri  │
│ Actions │          │ Storage │          │ Server  │          │  Client │
└────┬────┘          └────┬────┘          └────┬────┘          └────┬────┘
     │                    │                    │                    │
     │  1. Build Tauri App (tauri build)       │                    │
     │ ─────────────────────────────────────────                    │
     │                    │                    │                    │
     │  2. Sign artifacts with private key     │                    │
     │ ─────────────────────────────────────────                    │
     │                    │                    │                    │
     │  3. Upload to R2   │                    │                    │
     │ ──────────────────▶│                    │                    │
     │                    │                    │                    │
     │    R2 Key returned │                    │                    │
     │ ◀──────────────────│                    │                    │
     │                    │                    │                    │
     │  4. POST /ci/apps/{slug}/releases       │                    │
     │ ──────────────────────────────────────▶│                    │
     │    {                                    │                    │
     │      "version": "1.2.0",                │                    │
     │      "notes": "...",                    │                    │
     │      "artifacts": [{                    │                    │
     │        "platform": "darwin-aarch64",    │                    │
     │        "signature": "base64...",        │                    │
     │        "r2_key": "app/releases/..."     │                    │
     │      }],                                │                    │
     │      "auto_publish": true               │                    │
     │    }                                    │                    │
     │                    │                    │                    │
     │                    │  5. Verify file    │                    │
     │                    │     exists in R2   │                    │
     │                    │ ◀─────────────────│                    │
     │                    │                    │                    │
     │                    │  File info         │                    │
     │                    │ ─────────────────▶│                    │
     │                    │                    │                    │
     │                    │                    │  6. Create release │
     │                    │                    │     & artifacts    │
     │                    │                    │  ───────────────── │
     │                    │                    │                    │
     │  Release created (201)                  │                    │
     │ ◀──────────────────────────────────────│                    │
     │                    │                    │                    │
     │                    │                    │                    │
     │                    │                    │ ◀──────────────────│
     │                    │                    │  7. GET /{slug}/   │
     │                    │                    │     update/{target}│
     │                    │                    │     /{version}     │
     │                    │                    │                    │
     │                    │                    │  Update response   │
     │                    │                    │ ──────────────────▶│
     │                    │                    │   (200 or 204)     │
     │                    │                    │                    │
     │                    │ ◀────────────────────────────────────── │
     │                    │  8. Download artifact from R2           │
     │                    │                    │                    │
     │                    │  Artifact binary   │                    │
     │                    │ ──────────────────────────────────────▶│
     │                    │                    │                    │
     │                    │                    │  9. Analytics event│
     │                    │                    │ ◀──────────────────│
     │                    │                    │    (async)         │
     │                    │                    │                    │
```

### 2. Dashboard Presigned URL Upload Flow

```
┌─────────┐          ┌─────────┐          ┌─────────┐          ┌─────────┐
│ Browser │          │  Oasis  │          │   R2    │          │  Oasis  │
│(Dashboard)         │ Server  │          │ Storage │          │   DB    │
└────┬────┘          └────┬────┘          └────┬────┘          └────┬────┘
     │                    │                    │                    │
     │  1. User selects file in UI             │                    │
     │ ─────────────────────────               │                    │
     │                    │                    │                    │
     │  2. POST /admin/apps/{id}/releases/{id}/artifacts/presign    │
     │ ──────────────────▶│                    │                    │
     │    {                │                    │                    │
     │      "platform": "darwin-aarch64",      │                    │
     │      "filename": "app.tar.gz",          │                    │
     │      "contentType": "application/gzip"  │                    │
     │    }                │                    │                    │
     │                    │                    │                    │
     │                    │  3. Create pending │                    │
     │                    │     artifact       │                    │
     │                    │ ──────────────────────────────────────▶│
     │                    │                    │                    │
     │                    │  4. Generate       │                    │
     │                    │     presigned URL  │                    │
     │                    │ ──────────────────▶│                    │
     │                    │                    │                    │
     │                    │  Presigned URL     │                    │
     │                    │ ◀──────────────────│                    │
     │                    │                    │                    │
     │  Presigned URL + artifact ID            │                    │
     │ ◀──────────────────│                    │                    │
     │    {                │                    │                    │
     │      "artifactId": "01HQW...",          │                    │
     │      "presignedUrl": "https://...",     │                    │
     │      "r2Key": "app/releases/...",       │                    │
     │      "expiresAt": "..."                 │                    │
     │    }                │                    │                    │
     │                    │                    │                    │
     │  5. PUT file directly to presigned URL  │                    │
     │ ──────────────────────────────────────▶│                    │
     │    (binary data with Content-Type)      │                    │
     │                    │                    │                    │
     │  Upload success (200)                   │                    │
     │ ◀──────────────────────────────────────│                    │
     │                    │                    │                    │
     │  6. POST /admin/apps/{id}/releases/{id}/artifacts/{id}/confirm
     │ ──────────────────▶│                    │                    │
     │    {                │                    │                    │
     │      "checksum": "sha256:abc123..."     │                    │
     │    }                │                    │                    │
     │                    │                    │                    │
     │                    │  7. Verify file in R2                   │
     │                    │ ──────────────────▶│                    │
     │                    │                    │                    │
     │                    │  File exists + size│                    │
     │                    │ ◀──────────────────│                    │
     │                    │                    │                    │
     │                    │  8. Update artifact│                    │
     │                    │     (status, size) │                    │
     │                    │ ──────────────────────────────────────▶│
     │                    │                    │                    │
     │  Artifact confirmed (200)               │                    │
     │ ◀──────────────────│                    │                    │
     │                    │                    │                    │
```

### 3. Tauri Update Check Flow

```
┌─────────┐          ┌─────────┐          ┌─────────┐          ┌─────────┐
│  Tauri  │          │  Oasis  │          │   R2    │          │  Oasis  │
│  App    │          │ Server  │          │ Storage │          │   DB    │
└────┬────┘          └────┬────┘          └────┬────┘          └────┬────┘
     │                    │                    │                    │
     │  1. App starts or user triggers update check                 │
     │ ─────────────────────────────────────────                    │
     │                    │                    │                    │
     │  2. GET /{app_slug}/update/{target}/{current_version}        │
     │ ──────────────────▶│                    │                    │
     │    e.g. /my-app/update/darwin-aarch64/1.0.0                  │
     │                    │                    │                    │
     │                    │  3. Query app by slug                   │
     │                    │ ──────────────────────────────────────▶│
     │                    │                    │                    │
     │                    │  4. Query latest published release      │
     │                    │     with artifact for target            │
     │                    │ ──────────────────────────────────────▶│
     │                    │                    │                    │
     │                    │  Release + artifact data                │
     │                    │ ◀──────────────────────────────────────│
     │                    │                    │                    │
     ├────────────────────┼────────────────────┼────────────────────┤
     │     IF newer version available:         │                    │
     ├────────────────────┼────────────────────┼────────────────────┤
     │                    │                    │                    │
     │  Update response (200)                  │                    │
     │ ◀──────────────────│                    │                    │
     │    {                │                    │                    │
     │      "version": "1.2.0",                │                    │
     │      "notes": "What's new...",          │                    │
     │      "pub_date": "2024-01-15T10:00:00Z",│                    │
     │      "url": "https://r2.../artifact",   │                    │
     │      "signature": "base64..."           │                    │
     │    }                │                    │                    │
     │                    │                    │                    │
     │  5. Download artifact                   │                    │
     │ ──────────────────────────────────────▶│                    │
     │                    │                    │                    │
     │  Binary artifact   │                    │                    │
     │ ◀──────────────────────────────────────│                    │
     │                    │                    │                    │
     │                    │  6. Record download│                    │
     │                    │     event (async)  │                    │
     │                    │ ──────────────────────────────────────▶│
     │                    │                    │                    │
     │  7. Verify signature & install          │                    │
     │ ─────────────────────────               │                    │
     │                    │                    │                    │
     ├────────────────────┼────────────────────┼────────────────────┤
     │     IF no newer version:                │                    │
     ├────────────────────┼────────────────────┼────────────────────┤
     │                    │                    │                    │
     │  No Content (204)  │                    │                    │
     │ ◀──────────────────│                    │                    │
     │                    │                    │                    │
```

---

## API Reference

### CI Endpoints

#### Create Release with Artifacts

```http
POST /ci/apps/{app_slug}/releases
Authorization: Bearer uk_live_<ci-or-admin-key>
Content-Type: application/json
```

**Request Body:**
```json
{
  "version": "1.2.0",
  "notes": "### What's New\n\n- Feature X\n- Bug fix Y",
  "artifacts": [
    {
      "platform": "darwin-aarch64",
      "signature": "dW5zaWduZWQ=",
      "r2_key": "my-app/releases/1.2.0/my-app_1.2.0_aarch64.app.tar.gz"
    },
    {
      "platform": "darwin-x86_64",
      "signature": "dW5zaWduZWQ=",
      "r2_key": "my-app/releases/1.2.0/my-app_1.2.0_x64.app.tar.gz"
    },
    {
      "platform": "windows-x86_64",
      "signature": "dW5zaWduZWQ=",
      "r2_key": "my-app/releases/1.2.0/my-app_1.2.0_x64-setup.nsis.zip"
    },
    {
      "platform": "linux-x86_64",
      "signature": "dW5zaWduZWQ=",
      "r2_key": "my-app/releases/1.2.0/my-app_1.2.0_amd64.AppImage.tar.gz"
    }
  ],
  "auto_publish": true
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "release": {
      "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
      "appId": "01HQWX5K8J2MXPZ9Y7VBNC3DFD",
      "version": "1.2.0",
      "notes": "### What's New\n\n- Feature X\n- Bug fix Y",
      "pubDate": "2024-01-15T10:30:00.000Z",
      "status": "published",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    "artifacts": [
      {
        "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFF",
        "platform": "darwin-aarch64",
        "signature": "dW5zaWduZWQ=",
        "r2Key": "my-app/releases/1.2.0/my-app_1.2.0_aarch64.app.tar.gz",
        "downloadUrl": "https://cdn.example.com/my-app/releases/1.2.0/my-app_1.2.0_aarch64.app.tar.gz",
        "fileSize": 52428800,
        "createdAt": "2024-01-15T10:30:00.000Z"
      }
    ]
  }
}
```

### Public Update Endpoints

#### Check for Update

```http
GET /{app_slug}/update/{target}/{current_version}
```

**Parameters:**
- `app_slug` - Application slug (e.g., `my-app`)
- `target` - Platform target (e.g., `darwin-aarch64`, `windows-x86_64`)
- `current_version` - Currently installed version (e.g., `1.0.0`)

**Response (200 - Update Available):**
```json
{
  "version": "1.2.0",
  "notes": "### What's New\n\n- Feature X\n- Bug fix Y",
  "pub_date": "2024-01-15T10:30:00.000Z",
  "url": "https://cdn.example.com/my-app/releases/1.2.0/my-app_1.2.0_aarch64.app.tar.gz",
  "signature": "dW5zaWduZWQ="
}
```

**Response (204 - No Update Available):**
Empty response body

### Admin Presigned Upload Endpoints

#### Get Presigned Upload URL

```http
POST /admin/apps/{app_id}/releases/{release_id}/artifacts/presign
Authorization: Bearer uk_live_<admin-key>
Content-Type: application/json
```

**Request Body:**
```json
{
  "platform": "darwin-aarch64",
  "filename": "my-app_1.2.0_aarch64.app.tar.gz",
  "contentType": "application/gzip",
  "replaceExisting": false
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "artifactId": "01HQWX5K8J2MXPZ9Y7VBNC3DFF",
    "presignedUrl": "https://r2.cloudflarestorage.com/bucket/...",
    "r2Key": "my-app/releases/1.2.0/my-app_1.2.0_aarch64.app.tar.gz",
    "expiresAt": "2024-01-15T11:30:00.000Z",
    "contentType": "application/gzip"
  }
}
```

#### Confirm Upload

```http
POST /admin/apps/{app_id}/releases/{release_id}/artifacts/{artifact_id}/confirm
Authorization: Bearer uk_live_<admin-key>
Content-Type: application/json
```

**Request Body:**
```json
{
  "checksum": "sha256:abc123def456..."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "01HQWX5K8J2MXPZ9Y7VBNC3DFF",
    "releaseId": "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
    "platform": "darwin-aarch64",
    "signature": null,
    "r2Key": "my-app/releases/1.2.0/my-app_1.2.0_aarch64.app.tar.gz",
    "downloadUrl": "https://cdn.example.com/...",
    "fileSize": 52428800,
    "checksum": "sha256:abc123def456...",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## Example Implementations

### GitHub Actions Workflow

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

env:
  OASIS_SERVER: https://updates.example.com
  APP_SLUG: my-app

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
          - os: windows-latest
            target: x86_64-pc-windows-msvc
            platform: windows-x86_64
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
            platform: linux-x86_64

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Rust
        uses: dtolnay/rust-action@stable
        with:
          targets: ${{ matrix.target }}

      - name: Install dependencies
        run: npm ci

      - name: Build Tauri
        run: npm run tauri build -- --target ${{ matrix.target }}
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}

      - name: Upload artifacts to R2
        uses: cloudflare/wrangler-action@v3
        with:
          command: r2 object put ${{ env.APP_SLUG }}/releases/${{ github.ref_name }}/ --file=src-tauri/target/${{ matrix.target }}/release/bundle/
        env:
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

      - name: Save artifact info
        run: |
          echo '${{ matrix.platform }}' >> platforms.txt
          # Extract signature from .sig file
          cat src-tauri/target/${{ matrix.target }}/release/bundle/*.sig | base64 >> signatures.txt

      - uses: actions/upload-artifact@v4
        with:
          name: release-info-${{ matrix.platform }}
          path: |
            platforms.txt
            signatures.txt

  publish:
    needs: build
    runs-on: ubuntu-latest

    steps:
      - uses: actions/download-artifact@v4
        with:
          pattern: release-info-*
          merge-multiple: true

      - name: Create Release in Oasis
        run: |
          VERSION="${{ github.ref_name }}"
          VERSION="${VERSION#v}"  # Remove 'v' prefix

          # Build artifacts array
          ARTIFACTS="[]"
          for platform in darwin-aarch64 darwin-x86_64 windows-x86_64 linux-x86_64; do
            SIGNATURE=$(grep -A1 "$platform" platforms.txt | tail -1)
            R2_KEY="${{ env.APP_SLUG }}/releases/v${{ github.ref_name }}/${platform}.tar.gz"
            ARTIFACTS=$(echo $ARTIFACTS | jq --arg p "$platform" --arg s "$SIGNATURE" --arg k "$R2_KEY" \
              '. + [{"platform": $p, "signature": $s, "r2_key": $k}]')
          done

          # Create release
          curl -X POST "${{ env.OASIS_SERVER }}/ci/apps/${{ env.APP_SLUG }}/releases" \
            -H "Authorization: Bearer ${{ secrets.OASIS_CI_KEY }}" \
            -H "Content-Type: application/json" \
            -d "{
              \"version\": \"$VERSION\",
              \"notes\": \"Release $VERSION\",
              \"artifacts\": $ARTIFACTS,
              \"auto_publish\": true
            }"
```

### Tauri Configuration

In your `tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "pubkey": "YOUR_PUBLIC_KEY_HERE",
      "endpoints": [
        "https://updates.example.com/my-app/update/{{target}}/{{arch}}/{{current_version}}"
      ]
    }
  }
}
```

Or with combined target-arch format:

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "pubkey": "YOUR_PUBLIC_KEY_HERE",
      "endpoints": [
        "https://updates.example.com/my-app/update/{{target}}-{{arch}}/{{current_version}}"
      ]
    }
  }
}
```

### Shell Script for Manual Release

```bash
#!/bin/bash
set -e

# Configuration
OASIS_SERVER="https://updates.example.com"
APP_SLUG="my-app"
VERSION="1.2.0"
OASIS_API_KEY="uk_live_your_api_key_here"

# R2 Configuration
R2_ENDPOINT="https://your-account-id.r2.cloudflarestorage.com"
R2_BUCKET="your-bucket"
R2_ACCESS_KEY="your-access-key"
R2_SECRET_KEY="your-secret-key"

# Upload function using AWS CLI (compatible with R2)
upload_to_r2() {
  local file=$1
  local key=$2

  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY" \
  aws s3 cp "$file" "s3://$R2_BUCKET/$key" \
    --endpoint-url "$R2_ENDPOINT"
}

# Build artifacts array
ARTIFACTS="[]"

# macOS ARM64
if [ -f "dist/my-app_aarch64.app.tar.gz" ]; then
  SIGNATURE=$(cat "dist/my-app_aarch64.app.tar.gz.sig" | base64)
  R2_KEY="$APP_SLUG/releases/$VERSION/darwin-aarch64.tar.gz"
  upload_to_r2 "dist/my-app_aarch64.app.tar.gz" "$R2_KEY"
  ARTIFACTS=$(echo "$ARTIFACTS" | jq \
    --arg p "darwin-aarch64" \
    --arg s "$SIGNATURE" \
    --arg k "$R2_KEY" \
    '. + [{"platform": $p, "signature": $s, "r2_key": $k}]')
fi

# Windows x64
if [ -f "dist/my-app_x64-setup.nsis.zip" ]; then
  SIGNATURE=$(cat "dist/my-app_x64-setup.nsis.zip.sig" | base64)
  R2_KEY="$APP_SLUG/releases/$VERSION/windows-x86_64.zip"
  upload_to_r2 "dist/my-app_x64-setup.nsis.zip" "$R2_KEY"
  ARTIFACTS=$(echo "$ARTIFACTS" | jq \
    --arg p "windows-x86_64" \
    --arg s "$SIGNATURE" \
    --arg k "$R2_KEY" \
    '. + [{"platform": $p, "signature": $s, "r2_key": $k}]')
fi

# Create release
echo "Creating release $VERSION..."
curl -X POST "$OASIS_SERVER/ci/apps/$APP_SLUG/releases" \
  -H "Authorization: Bearer $OASIS_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"version\": \"$VERSION\",
    \"notes\": \"## What's New\\n\\n- Feature updates\\n- Bug fixes\",
    \"artifacts\": $ARTIFACTS,
    \"auto_publish\": true
  }"

echo "Release $VERSION created successfully!"
```

---

## Supported Platforms

| Platform | Target String | Typical Artifact |
|----------|---------------|------------------|
| macOS ARM64 | `darwin-aarch64` | `.app.tar.gz` |
| macOS Intel | `darwin-x86_64` | `.app.tar.gz` |
| Windows x64 | `windows-x86_64` | `.msi` or `.nsis.zip` |
| Windows ARM64 | `windows-aarch64` | `.msi` or `.nsis.zip` |
| Linux x64 | `linux-x86_64` | `.AppImage.tar.gz` |
| Linux ARM64 | `linux-aarch64` | `.AppImage.tar.gz` |

---

## Error Handling

### Common Error Responses

**401 Unauthorized:**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid Authorization header. Expected: Bearer uk_live_..."
  }
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "This API key does not have access to the requested application"
  }
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "App with identifier 'unknown-app' was not found"
  }
}
```

**409 Conflict:**
```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Release version '1.2.0' already exists for app '01HQWX...'"
  }
}
```

**429 Rate Limited:**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again later."
  }
}
```

---

## Best Practices

1. **Use CI-scoped keys** for automated pipelines - they're limited to a single app
2. **Store API keys securely** in your CI's secret management
3. **Upload artifacts to R2 first** before calling the CI endpoint
4. **Use `auto_publish: true`** for fully automated releases
5. **Include release notes** to inform users what changed
6. **Sign all artifacts** with your Tauri private key for security
7. **Test updates** in a staging environment before production
