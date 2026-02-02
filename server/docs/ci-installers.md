# CI Pipeline: Uploading Installers

This guide explains how to upload installer files (DMG, EXE, MSI, etc.) alongside update artifacts from your CI pipeline.

## Overview

Installers are separate from update artifacts:
- **Update Artifacts** (`.tar.gz`): Used by Tauri's built-in updater for in-app updates
- **Installers** (`.dmg`, `.exe`, `.msi`, etc.): Used for first-time downloads from your landing page

Both can be uploaded in a single CI release request.

## Workflow

1. **Build your app** - Generate both update artifacts and installers
2. **Upload files to R2** - Upload all files directly to your R2 bucket
3. **Register the release** - Call the CI API to create the release with artifacts and installers

## API Endpoint

```
POST /ci/apps/:app_slug/releases
Authorization: Bearer <your-ci-api-key>
Content-Type: application/json
```

## Request Body

```json
{
  "version": "1.2.0",
  "notes": "### What's New\n- Feature A\n- Bug fix B",
  "artifacts": [
    {
      "platform": "darwin-aarch64",
      "signature": "dW5zaWduZWQ=...",
      "r2_key": "my-app/releases/1.2.0/my-app_1.2.0_aarch64.app.tar.gz"
    },
    {
      "platform": "darwin-x86_64",
      "signature": "dW5zaWduZWQ=...",
      "r2_key": "my-app/releases/1.2.0/my-app_1.2.0_x64.app.tar.gz"
    },
    {
      "platform": "windows-x86_64",
      "signature": "dW5zaWduZWQ=...",
      "r2_key": "my-app/releases/1.2.0/my-app_1.2.0_x64-setup.nsis.zip"
    }
  ],
  "installers": [
    {
      "platform": "darwin-universal",
      "filename": "MyApp-1.2.0-universal.dmg",
      "r2_key": "my-app/installers/1.2.0/MyApp-1.2.0-universal.dmg",
      "display_name": "macOS Installer"
    },
    {
      "platform": "windows-x86_64",
      "filename": "MyApp-1.2.0-Setup.exe",
      "r2_key": "my-app/installers/1.2.0/MyApp-1.2.0-Setup.exe",
      "display_name": "Windows Installer (64-bit)"
    }
  ],
  "auto_publish": true
}
```

## Installer Object Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `platform` | string | Yes | Target platform (see platforms below) |
| `filename` | string | Yes | Original filename of the installer |
| `r2_key` | string | Yes | Path where the file was uploaded in R2 |
| `display_name` | string | No | Human-readable name for the installer |

## Supported Installer Platforms

| Platform | Description |
|----------|-------------|
| `darwin-aarch64` | macOS Apple Silicon |
| `darwin-x86_64` | macOS Intel |
| `darwin-universal` | macOS Universal (recommended for macOS) |
| `windows-x86_64` | Windows 64-bit |
| `windows-x86` | Windows 32-bit |
| `windows-aarch64` | Windows ARM64 |
| `linux-x86_64` | Linux 64-bit |
| `linux-aarch64` | Linux ARM64 |
| `linux-armv7` | Linux ARMv7 |

## GitHub Actions Example

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

env:
  APP_SLUG: my-app

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: aarch64-apple-darwin
            artifact_platform: darwin-aarch64
          - os: macos-latest
            target: x86_64-apple-darwin
            artifact_platform: darwin-x86_64
          - os: windows-latest
            target: x86_64-pc-windows-msvc
            artifact_platform: windows-x86_64

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Build Tauri App
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
        with:
          args: --target ${{ matrix.target }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.artifact_platform }}
          path: |
            src-tauri/target/${{ matrix.target }}/release/bundle/**/*.tar.gz
            src-tauri/target/${{ matrix.target }}/release/bundle/**/*.sig
            src-tauri/target/${{ matrix.target }}/release/bundle/**/*.dmg
            src-tauri/target/${{ matrix.target }}/release/bundle/**/*.exe
            src-tauri/target/${{ matrix.target }}/release/bundle/**/*.msi

  # Build universal macOS DMG
  build-macos-universal:
    needs: build
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Download macOS artifacts
        uses: actions/download-artifact@v4
        with:
          pattern: darwin-*
          merge-multiple: true

      - name: Create Universal DMG
        run: |
          # Your script to create universal binary and DMG
          ./scripts/create-universal-dmg.sh

      - name: Upload universal DMG
        uses: actions/upload-artifact@v4
        with:
          name: darwin-universal-installer
          path: dist/*.dmg

  release:
    needs: [build, build-macos-universal]
    runs-on: ubuntu-latest

    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts

      - name: Get version from tag
        id: version
        run: echo "VERSION=${GITHUB_REF#refs/tags/v}" >> $GITHUB_OUTPUT

      - name: Upload to R2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_ENDPOINT: ${{ secrets.R2_ENDPOINT }}
          R2_BUCKET: ${{ secrets.R2_BUCKET }}
        run: |
          # Install AWS CLI
          pip install awscli

          # Configure for R2
          aws configure set default.s3.signature_version s3v4

          VERSION=${{ steps.version.outputs.VERSION }}

          # Upload update artifacts
          for platform in darwin-aarch64 darwin-x86_64 windows-x86_64; do
            # Find and upload .tar.gz / .nsis.zip files
            find artifacts/$platform -name "*.tar.gz" -o -name "*.nsis.zip" | while read file; do
              filename=$(basename "$file")
              aws s3 cp "$file" "s3://$R2_BUCKET/$APP_SLUG/releases/$VERSION/$filename" \
                --endpoint-url "$R2_ENDPOINT"
            done
          done

          # Upload installers
          # macOS Universal DMG
          aws s3 cp artifacts/darwin-universal-installer/*.dmg \
            "s3://$R2_BUCKET/$APP_SLUG/installers/$VERSION/MyApp-$VERSION-universal.dmg" \
            --endpoint-url "$R2_ENDPOINT"

          # Windows installer
          find artifacts/windows-x86_64 -name "*.exe" | head -1 | while read file; do
            aws s3 cp "$file" \
              "s3://$R2_BUCKET/$APP_SLUG/installers/$VERSION/MyApp-$VERSION-Setup.exe" \
              --endpoint-url "$R2_ENDPOINT"
          done

      - name: Register Release with Oasis
        env:
          OASIS_API_URL: ${{ secrets.OASIS_API_URL }}
          OASIS_CI_KEY: ${{ secrets.OASIS_CI_KEY }}
        run: |
          VERSION=${{ steps.version.outputs.VERSION }}

          # Read signatures
          DARWIN_ARM_SIG=$(cat artifacts/darwin-aarch64/*.sig | base64 -w0)
          DARWIN_X64_SIG=$(cat artifacts/darwin-x86_64/*.sig | base64 -w0)
          WINDOWS_SIG=$(cat artifacts/windows-x86_64/*.sig | base64 -w0)

          # Create release with artifacts and installers
          curl -X POST "$OASIS_API_URL/ci/apps/$APP_SLUG/releases" \
            -H "Authorization: Bearer $OASIS_CI_KEY" \
            -H "Content-Type: application/json" \
            -d @- <<EOF
          {
            "version": "$VERSION",
            "notes": "Release v$VERSION",
            "artifacts": [
              {
                "platform": "darwin-aarch64",
                "signature": "$DARWIN_ARM_SIG",
                "r2_key": "$APP_SLUG/releases/$VERSION/my-app_${VERSION}_aarch64.app.tar.gz"
              },
              {
                "platform": "darwin-x86_64",
                "signature": "$DARWIN_X64_SIG",
                "r2_key": "$APP_SLUG/releases/$VERSION/my-app_${VERSION}_x64.app.tar.gz"
              },
              {
                "platform": "windows-x86_64",
                "signature": "$WINDOWS_SIG",
                "r2_key": "$APP_SLUG/releases/$VERSION/my-app_${VERSION}_x64-setup.nsis.zip"
              }
            ],
            "installers": [
              {
                "platform": "darwin-universal",
                "filename": "MyApp-$VERSION-universal.dmg",
                "r2_key": "$APP_SLUG/installers/$VERSION/MyApp-$VERSION-universal.dmg",
                "display_name": "macOS Installer"
              },
              {
                "platform": "windows-x86_64",
                "filename": "MyApp-$VERSION-Setup.exe",
                "r2_key": "$APP_SLUG/installers/$VERSION/MyApp-$VERSION-Setup.exe",
                "display_name": "Windows Installer (64-bit)"
              }
            ],
            "auto_publish": true
          }
          EOF
```

## Response

```json
{
  "success": true,
  "data": {
    "release": {
      "id": "01HQWX...",
      "version": "1.2.0",
      "status": "published",
      "notes": "### What's New...",
      "pubDate": "2024-01-15T10:00:00.000Z",
      "createdAt": "2024-01-15T10:00:00.000Z"
    },
    "artifacts": [
      {
        "id": "01HQWY...",
        "platform": "darwin-aarch64",
        "r2Key": "my-app/releases/1.2.0/...",
        "downloadUrl": "https://...",
        "fileSize": 15728640,
        "createdAt": "2024-01-15T10:00:00.000Z"
      }
    ],
    "installers": [
      {
        "id": "01HQWZ...",
        "platform": "darwin-universal",
        "filename": "MyApp-1.2.0-universal.dmg",
        "displayName": "macOS Installer",
        "r2Key": "my-app/installers/1.2.0/...",
        "downloadUrl": "https://...",
        "fileSize": 52428800,
        "createdAt": "2024-01-15T10:00:00.000Z"
      }
    ]
  }
}
```

## Public Download URLs

After publishing, installers are available at:

```
# Latest version
GET /:app_slug/download/:platform

# Specific version
GET /:app_slug/download/:platform/:version
```

Examples:
- `https://api.example.com/my-app/download/darwin-universal` → Latest macOS DMG
- `https://api.example.com/my-app/download/windows-x86_64` → Latest Windows installer
- `https://api.example.com/my-app/download/darwin-universal/1.2.0` → Specific version

These URLs:
1. **Track downloads** in analytics
2. **Redirect (302)** to the actual R2/CDN download URL
3. **Support fallbacks** (e.g., `darwin-aarch64` falls back to `darwin-universal`)

## R2 Key Naming Convention

Recommended structure:
```
{app_slug}/
├── releases/
│   └── {version}/
│       ├── app_1.2.0_aarch64.app.tar.gz     # Update artifacts
│       ├── app_1.2.0_x64.app.tar.gz
│       └── app_1.2.0_x64-setup.nsis.zip
└── installers/
    └── {version}/
        ├── App-1.2.0-universal.dmg          # Installer files
        └── App-1.2.0-Setup.exe
```

## Tips

1. **Use `darwin-universal` for macOS** - Create a universal binary DMG that works on both Intel and Apple Silicon Macs

2. **Display names are shown in the dashboard** - Use them to provide friendly names like "macOS Installer" instead of raw filenames

3. **Set `auto_publish: true`** - Automatically publishes the release after creation (otherwise it stays in draft)

4. **One installer per platform** - Each release can have only one installer per platform. Uploading another replaces it.

5. **Installers are optional** - You can create releases with just artifacts (for update-only releases)
