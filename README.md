# Oasis - Tauri Update Server

A self-hosted update server for Tauri applications, featuring a Hono backend, PostgreSQL database, Cloudflare R2 storage, and a Next.js admin dashboard.

## Features

- **Tauri Update Protocol** - Full compatibility with Tauri's updater
- **Multi-platform Support** - darwin-aarch64, darwin-x86_64, linux-x86_64, linux-aarch64, windows-x86_64, windows-aarch64
- **Release Lifecycle** - Draft, published, and archived release states
- **CI/CD Integration** - GitHub Actions-friendly API for automated releases
- **R2 Storage** - Cloudflare R2 integration with presigned URLs
- **Admin Dashboard** - Next.js dashboard for managing apps and releases
- **Analytics** - Download tracking with time-series data
- **Feedback Collection** - Collect user feedback (bugs, features, general) from your apps
- **Crash Analytics** - Automatic crash reporting with grouping and fingerprinting
- **TypeScript SDK** - `@oasis/sdk` for easy integration into your applications
- **Rate Limiting** - Configurable rate limits for all endpoints
- **API Key Authentication** - Scoped API keys (admin, CI, SDK)

## Architecture

```
oasis/
├── server/         # Hono backend server
│   ├── src/
│   │   ├── db/           # Drizzle ORM schema and migrations
│   │   ├── middleware/   # Authentication, rate limiting
│   │   ├── routes/       # API endpoints
│   │   ├── services/     # Business logic
│   │   ├── types/        # TypeScript types and Zod schemas
│   │   └── utils/        # Utilities (semver, response helpers)
│   └── package.json
│
├── dashboard/      # Next.js admin UI
│   ├── src/
│   │   ├── app/          # Next.js App Router pages
│   │   ├── components/   # UI components
│   │   └── lib/          # API client, types
│   └── package.json
│
└── sdk/            # TypeScript SDK for apps
    ├── src/
    │   ├── feedback.ts   # Feedback submission
    │   ├── crashes.ts    # Crash reporting
    │   ├── breadcrumbs.ts # Event breadcrumbs
    │   └── queue.ts      # Offline event queue
    └── package.json
```

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- PostgreSQL >= 14
- Cloudflare R2 bucket (optional, for artifact storage)

### Server Setup

```bash
cd server
npm install

# Start PostgreSQL with Docker (optional)
npm run docker:up

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Initialize database
npm run db:push

# Start development server
npm run dev
```

### Dashboard Setup

```bash
cd dashboard
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API URL

# Start development server
npm run dev
```

## CI/CD

Reusable GitHub Actions workflow and composite actions are available for Tauri releases with Oasis integration.

Docs: `docs/ci/tauri-release.md`

## Environment Variables

### Server

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3000) | No |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `R2_ENDPOINT` | Cloudflare R2 endpoint URL | Yes* |
| `R2_ACCESS_KEY_ID` | R2 access key ID | Yes* |
| `R2_SECRET_ACCESS_KEY` | R2 secret access key | Yes* |
| `R2_BUCKET` | R2 bucket name | Yes* |
| `R2_PUBLIC_URL` | Public URL for bucket (if using custom domain) | No |

*Required for artifact storage. Without R2, you can still use external artifact URLs.

Example `DATABASE_URL`:
```
postgresql://oasis_user:password@localhost:5432/oasis
```

### Dashboard

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_API_URL` | Server API URL | Yes |

## API Reference

### Public Endpoints

#### Check for Update
```
GET /:app_slug/update/:target/:current_version
```

Response (update available):
```json
{
  "version": "1.2.0",
  "notes": "### What's New\n- Feature X",
  "pub_date": "2024-01-15T10:00:00.000Z",
  "url": "https://cdn.example.com/app.tar.gz",
  "signature": "base64..."
}
```

Response (no update): `204 No Content`

Full public API docs: `server/docs/public-api.md`

### Admin Endpoints

All admin endpoints require authentication via API key:
```
Authorization: Bearer uk_live_xxx
```

#### Apps

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/apps` | List all apps |
| POST | `/admin/apps` | Create an app |
| GET | `/admin/apps/:id` | Get app details |
| PATCH | `/admin/apps/:id` | Update an app |
| DELETE | `/admin/apps/:id` | Delete an app |

#### Releases

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/apps/:id/releases` | List releases |
| POST | `/admin/apps/:id/releases` | Create a release |
| GET | `/admin/apps/:id/releases/:rid` | Get release details |
| PATCH | `/admin/apps/:id/releases/:rid` | Update a release |
| DELETE | `/admin/apps/:id/releases/:rid` | Delete a release |
| POST | `/admin/apps/:id/releases/:rid/publish` | Publish a release |
| POST | `/admin/apps/:id/releases/:rid/archive` | Archive a release |

#### Artifacts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/apps/:id/releases/:rid/artifacts` | List artifacts |
| POST | `/admin/apps/:id/releases/:rid/artifacts/presign` | Get presigned upload URL |
| POST | `/admin/apps/:id/releases/:rid/artifacts/:aid/confirm` | Confirm artifact upload |
| DELETE | `/admin/apps/:id/releases/:rid/artifacts/:aid` | Delete an artifact |

#### API Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/api-keys` | List API keys |
| POST | `/admin/api-keys` | Create an API key |
| GET | `/admin/api-keys/:id` | Get API key details |
| DELETE | `/admin/api-keys/:id` | Revoke an API key |

#### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/apps/:id/analytics` | Get download statistics |
| GET | `/admin/apps/:id/analytics/timeseries` | Get time-series data |

#### SDK Keys (Public API Keys)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/apps/:id/public-keys` | List SDK keys |
| POST | `/admin/apps/:id/public-keys` | Create SDK key |
| DELETE | `/admin/apps/:id/public-keys/:kid` | Revoke SDK key |

#### Feedback

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/apps/:id/feedback` | List feedback (filterable) |
| GET | `/admin/apps/:id/feedback/:fid` | Get feedback details |
| PATCH | `/admin/apps/:id/feedback/:fid` | Update feedback status |
| DELETE | `/admin/apps/:id/feedback/:fid` | Delete feedback |
| GET | `/admin/apps/:id/feedback/stats` | Get feedback statistics |

#### Crash Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/apps/:id/crashes` | List crash reports |
| GET | `/admin/apps/:id/crashes/:cid` | Get crash report details |
| GET | `/admin/apps/:id/crashes/groups` | List crash groups |
| GET | `/admin/apps/:id/crashes/groups/:gid` | Get crash group details |
| PATCH | `/admin/apps/:id/crashes/groups/:gid` | Update crash group status |
| GET | `/admin/apps/:id/crashes/groups/:gid/reports` | Get reports for group |
| GET | `/admin/apps/:id/crashes/stats` | Get crash statistics |

### SDK Endpoints

SDK endpoints are used by the `@oasis/sdk` package to submit feedback and crash reports. They require a public SDK key (`pk_*` prefix).

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sdk/:app_slug/feedback` | Submit user feedback |
| POST | `/sdk/:app_slug/crashes` | Submit crash report |

### CI Endpoints

CI endpoints require a CI-scoped or admin-scoped API key.

#### Create Release with Artifacts
```
POST /ci/apps/:app_slug/releases
Authorization: Bearer uk_live_xxx

{
  "version": "1.2.0",
  "notes": "### What's New\n- Feature X",
  "artifacts": [
    {
      "platform": "darwin-aarch64",
      "signature": "base64...",
      "r2_key": "my-app/releases/1.2.0/app.tar.gz"
    }
  ],
  "auto_publish": true
}
```

### Health Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/detailed` | Detailed health with metrics |
| GET | `/health/live` | Kubernetes liveness probe |
| GET | `/health/ready` | Kubernetes readiness probe |

## CLI & CI/CD Integration

For comprehensive documentation on integrating with CI/CD pipelines, including detailed sequence diagrams and examples, see the [CLI Integration Guide](./server/docs/CLI_INTEGRATION.md).

### Quick Example - GitHub Actions

Example workflow for releasing:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build
        run: npm run build

      - name: Upload to R2
        run: |
          aws s3 cp dist/app.tar.gz \
            s3://my-bucket/my-app/releases/${{ github.ref_name }}/app.tar.gz \
            --endpoint-url ${{ secrets.R2_ENDPOINT }}

      - name: Create Release
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.OASIS_CI_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{
              "version": "${{ github.ref_name }}",
              "artifacts": [
                {
                  "platform": "linux-x86_64",
                  "signature": "'$(cat dist/app.tar.gz.sig | base64)'",
                  "r2_key": "my-app/releases/${{ github.ref_name }}/app.tar.gz"
                }
              ],
              "auto_publish": true
            }' \
            ${{ secrets.OASIS_URL }}/ci/apps/my-app/releases
```

## SDK Integration (Feedback & Crash Reporting)

The `@oasis/sdk` package enables collecting user feedback and crash reports from your application.

### Installation

```bash
npm install @oasis/sdk
```

### Setup

1. Create an SDK key in the Oasis dashboard under your app's "SDK Keys" section
2. Initialize the SDK in your application:

```typescript
import { initOasis } from '@oasis/sdk';

const oasis = initOasis({
  apiKey: 'pk_my-app_a1b2c3d4e5f6g7h8',  // Your SDK key
  serverUrl: 'https://your-oasis-server.com',
  appVersion: '1.2.3',
  enableAutoCrashReporting: true,  // Auto-capture uncaught errors
});

// Submit feedback
await oasis.feedback.reportBug('The save button does not work');
await oasis.feedback.requestFeature('Add dark mode support');

// Manual crash reporting
try {
  riskyOperation();
} catch (error) {
  oasis.crashes.captureException(error);
}
```

### Features

- **Feedback Categories**: Bug reports, feature requests, and general feedback
- **Automatic Crash Capture**: Uncaught errors and promise rejections
- **Breadcrumbs**: Automatic tracking of navigation, clicks, and network requests
- **Offline Support**: Events are queued and sent when connectivity is restored
- **Device Info**: Automatic collection of platform, OS, screen size, etc.

For complete SDK documentation, see the [SDK README](./sdk/README.md).

## Tauri Configuration

Configure your Tauri app to use the update server:

```json
{
  "tauri": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://your-oasis-server.com/your-app/update/{{target}}/{{current_version}}"
      ],
      "pubkey": "YOUR_PUBLIC_KEY"
    }
  }
}
```

## Development

### Running Tests

```bash
cd server
npm test

# With coverage
npm run test:coverage
```

### Database Migrations

```bash
cd server

# Generate migration from schema changes
npm run db:generate

# Apply migrations
npm run db:push

# Open Drizzle Studio
npm run db:studio
```

## License

MIT
