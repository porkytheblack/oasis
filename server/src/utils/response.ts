import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ErrorCode,
  PaginatedResponse,
} from "../types/index.js";
import { ErrorCodes } from "../types/index.js";

/**
 * Creates a standardized success response.
 *
 * @param c - Hono context
 * @param data - The data to return
 * @param status - HTTP status code (default: 200)
 * @returns JSON response with success wrapper
 */
export function success<T>(
  c: Context,
  data: T,
  status: ContentfulStatusCode = 200
): Response {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
  };
  return c.json(response, status);
}

/**
 * Creates a standardized error response.
 *
 * @param c - Hono context
 * @param code - Error code from ErrorCodes
 * @param message - Human-readable error message
 * @param status - HTTP status code
 * @param details - Optional additional details
 * @returns JSON response with error wrapper
 */
export function error(
  c: Context,
  code: ErrorCode,
  message: string,
  status: ContentfulStatusCode,
  details?: unknown
): Response {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
  };
  return c.json(response, status);
}

/**
 * Creates a 404 Not Found response.
 *
 * @param c - Hono context
 * @param resource - The type of resource that was not found
 * @param identifier - The identifier that was looked up
 * @returns JSON response with 404 status
 */
export function notFound(
  c: Context,
  resource: string,
  identifier?: string
): Response {
  const message = identifier
    ? `${resource} with identifier '${identifier}' was not found`
    : `${resource} was not found`;

  return error(c, ErrorCodes.NOT_FOUND, message, 404);
}

/**
 * Creates a 409 Conflict response.
 *
 * @param c - Hono context
 * @param message - Description of the conflict
 * @returns JSON response with 409 status
 */
export function conflict(c: Context, message: string): Response {
  return error(c, ErrorCodes.CONFLICT, message, 409);
}

/**
 * Creates a 400 Bad Request response for validation errors.
 *
 * @param c - Hono context
 * @param message - Description of the validation error
 * @param details - Validation error details
 * @returns JSON response with 400 status
 */
export function validationError(
  c: Context,
  message: string,
  details?: unknown
): Response {
  return error(c, ErrorCodes.VALIDATION_ERROR, message, 400, details);
}

/**
 * Formats Zod validation errors into a user-friendly structure.
 *
 * @param zodError - The ZodError to format
 * @returns Formatted error details
 */
export function formatZodError(zodError: ZodError): {
  message: string;
  fields: Record<string, string[]>;
} {
  const fields: Record<string, string[]> = {};

  for (const issue of zodError.errors) {
    const path = issue.path.join(".") || "_root";
    if (!fields[path]) {
      fields[path] = [];
    }
    fields[path].push(issue.message);
  }

  const firstError = zodError.errors[0];
  const message = firstError
    ? `Validation failed: ${firstError.message}`
    : "Validation failed";

  return { message, fields };
}

/**
 * Creates a 400 Bad Request response from a ZodError.
 *
 * @param c - Hono context
 * @param zodError - The ZodError to convert
 * @returns JSON response with 400 status and formatted validation errors
 */
export function zodValidationError(c: Context, zodError: ZodError): Response {
  const { message, fields } = formatZodError(zodError);
  return validationError(c, message, { fields });
}

/**
 * Creates a 401 Unauthorized response.
 *
 * @param c - Hono context
 * @param message - Optional custom message
 * @returns JSON response with 401 status
 */
export function unauthorized(
  c: Context,
  message = "Authentication required"
): Response {
  return error(c, ErrorCodes.UNAUTHORIZED, message, 401);
}

/**
 * Creates a 403 Forbidden response.
 *
 * @param c - Hono context
 * @param message - Optional custom message
 * @returns JSON response with 403 status
 */
export function forbidden(
  c: Context,
  message = "You do not have permission to perform this action"
): Response {
  return error(c, ErrorCodes.FORBIDDEN, message, 403);
}

/**
 * Creates a 500 Internal Server Error response.
 *
 * @param c - Hono context
 * @param message - Optional custom message (defaults to generic message for security)
 * @returns JSON response with 500 status
 */
export function internalError(
  c: Context,
  message = "An unexpected error occurred"
): Response {
  return error(c, ErrorCodes.INTERNAL_ERROR, message, 500);
}

/**
 * Creates a 500 Database Error response.
 *
 * @param c - Hono context
 * @param message - Optional custom message
 * @returns JSON response with 500 status
 */
export function databaseError(
  c: Context,
  message = "A database error occurred"
): Response {
  return error(c, ErrorCodes.DATABASE_ERROR, message, 500);
}

/**
 * Creates a paginated success response.
 *
 * @param c - Hono context
 * @param items - Array of items for the current page
 * @param page - Current page number
 * @param limit - Number of items per page
 * @param total - Total number of items across all pages
 * @returns JSON response with pagination metadata
 */
export function paginated<T>(
  c: Context,
  items: T[],
  page: number,
  limit: number,
  total: number
): Response {
  const totalPages = Math.ceil(total / limit);

  const response: ApiSuccessResponse<PaginatedResponse<T>> = {
    success: true,
    data: {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    },
  };

  return c.json(response, 200);
}

/**
 * Creates a 201 Created response.
 *
 * @param c - Hono context
 * @param data - The created resource
 * @returns JSON response with 201 status
 */
export function created<T>(c: Context, data: T): Response {
  return success(c, data, 201);
}

/**
 * Creates a 204 No Content response.
 *
 * @param c - Hono context
 * @returns Empty response with 204 status
 */
export function noContent(c: Context): Response {
  return c.body(null, 204);
}
