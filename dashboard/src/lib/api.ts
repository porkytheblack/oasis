import axios, { AxiosError, AxiosInstance, AxiosResponse } from "axios";
import type {
  App,
  CreateAppRequest,
  UpdateAppRequest,
  Release,
  CreateReleaseRequest,
  UpdateReleaseRequest,
  Artifact,
  CreateArtifactRequest,
  ApiKey,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  ApiError,
  PaginatedResponse,
  HealthCheckResponse,
  DetailedHealthResponse,
  PresignArtifactRequest,
  PresignArtifactResponse,
  ConfirmUploadRequest,
  ConfirmUploadResponse,
} from "./types";

/**
 * API Key prefix for validation.
 */
const API_KEY_PREFIX = "uk_live_";

/**
 * Gets the API base URL from localStorage with environment variable fallback.
 * Defaults to localhost:9090 for development.
 */
function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const storedUrl = localStorage.getItem("oasis_api_url");
    if (storedUrl) {
      return storedUrl;
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:9090";
}

/**
 * Sets the API URL in localStorage.
 */
export function setApiUrl(url: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("oasis_api_url", url);
  }
}

/**
 * Gets the current API URL.
 */
export function getApiUrl(): string {
  return getApiBaseUrl();
}

/**
 * Validates API key format - must start with uk_live_ prefix.
 */
export function validateApiKeyFormat(key: string): boolean {
  return key.startsWith(API_KEY_PREFIX) && key.length > API_KEY_PREFIX.length;
}

/**
 * Creates and configures the Axios instance for API requests.
 */
function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: getApiBaseUrl(),
    headers: {
      "Content-Type": "application/json",
    },
    timeout: 30000,
  });

  // Request interceptor for adding auth headers and dynamic base URL
  client.interceptors.request.use(
    (config) => {
      // Update base URL on each request in case it changed
      config.baseURL = getApiBaseUrl();

      // Add API key from localStorage if available
      if (typeof window !== "undefined") {
        const apiKey = localStorage.getItem("oasis_api_key");
        if (apiKey) {
          config.headers.Authorization = `Bearer ${apiKey}`;
        }
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor for error handling
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError<{ error?: string; message?: string }>) => {
      if (error.response) {
        const data = error.response.data;
        const apiError: ApiError = {
          error: data?.error || "unknown_error",
          message: data?.message || error.message || "An unknown error occurred",
          statusCode: error.response.status,
        };
        return Promise.reject(apiError);
      }
      if (error.request) {
        return Promise.reject({
          error: "network_error",
          message: "Unable to reach the server. Please check your connection.",
          statusCode: 0,
        } as ApiError);
      }
      return Promise.reject({
        error: "request_error",
        message: error.message || "Failed to make request",
        statusCode: 0,
      } as ApiError);
    }
  );

  return client;
}

/**
 * The configured API client instance.
 */
export const apiClient = createApiClient();

/**
 * Extracts data from an API response.
 * Handles both single item responses and paginated responses.
 */
function extractData<T>(response: AxiosResponse<{ success: boolean; data: T }>): T {
  return response.data.data;
}

/**
 * Extracts items from a paginated API response.
 * Server returns: { success: true, data: { items: [...], pagination: {...} } }
 */
function extractPaginatedItems<T>(
  response: AxiosResponse<{ success: boolean; data: PaginatedResponse<T> }>
): T[] {
  // Defensive handling for unexpected response shapes
  if (!response.data?.data?.items) {
    console.warn("Unexpected paginated response shape:", response.data);
    return [];
  }
  return response.data.data.items;
}

/**
 * Extracts full paginated response including pagination metadata.
 */
function extractPaginatedData<T>(
  response: AxiosResponse<{ success: boolean; data: PaginatedResponse<T> }>
): PaginatedResponse<T> {
  return response.data.data;
}

// =============================================================================
// Health Check API
// =============================================================================

/**
 * Performs a basic health check against the server.
 */
export async function checkHealth(): Promise<HealthCheckResponse> {
  const response = await apiClient.get<{ success: boolean; data: HealthCheckResponse }>("/health");
  return extractData(response);
}

/**
 * Performs a detailed health check including component status.
 */
export async function checkDetailedHealth(): Promise<DetailedHealthResponse> {
  const response = await apiClient.get<{ success: boolean; data: DetailedHealthResponse }>("/health/detailed");
  return extractData(response);
}

/**
 * Verifies if the current API key is valid by making a test request.
 */
export async function verifyApiKey(): Promise<boolean> {
  try {
    await apiClient.get("/admin/apps?per_page=1");
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Apps API
// =============================================================================

/**
 * Fetches all registered applications.
 */
export async function getApps(): Promise<App[]> {
  const response = await apiClient.get<{ success: boolean; data: PaginatedResponse<App> }>("/admin/apps");
  return extractPaginatedItems(response);
}

/**
 * Fetches applications with pagination metadata.
 */
export async function getAppsPaginated(page = 1, perPage = 50): Promise<PaginatedResponse<App>> {
  const response = await apiClient.get<{ success: boolean; data: PaginatedResponse<App> }>(
    `/admin/apps?page=${page}&per_page=${perPage}`
  );
  return extractPaginatedData(response);
}

/**
 * Fetches a single application by ID.
 */
export async function getApp(appId: string): Promise<App> {
  const response = await apiClient.get<{ success: boolean; data: App }>(`/admin/apps/${appId}`);
  return extractData(response);
}

/**
 * Creates a new application.
 */
export async function createApp(data: CreateAppRequest): Promise<App> {
  const response = await apiClient.post<{ success: boolean; data: App }>("/admin/apps", data);
  return extractData(response);
}

/**
 * Updates an existing application.
 */
export async function updateApp(
  appId: string,
  data: UpdateAppRequest
): Promise<App> {
  const response = await apiClient.patch<{ success: boolean; data: App }>(`/admin/apps/${appId}`, data);
  return extractData(response);
}

/**
 * Deletes an application.
 */
export async function deleteApp(appId: string): Promise<void> {
  await apiClient.delete(`/admin/apps/${appId}`);
}

// =============================================================================
// Releases API
// =============================================================================

/**
 * Fetches all releases for an application.
 */
export async function getReleases(appId: string): Promise<Release[]> {
  const response = await apiClient.get<{ success: boolean; data: PaginatedResponse<Release> }>(
    `/admin/apps/${appId}/releases`
  );
  return extractPaginatedItems(response);
}

/**
 * Fetches releases with pagination metadata.
 */
export async function getReleasesPaginated(
  appId: string,
  page = 1,
  perPage = 50
): Promise<PaginatedResponse<Release>> {
  const response = await apiClient.get<{ success: boolean; data: PaginatedResponse<Release> }>(
    `/admin/apps/${appId}/releases?page=${page}&per_page=${perPage}`
  );
  return extractPaginatedData(response);
}

/**
 * Fetches a single release by ID.
 */
export async function getRelease(
  appId: string,
  releaseId: string
): Promise<Release> {
  const response = await apiClient.get<{ success: boolean; data: Release }>(
    `/admin/apps/${appId}/releases/${releaseId}`
  );
  return extractData(response);
}

/**
 * Creates a new release for an application.
 */
export async function createRelease(
  appId: string,
  data: CreateReleaseRequest
): Promise<Release> {
  const response = await apiClient.post<{ success: boolean; data: Release }>(
    `/admin/apps/${appId}/releases`,
    data
  );
  return extractData(response);
}

/**
 * Updates an existing release.
 */
export async function updateRelease(
  appId: string,
  releaseId: string,
  data: UpdateReleaseRequest
): Promise<Release> {
  const response = await apiClient.patch<{ success: boolean; data: Release }>(
    `/admin/apps/${appId}/releases/${releaseId}`,
    data
  );
  return extractData(response);
}

/**
 * Publishes a draft release, making it available for updates.
 */
export async function publishRelease(
  appId: string,
  releaseId: string
): Promise<Release> {
  const response = await apiClient.post<{ success: boolean; data: Release }>(
    `/admin/apps/${appId}/releases/${releaseId}/publish`
  );
  return extractData(response);
}

/**
 * Archives a published release, removing it from the update feed.
 */
export async function archiveRelease(
  appId: string,
  releaseId: string
): Promise<Release> {
  const response = await apiClient.post<{ success: boolean; data: Release }>(
    `/admin/apps/${appId}/releases/${releaseId}/archive`
  );
  return extractData(response);
}

/**
 * Deletes a release (only allowed for draft releases).
 */
export async function deleteRelease(
  appId: string,
  releaseId: string
): Promise<void> {
  await apiClient.delete(`/admin/apps/${appId}/releases/${releaseId}`);
}

// =============================================================================
// Artifacts API
// =============================================================================

/**
 * Fetches all artifacts for a release.
 */
export async function getArtifacts(
  appId: string,
  releaseId: string
): Promise<Artifact[]> {
  const response = await apiClient.get<{ success: boolean; data: Artifact[] }>(
    `/admin/apps/${appId}/releases/${releaseId}/artifacts`
  );
  return extractData(response);
}

/**
 * Creates a new artifact with a direct download URL (without presigned upload).
 * Use this when you already have the file hosted elsewhere.
 */
export async function createArtifact(
  appId: string,
  releaseId: string,
  data: CreateArtifactRequest
): Promise<Artifact> {
  const response = await apiClient.post<{ success: boolean; data: Artifact }>(
    `/admin/apps/${appId}/releases/${releaseId}/artifacts`,
    data
  );
  return extractData(response);
}

/**
 * Generates a presigned URL for uploading an artifact directly to R2 storage.
 * This is the first step of the upload flow:
 * 1. Call presignArtifactUpload() to get the presigned URL
 * 2. Upload the file directly to R2 using uploadToPresignedUrl()
 * 3. Call confirmArtifactUpload() to verify and activate the artifact
 */
export async function presignArtifactUpload(
  appId: string,
  releaseId: string,
  data: PresignArtifactRequest
): Promise<PresignArtifactResponse> {
  const response = await apiClient.post<{ success: boolean; data: PresignArtifactResponse }>(
    `/admin/apps/${appId}/releases/${releaseId}/artifacts/presign`,
    data
  );
  return extractData(response);
}

/**
 * Confirms that an artifact has been uploaded to R2 and activates it.
 * This should be called after successfully uploading the file to the presigned URL.
 */
export async function confirmArtifactUpload(
  appId: string,
  releaseId: string,
  artifactId: string,
  data?: ConfirmUploadRequest
): Promise<ConfirmUploadResponse> {
  const response = await apiClient.post<{ success: boolean; data: ConfirmUploadResponse }>(
    `/admin/apps/${appId}/releases/${releaseId}/artifacts/${artifactId}/confirm`,
    data || {}
  );
  return extractData(response);
}

/**
 * Uploads a file to the presigned URL.
 * This uploads directly to storage (S3/R2) bypassing the API server.
 *
 * IMPORTANT: The contentType MUST match the contentType used when generating
 * the presigned URL, otherwise S3/R2 will return a 409 Conflict or 403 Forbidden
 * error due to signature mismatch.
 */
export async function uploadToPresignedUrl(
  url: string,
  file: File,
  contentType: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  await axios.put(url, file, {
    headers: {
      "Content-Type": contentType,
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const progress = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        onProgress(progress);
      }
    },
  });
}

/**
 * Deletes an artifact.
 */
export async function deleteArtifact(
  appId: string,
  releaseId: string,
  artifactId: string
): Promise<void> {
  await apiClient.delete(
    `/admin/apps/${appId}/releases/${releaseId}/artifacts/${artifactId}`
  );
}

// =============================================================================
// API Keys API
// =============================================================================

/**
 * Fetches all API keys (with sensitive portions redacted).
 */
export async function getApiKeys(): Promise<ApiKey[]> {
  const response = await apiClient.get<{ success: boolean; data: PaginatedResponse<ApiKey> }>("/admin/api-keys");
  return extractPaginatedItems(response);
}

/**
 * Fetches API keys with pagination metadata.
 */
export async function getApiKeysPaginated(page = 1, perPage = 50): Promise<PaginatedResponse<ApiKey>> {
  const response = await apiClient.get<{ success: boolean; data: PaginatedResponse<ApiKey> }>(
    `/admin/api-keys?page=${page}&per_page=${perPage}`
  );
  return extractPaginatedData(response);
}

/**
 * Creates a new API key. The full key is returned only once in the response.
 */
export async function createApiKey(
  data: CreateApiKeyRequest
): Promise<CreateApiKeyResponse> {
  const response = await apiClient.post<{ success: boolean; data: CreateApiKeyResponse }>(
    "/admin/api-keys",
    data
  );
  return extractData(response);
}

/**
 * Revokes an API key, preventing further use.
 */
export async function revokeApiKey(keyId: string): Promise<ApiKey> {
  const response = await apiClient.post<{ success: boolean; data: ApiKey }>(
    `/admin/api-keys/${keyId}/revoke`
  );
  return extractData(response);
}

/**
 * Deletes an API key permanently.
 */
export async function deleteApiKey(keyId: string): Promise<void> {
  await apiClient.delete(`/admin/api-keys/${keyId}`);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Sets the API key in localStorage for subsequent requests.
 */
export function setApiKey(key: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("oasis_api_key", key);
  }
}

/**
 * Gets the stored API key.
 */
export function getStoredApiKey(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem("oasis_api_key");
  }
  return null;
}

/**
 * Clears the stored API key.
 */
export function clearApiKey(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("oasis_api_key");
  }
}

/**
 * Checks if an API key is stored.
 */
export function hasApiKey(): boolean {
  if (typeof window !== "undefined") {
    return localStorage.getItem("oasis_api_key") !== null;
  }
  return false;
}

/**
 * Computes SHA-256 hash of a file.
 */
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Type guard to check if an error is an API error.
 */
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    "message" in error &&
    "statusCode" in error
  );
}

/**
 * Extracts a user-friendly error message from an error.
 */
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred";
}
