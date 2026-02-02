#!/usr/bin/env tsx
/**
 * Script to create an initial admin API key.
 * Run with: npx tsx scripts/create-admin-key.ts [optional-name]
 */

import { db } from "../src/db/index.js";
import { apiKeys } from "../src/db/schema.js";
import { ulid } from "ulid";
import { createHash, randomBytes } from "crypto";

const API_KEY_PREFIX = "uk_live_";

function generateApiKey(): string {
  const randomPart = randomBytes(16).toString("hex");
  return `${API_KEY_PREFIX}${randomPart}`;
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

async function main() {
  const name = process.argv[2] || "Initial Admin Key";

  console.log("Creating admin API key...\n");

  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);
  const id = ulid();

  await db.insert(apiKeys).values({
    id,
    name,
    keyHash,
    scope: "admin",
    appId: null,
    lastUsedAt: null,
    createdAt: new Date(),
    revokedAt: null,
  });

  console.log("✅ Admin API key created successfully!\n");
  console.log("┌─────────────────────────────────────────────────────────┐");
  console.log("│  IMPORTANT: Save this key now - it won't be shown again │");
  console.log("└─────────────────────────────────────────────────────────┘\n");
  console.log(`   API Key: ${rawKey}\n`);
  console.log(`   Name: ${name}`);
  console.log(`   Scope: admin`);
  console.log(`   ID: ${id}\n`);
  console.log("Use this key in the dashboard login or API Authorization header:");
  console.log(`   Authorization: Bearer ${rawKey}\n`);
}

main().catch((err) => {
  console.error("Failed to create API key:", err);
  process.exit(1);
});
