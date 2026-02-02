/**
 * Application configuration module.
 * Centralizes environment variable access with proper defaults.
 */

/**
 * Environment configuration interface.
 */
interface Config {
  /**
   * The base URL for the Oasis API server.
   * Defaults to http://localhost:9090 for local development.
   */
  apiUrl: string;

  /**
   * The URL to the project documentation.
   * Defaults to the official Oasis documentation.
   */
  docsUrl: string;

  /**
   * The URL to the project GitHub repository.
   */
  repositoryUrl: string;

  /**
   * Whether the app is running in development mode.
   */
  isDevelopment: boolean;

  /**
   * Whether the app is running in production mode.
   */
  isProduction: boolean;
}

/**
 * Retrieves the default API URL from environment variables.
 * Falls back to localhost:9090 for development environments.
 */
function getDefaultApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:9090";
}

/**
 * Retrieves the documentation URL from environment variables.
 */
function getDocsUrl(): string {
  return process.env.NEXT_PUBLIC_DOCS_URL || "https://github.com/dwillitzer/oasis";
}

/**
 * Retrieves the repository URL from environment variables.
 */
function getRepositoryUrl(): string {
  return process.env.NEXT_PUBLIC_REPOSITORY_URL || "https://github.com/dwillitzer/oasis";
}

/**
 * Application configuration object.
 * All environment variables are accessed through this object to ensure
 * consistent defaults and type safety.
 */
export const config: Config = {
  apiUrl: getDefaultApiUrl(),
  docsUrl: getDocsUrl(),
  repositoryUrl: getRepositoryUrl(),
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",
};

/**
 * Gets the default API URL.
 * This function can be called at runtime to get the current environment value.
 */
export function getDefaultApiUrlRuntime(): string {
  return getDefaultApiUrl();
}

/**
 * Gets the documentation URL.
 * This function can be called at runtime to get the current environment value.
 */
export function getDocsUrlRuntime(): string {
  return getDocsUrl();
}

/**
 * Gets the repository URL.
 * This function can be called at runtime to get the current environment value.
 */
export function getRepositoryUrlRuntime(): string {
  return getRepositoryUrl();
}
