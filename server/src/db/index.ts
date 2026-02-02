import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

/**
 * Get the database URL from environment or use default
 */
function getDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? "postgresql://oasis_user:oasis_password@localhost:5432/oasis";
}

/**
 * Create and configure the PostgreSQL connection pool
 */
function createPool(): Pool {
  const connectionString = getDatabaseUrl();

  const pool = new Pool({
    connectionString,
    // Connection pool settings
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection could not be established
  });

  // Log connection errors
  pool.on("error", (err: Error) => {
    console.error("Unexpected PostgreSQL pool error:", err);
  });

  return pool;
}

// Create the connection pool
const pool = createPool();

// Create the Drizzle ORM instance with schema
export const db = drizzle(pool, { schema });

// Export the pool for health checks and advanced operations
export { pool };

// Export schema for use in queries
export * from "./schema.js";

/**
 * Gracefully close the database connection pool
 */
async function closePool(): Promise<void> {
  console.log("Closing PostgreSQL connection pool...");
  try {
    await pool.end();
    console.log("PostgreSQL connection pool closed successfully");
  } catch (error) {
    console.error("Error closing PostgreSQL connection pool:", error);
    throw error;
  }
}

// Graceful shutdown handlers
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  await closePool();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully...");
  await closePool();
  process.exit(0);
});
