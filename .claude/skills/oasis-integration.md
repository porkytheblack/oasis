# Oasis Integration Guide

This skill provides instructions for integrating Oasis into Tauri applications. Oasis provides:
- **Auto-updates**: Distribute updates to your Tauri app
- **Crash reporting**: Capture and track errors automatically
- **User feedback**: Collect bug reports and feature requests

## Quick Start

### 1. Install the SDK

```bash
npm install oasis-sdk
```

### 2. Initialize in Your App

```typescript
import { initOasis } from 'oasis-sdk';

const oasis = initOasis({
  apiKey: 'pk_my-app_xxxxxxxx',           // Get from Oasis dashboard
  serverUrl: 'https://updates.myapp.com', // Your Oasis server URL
  appVersion: '1.0.0',                    // Current app version
  enableAutoCrashReporting: true,         // Auto-capture uncaught errors
});
```

### 3. Add Feedback Collection

```typescript
// Submit user feedback
await oasis.feedback.submit({
  category: 'bug',  // 'bug' | 'feature' | 'general'
  message: 'Description of the issue',
  email: 'user@example.com',  // Optional
});

// Convenience methods
await oasis.feedback.reportBug('Bug description');
await oasis.feedback.requestFeature('Feature request');
```

### 4. Manual Crash Reporting

```typescript
try {
  riskyOperation();
} catch (error) {
  await oasis.crashes.captureException(error, {
    severity: 'error',  // 'warning' | 'error' | 'fatal'
    appState: { screen: 'checkout' },
  });
}
```

---

## Tauri Configuration

### Enable Auto-Updates

In `src-tauri/tauri.conf.json`:

```json
{
  "tauri": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://YOUR_OASIS_SERVER/your-app-slug/update/{{target}}/{{current_version}}"
      ],
      "dialog": true,
      "pubkey": "YOUR_PUBLIC_KEY_HERE"
    }
  }
}
```

### Generate Signing Keys

```bash
# Generate a new key pair for signing updates
npx @tauri-apps/cli signer generate -w ~/.tauri/myapp.key
```

Save the **private key** as a GitHub secret (`TAURI_SIGNING_PRIVATE_KEY`).
Put the **public key** in your `tauri.conf.json` under `updater.pubkey`.

---

## GitHub Actions Workflow

Create `.github/workflows/release.yml` to use the Oasis reusable workflow:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    uses: porkytheblack/oasis/.github/workflows/tauri-release.yml@main
    with:
      app_slug: your-app-slug        # Must match Oasis dashboard
      artifact_prefix: YourApp       # Filename prefix (e.g., YourApp_1.0.0_darwin-aarch64.dmg)
      app_name: Your App Name        # Display name in GitHub releases
      app_dir: .                     # Path to your Tauri app (default: "app")
      distribute_to: r2,oasis,github # Where to upload artifacts
      auto_publish: true             # Auto-publish in Oasis (makes update available)
      r2_public_url: https://cdn.example.com  # Public URL for R2 bucket
    secrets:
      # macOS Code Signing
      APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
      APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
      APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
      APPLE_ID: ${{ secrets.APPLE_ID }}
      APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
      APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}

      # Tauri Update Signing
      TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}

      # Cloudflare R2 Storage
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      CLOUDFLARE_R2_ACCESS_KEY_ID: ${{ secrets.CLOUDFLARE_R2_ACCESS_KEY_ID }}
      CLOUDFLARE_R2_SECRET_ACCESS_KEY: ${{ secrets.CLOUDFLARE_R2_SECRET_ACCESS_KEY }}
      R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}

      # Oasis Server
      OASIS_SERVER_URL: ${{ secrets.OASIS_SERVER_URL }}
      OASIS_CI_KEY: ${{ secrets.OASIS_CI_KEY }}
      NEXT_PUBLIC_OASIS_API_KEY: ${{ secrets.NEXT_PUBLIC_OASIS_API_KEY }}
      NEXT_PUBLIC_OASIS_SERVER_URL: ${{ secrets.NEXT_PUBLIC_OASIS_SERVER_URL }}
```

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE` | Base64-encoded .p12 certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the certificate |
| `APPLE_SIGNING_IDENTITY` | e.g., "Developer ID Application: Your Name (TEAMID)" |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | Your Apple Developer Team ID |
| `TAURI_SIGNING_PRIVATE_KEY` | Private key from `tauri signer generate` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the signing key (optional) |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 API access key |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 API secret key |
| `R2_BUCKET_NAME` | Name of your R2 bucket |
| `OASIS_SERVER_URL` | Your Oasis server URL |
| `OASIS_CI_KEY` | CI API key from Oasis (uk_live_*) |
| `NEXT_PUBLIC_OASIS_API_KEY` | Public SDK key (pk_*) - passed to build |
| `NEXT_PUBLIC_OASIS_SERVER_URL` | Public server URL - passed to build |

---

## SDK API Reference

### Initialization Options

```typescript
interface OasisConfig {
  apiKey: string;                    // Required: Public API key (pk_*)
  serverUrl: string;                 // Required: Oasis server URL
  appVersion: string;                // Required: Current app version (semver)
  enableAutoCrashReporting?: boolean; // Auto-capture uncaught errors (default: false)
  maxBreadcrumbs?: number;           // Max breadcrumbs to keep (default: 50)
  timeout?: number;                  // Request timeout in ms (default: 10000)
  debug?: boolean;                   // Enable debug logging (default: false)
  beforeSend?: (event) => event | null; // Filter/modify events before sending
  onError?: (error, event) => void;  // Called when event fails to send
}
```

### Feedback API

```typescript
// Full options
await oasis.feedback.submit({
  category: 'bug' | 'feature' | 'general',
  message: string,
  email?: string,
  metadata?: Record<string, unknown>,
});

// Convenience methods
await oasis.feedback.reportBug(message: string, email?: string);
await oasis.feedback.requestFeature(message: string, email?: string);
await oasis.feedback.sendFeedback(message: string, email?: string);
```

### Crash Reporting API

```typescript
// Capture an exception
await oasis.crashes.captureException(error: Error, options?: {
  severity?: 'warning' | 'error' | 'fatal',
  appState?: Record<string, unknown>,
  tags?: Record<string, string>,
});

// Full crash report
await oasis.crashes.report({
  error: Error,
  severity?: 'warning' | 'error' | 'fatal',
  appState?: Record<string, unknown>,
  tags?: Record<string, string>,
});

// Auto-capture control
oasis.crashes.enableAutoCrashReporting();
oasis.crashes.disableAutoCrashReporting();
```

### Breadcrumbs API

Breadcrumbs track user actions leading up to a crash.

```typescript
// Add custom breadcrumb
oasis.breadcrumbs.add({
  type: string,
  message: string,
  data?: Record<string, unknown>,
});

// Convenience methods
oasis.breadcrumbs.addNavigation(from: string, to: string);
oasis.breadcrumbs.addClick(target: string, data?: object);
oasis.breadcrumbs.addHttp(method: string, url: string, statusCode?: number);
oasis.breadcrumbs.addConsole(level: string, message: string);
oasis.breadcrumbs.addUserAction(action: string, data?: object);

// Get/clear breadcrumbs
oasis.breadcrumbs.getAll();
oasis.breadcrumbs.clear();
```

**Auto-collected breadcrumbs:**
- Navigation (History API changes)
- Clicks (with element info)
- Console messages (log, warn, error)
- Fetch requests (method, URL, status)

### User Tracking

```typescript
// Set user for attribution
oasis.setUser({
  id: string,           // Required
  email?: string,
  username?: string,
  [key: string]: any,   // Custom properties
});

// Clear user
oasis.setUser(null);
```

### Utilities

```typescript
// Manually flush event queue (for offline support)
await oasis.flush();

// Get current configuration
const config = oasis.getConfig();

// Clean up resources
oasis.destroy();
```

---

## Workflow Details

### What the Release Workflow Does

1. **Build** (parallel for each platform):
   - macOS (Apple Silicon + Intel)
   - Linux (x86_64)
   - Windows (x86_64)

2. **Sign & Package**:
   - macOS: Code sign with Apple certificate, notarize, create DMG
   - All platforms: Create update bundles (.app.tar.gz, .AppImage.tar.gz, .nsis.zip)
   - Sign update bundles with Tauri signing key

3. **Upload**:
   - Upload installers to R2: `{app_slug}/installers/{version}/{filename}`
   - Upload update bundles to R2: `{app_slug}/releases/{version}/{filename}`

4. **Register**:
   - POST to Oasis server with version, artifacts, signatures
   - Optionally auto-publish (makes update available to users)

5. **GitHub Release**:
   - Create release with download links and checksums

### Supported Platforms

| Platform | Target | Bundle Types |
|----------|--------|--------------|
| macOS (Apple Silicon) | `darwin-aarch64` | .dmg, .app.tar.gz |
| macOS (Intel) | `darwin-x86_64` | .dmg, .app.tar.gz |
| Linux | `linux-x86_64` | .AppImage, .deb, .AppImage.tar.gz |
| Windows | `windows-x86_64` | .exe (NSIS), .nsis.zip |

---

## Troubleshooting

### SDK Issues

**Events not sending:**
- Check `debug: true` in config for logs
- Verify `apiKey` starts with `pk_`
- Verify `serverUrl` is correct and accessible

**Crashes not captured:**
- Ensure `enableAutoCrashReporting: true` or call `oasis.crashes.enableAutoCrashReporting()`

### Workflow Issues

**Build fails on macOS:**
- Verify all Apple signing secrets are set correctly
- Check certificate hasn't expired
- Ensure `APPLE_SIGNING_IDENTITY` matches certificate name exactly

**Release not appearing:**
- Check `auto_publish: true` or manually publish in dashboard
- Verify `OASIS_CI_KEY` has correct permissions
- Check server logs for registration errors

**Updates not downloading:**
- Verify `updater.pubkey` in tauri.conf.json matches the public key
- Check update endpoint URL format matches server expectations
- Ensure release is published (not draft)

---

## Integration Checklist

### Initial Setup
- [ ] Create app in Oasis dashboard
- [ ] Generate public API key (pk_*)
- [ ] Generate CI API key (uk_live_*)
- [ ] Set up Cloudflare R2 bucket
- [ ] Generate Tauri signing key pair

### Tauri App
- [ ] Install `oasis-sdk`
- [ ] Initialize SDK on app startup
- [ ] Add feedback UI
- [ ] Enable auto-crash reporting
- [ ] Configure `tauri.conf.json` updater

### CI/CD
- [ ] Add all required secrets to GitHub
- [ ] Create release workflow
- [ ] Test with `dry_run: true`
- [ ] Perform test release
- [ ] Verify updates work end-to-end

### Monitoring
- [ ] Check crashes appear in dashboard
- [ ] Check feedback appears in dashboard
- [ ] Verify release artifacts in R2
- [ ] Test download links work
