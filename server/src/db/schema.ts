import { pgTable, text, integer, index, unique, timestamp } from "drizzle-orm/pg-core";

/**
 * Applications table - represents each Tauri application that can receive updates
 */
export const apps = pgTable(
  "apps",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    publicKey: text("public_key"),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("apps_slug_idx").on(table.slug),
    index("apps_created_at_idx").on(table.createdAt),
  ]
);

/**
 * Releases table - represents versions of an application
 */
export const releases = pgTable(
  "releases",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    notes: text("notes"),
    pubDate: timestamp("pub_date", { mode: "date" }),
    status: text("status", { enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("releases_app_version_unique").on(table.appId, table.version),
    index("releases_app_id_idx").on(table.appId),
    index("releases_status_idx").on(table.status),
    index("releases_pub_date_idx").on(table.pubDate),
    index("releases_app_status_idx").on(table.appId, table.status),
  ]
);

/**
 * Artifacts table - represents platform-specific binaries for a release
 */
export const artifacts = pgTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    signature: text("signature"),
    r2Key: text("r2_key"),
    downloadUrl: text("download_url"),
    fileSize: integer("file_size"),
    checksum: text("checksum"),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("artifacts_release_platform_unique").on(table.releaseId, table.platform),
    index("artifacts_release_id_idx").on(table.releaseId),
    index("artifacts_platform_idx").on(table.platform),
  ]
);

/**
 * API Keys table - for authenticating CI/CD pipelines and admin access
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    appId: text("app_id").references(() => apps.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    scope: text("scope", { enum: ["ci", "admin"] }).notNull(),
    lastUsedAt: timestamp("last_used_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
  },
  (table) => [
    index("api_keys_app_id_idx").on(table.appId),
    index("api_keys_key_hash_idx").on(table.keyHash),
    index("api_keys_scope_idx").on(table.scope),
  ]
);

/**
 * Installers table - represents downloadable installer files for first-time users
 * These are separate from artifacts, which are for in-app updates
 */
export const installers = pgTable(
  "installers",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    filename: text("filename").notNull(),
    displayName: text("display_name"),
    r2Key: text("r2_key"),
    downloadUrl: text("download_url"),
    fileSize: integer("file_size"),
    checksum: text("checksum"),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("installers_release_platform_unique").on(table.releaseId, table.platform),
    index("installers_release_id_idx").on(table.releaseId),
    index("installers_platform_idx").on(table.platform),
  ]
);

/**
 * Download Events table - for tracking download analytics
 * Supports both artifact downloads (updates) and installer downloads.
 * Either artifactId or installerId should be set, but not both.
 */
export const downloadEvents = pgTable(
  "download_events",
  {
    id: text("id").primaryKey(),
    // For update downloads (Tauri updater)
    artifactId: text("artifact_id")
      .references(() => artifacts.id, { onDelete: "cascade" }),
    // For installer downloads (standalone installers)
    installerId: text("installer_id")
      .references(() => installers.id, { onDelete: "cascade" }),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    version: text("version").notNull(),
    ipCountry: text("ip_country"),
    downloadType: text("download_type").notNull().default("update"),
    downloadedAt: timestamp("downloaded_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("download_events_artifact_id_idx").on(table.artifactId),
    index("download_events_installer_id_idx").on(table.installerId),
    index("download_events_app_id_idx").on(table.appId),
    index("download_events_downloaded_at_idx").on(table.downloadedAt),
    index("download_events_platform_idx").on(table.platform),
    index("download_events_app_platform_idx").on(table.appId, table.platform),
    index("download_events_download_type_idx").on(table.downloadType),
  ]
);

// Type exports for use throughout the application
export type App = typeof apps.$inferSelect;
export type NewApp = typeof apps.$inferInsert;
export type Release = typeof releases.$inferSelect;
export type NewRelease = typeof releases.$inferInsert;
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
export type Installer = typeof installers.$inferSelect;
export type NewInstaller = typeof installers.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type DownloadEvent = typeof downloadEvents.$inferSelect;
export type NewDownloadEvent = typeof downloadEvents.$inferInsert;

// ============================================================================
// Feedback and Crash Analytics Tables
// ============================================================================

/**
 * Public API Keys table - for authenticating SDK requests from client apps
 * These keys have limited permissions (only submit feedback/crashes)
 */
export const publicApiKeys = pgTable(
  "public_api_keys",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(), // First 16 chars for display
    lastUsedAt: timestamp("last_used_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
  },
  (table) => [
    index("public_api_keys_app_id_idx").on(table.appId),
    index("public_api_keys_key_hash_idx").on(table.keyHash),
  ]
);

/**
 * Feedback table - stores user feedback submissions from apps
 */
export const feedback = pgTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    publicKeyId: text("public_key_id")
      .references(() => publicApiKeys.id, { onDelete: "set null" }),

    // Content
    category: text("category", { enum: ["bug", "feature", "general"] }).notNull(),
    message: text("message").notNull(),
    email: text("email"),

    // Context
    appVersion: text("app_version").notNull(),
    platform: text("platform").notNull(),
    osVersion: text("os_version"),
    deviceInfo: text("device_info"), // JSON string

    // Attachments (stored as JSON array of R2 keys)
    attachments: text("attachments").default("[]"),

    // Management
    status: text("status", { enum: ["open", "in_progress", "closed"] })
      .notNull()
      .default("open"),
    internalNotes: text("internal_notes"),

    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("feedback_app_id_idx").on(table.appId),
    index("feedback_status_idx").on(table.status),
    index("feedback_category_idx").on(table.category),
    index("feedback_app_version_idx").on(table.appVersion),
    index("feedback_created_at_idx").on(table.createdAt),
    index("feedback_app_status_idx").on(table.appId, table.status),
  ]
);

/**
 * Crash Groups table - aggregates similar crashes by fingerprint
 */
export const crashGroups = pgTable(
  "crash_groups",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),

    // Identification
    fingerprint: text("fingerprint").notNull().unique(),

    // Representative error info
    errorType: text("error_type").notNull(),
    errorMessage: text("error_message").notNull(),

    // Statistics
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    affectedUsersCount: integer("affected_users_count").notNull().default(0),
    firstSeenAt: timestamp("first_seen_at", { mode: "date" }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { mode: "date" }).notNull(),

    // Affected versions/platforms (JSON arrays)
    affectedVersions: text("affected_versions").default("[]"),
    affectedPlatforms: text("affected_platforms").default("[]"),

    // Management
    status: text("status", { enum: ["new", "investigating", "resolved", "ignored"] })
      .notNull()
      .default("new"),
    assignedTo: text("assigned_to"),
    resolutionNotes: text("resolution_notes"),
    resolvedAt: timestamp("resolved_at", { mode: "date" }),

    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("crash_groups_app_id_idx").on(table.appId),
    index("crash_groups_fingerprint_idx").on(table.fingerprint),
    index("crash_groups_status_idx").on(table.status),
    index("crash_groups_last_seen_idx").on(table.lastSeenAt),
    index("crash_groups_count_idx").on(table.occurrenceCount),
    index("crash_groups_app_status_idx").on(table.appId, table.status),
  ]
);

/**
 * Crash Reports table - individual crash occurrences
 */
export const crashReports = pgTable(
  "crash_reports",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    crashGroupId: text("crash_group_id")
      .references(() => crashGroups.id, { onDelete: "set null" }),
    publicKeyId: text("public_key_id")
      .references(() => publicApiKeys.id, { onDelete: "set null" }),

    // Error details
    errorType: text("error_type").notNull(),
    errorMessage: text("error_message").notNull(),
    stackTrace: text("stack_trace").notNull(), // JSON array of stack frames

    // Context
    appVersion: text("app_version").notNull(),
    platform: text("platform").notNull(),
    osVersion: text("os_version"),
    deviceInfo: text("device_info"), // JSON string
    appState: text("app_state"), // JSON string - custom state at crash time
    breadcrumbs: text("breadcrumbs").default("[]"), // JSON array

    // Metadata
    fingerprint: text("fingerprint").notNull(),
    severity: text("severity", { enum: ["warning", "error", "fatal"] })
      .notNull()
      .default("error"),
    userId: text("user_id"), // Optional user identifier

    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("crash_reports_app_id_idx").on(table.appId),
    index("crash_reports_group_id_idx").on(table.crashGroupId),
    index("crash_reports_fingerprint_idx").on(table.fingerprint),
    index("crash_reports_app_version_idx").on(table.appVersion),
    index("crash_reports_created_at_idx").on(table.createdAt),
    index("crash_reports_app_created_idx").on(table.appId, table.createdAt),
  ]
);

// Type exports for feedback and crash analytics
export type PublicApiKey = typeof publicApiKeys.$inferSelect;
export type NewPublicApiKey = typeof publicApiKeys.$inferInsert;
export type Feedback = typeof feedback.$inferSelect;
export type NewFeedback = typeof feedback.$inferInsert;
export type CrashGroup = typeof crashGroups.$inferSelect;
export type NewCrashGroup = typeof crashGroups.$inferInsert;
export type CrashReport = typeof crashReports.$inferSelect;
export type NewCrashReport = typeof crashReports.$inferInsert;
