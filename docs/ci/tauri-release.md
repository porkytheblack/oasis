# Tauri Release Workflow (Reusable) + Oasis Actions

This repo provides a reusable workflow and composite actions to build, sign, upload, and register Tauri releases with Oasis, plus optional GitHub Releases.

## What You Get

- Reusable workflow: `.github/workflows/tauri-release.yml`
- Composite action: `.github/actions/oasis-r2-upload`
- Composite action: `.github/actions/oasis-register-release`

## Usage In App Repos

Create a workflow in your app repo that calls the reusable workflow in this repo.

```yaml
name: Release

on:
  push:
    tags:
      - "v*"
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Dry run (skip uploads and registration)"
        required: false
        default: false
        type: boolean

jobs:
  release:
    uses: your-org/oasis/.github/workflows/tauri-release.yml@v1
    with:
      app_slug: rigid
      app_name: Rigid
      artifact_prefix: Rigid
      app_dir: app
      distribute_to: r2,oasis,github
      dry_run: ${{ inputs.dry_run }}
      r2_public_url: ${{ secrets.R2_PUBLIC_URL }}
    secrets: inherit
```

If you want to avoid `secrets: inherit`, pass each secret explicitly:

```yaml
    secrets:
      APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
      APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
      APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
      APPLE_ID: ${{ secrets.APPLE_ID }}
      APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
      APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
      TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      CLOUDFLARE_R2_ACCESS_KEY_ID: ${{ secrets.CLOUDFLARE_R2_ACCESS_KEY_ID }}
      CLOUDFLARE_R2_SECRET_ACCESS_KEY: ${{ secrets.CLOUDFLARE_R2_SECRET_ACCESS_KEY }}
      R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
      R2_PUBLIC_URL: ${{ secrets.R2_PUBLIC_URL }}
      OASIS_SERVER_URL: ${{ secrets.OASIS_SERVER_URL }}
      OASIS_CI_KEY: ${{ secrets.OASIS_CI_KEY }}
```

## Distribution Targets

Use `distribute_to` to choose where to ship artifacts.

- `r2` uploads installers and update bundles to R2
- `oasis` registers the release with Oasis
- `github` creates a GitHub Release

Example:

- `distribute_to: r2,oasis` to skip GitHub Releases
- `distribute_to: github` to only create a GitHub Release

## Inputs (Reusable Workflow)

- `app_slug` (required)
- `app_name` (required)
- `artifact_prefix` (required)
- `app_dir` (default: `app`)
- `artifacts_dir` (default: `artifacts`)
- `tauri_script` (default: `pnpm tauri`)
- `build_matrix` (default: macOS + Windows + Linux)
- `platforms` (default: `darwin-aarch64,darwin-x86_64,linux-x86_64,windows-x86_64`)
- `distribute_to` (default: `r2,oasis,github`)
- `dry_run` (default: `false`)
- `auto_publish` (default: `false`)
- `release_notes` (default: empty, auto-generated)
- `r2_public_url` (default: empty)

## Secrets (Reusable Workflow)

- Apple signing: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`
- Apple notarization: `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`
- Tauri update signing: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- R2: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
- Oasis: `OASIS_SERVER_URL`, `OASIS_CI_KEY`

## Composite Actions

### Oasis R2 Upload

Path: `.github/actions/oasis-r2-upload`

Inputs:

- `app_slug` (required)
- `version` (required)
- `installers_dir` (default: `artifacts/installers`)
- `updates_dir` (default: `artifacts/updates`)
- `installers_prefix` (default: `installers`)
- `updates_prefix` (default: `releases`)
- `r2_bucket` (required)
- `r2_account_id` (required)
- `r2_access_key_id` (required)
- `r2_secret_access_key` (required)
- `r2_acl` (default: `private`)
- `r2_endpoint` (optional)
- `dry_run` (default: `false`)

### Oasis Register Release

Path: `.github/actions/oasis-register-release`

Inputs:

- `app_slug` (required)
- `version` (required)
- `artifact_prefix` (required)
- `installers_dir` (default: `artifacts/installers`)
- `updates_dir` (default: `artifacts/updates`)
- `installers_prefix` (default: `installers`)
- `updates_prefix` (default: `releases`)
- `platforms` (default: `darwin-aarch64,darwin-x86_64,linux-x86_64,windows-x86_64`)
- `notes` (default: `Release v<version>`)
- `auto_publish` (default: `false`)
- `oasis_server_url` (required)
- `oasis_ci_key` (required)
- `dry_run` (default: `false`)

## Notes

- GitHub Releases use `r2_public_url` to generate download links. If it is empty, the release notes will not contain valid links.
- The default matrix and artifact naming follow the example workflow you provided. Customize `build_matrix`, `platforms`, and `artifact_prefix` to match your app.
