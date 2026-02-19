---
name: oasis-setup
description: Guide for integrating Oasis into Tauri apps. Use when the user wants to set up Oasis SDK, configure auto-updates, add crash reporting, collect user feedback, or create a release workflow for their Tauri application.
---

# Oasis Integration Setup

Help the user integrate Oasis into their Tauri application.

## Instructions

Read the full integration guide at `references/integration-guide.md` and help the user with:

1. **SDK Installation & Setup**
   - Install `oasis-sdk` package
   - Initialize the SDK with proper configuration
   - Set up feedback collection UI
   - Enable crash reporting

2. **Tauri Configuration**
   - Configure auto-updater in `tauri.conf.json`
   - Set up the update endpoint URL
   - Add the public key for signature verification

3. **GitHub Actions Workflow**
   - Create release workflow using the reusable `tauri-release.yml`
   - Explain required secrets and how to obtain them
   - Set up proper workflow inputs

4. **Testing & Verification**
   - Test with dry_run mode first
   - Verify SDK events are sent
   - Confirm updates work end-to-end

## Key Files to Reference

- Integration guide: `references/integration-guide.md`
- Reusable workflow: `.github/workflows/tauri-release.yml`
- SDK source: `sdk/src/index.ts`
- SDK types: `sdk/src/types.ts`

## User Input Needed

Ask the user for:
- Their app slug (identifier for Oasis)
- Their Oasis server URL
- Whether they need macOS, Windows, and/or Linux support
- If they have Apple Developer credentials (for macOS signing)
