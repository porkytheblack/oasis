# Oasis - Feedback and Crash Analytics for Tauri Apps

Oasis is a self-hosted platform for managing Tauri application releases, collecting user feedback, and tracking crashes.

## Project Structure

- `sdk/` - TypeScript SDK for client-side integration (npm: `oasis-sdk`)
- `server/` - Hono backend API server
- `dashboard/` - Next.js admin dashboard
- `.github/workflows/` - CI/CD workflows including reusable Tauri release workflow

## Key Documentation

For integrating Oasis into a Tauri app, see: `.claude/skills/oasis-integration.md`

## SDK Quick Reference

```typescript
import { initOasis } from 'oasis-sdk';

const oasis = initOasis({
  apiKey: 'pk_app-slug_xxx',
  serverUrl: 'https://updates.example.com',
  appVersion: '1.0.0',
  enableAutoCrashReporting: true,
});

// Feedback
await oasis.feedback.reportBug('Description');
await oasis.feedback.requestFeature('Description');

// Crashes (auto-captured if enabled, or manual)
oasis.crashes.captureException(error);

// Breadcrumbs
oasis.breadcrumbs.addUserAction('Clicked save');
```

## Release Workflow

Apps integrate with Oasis releases by using the reusable workflow:

```yaml
uses: porkytheblack/oasis/.github/workflows/tauri-release.yml@main
with:
  app_slug: my-app
  artifact_prefix: MyApp
  app_name: My Application
```

## API Keys

- **Public keys** (`pk_*`): Used in SDK for client-side API calls
- **CI keys** (`uk_live_*`): Used in GitHub Actions for release registration
- **Admin keys** (`uk_live_*` with admin scope): Full dashboard access

## Common Tasks

### Publishing SDK to npm
```bash
cd sdk
# Update version in package.json
git tag sdk-v0.1.0
git push origin main --tags
# Workflow publishes automatically
```

### Testing Tauri Release Workflow
Use `dry_run: true` input to skip uploads and test the build process.
