import { eq, and, desc, count, like, or } from "drizzle-orm";
import { ulid } from "ulid";
import { db, feedback } from "../db/index.js";
import type { Feedback, NewFeedback } from "../db/schema.js";
import type {
  FeedbackDto,
  FeedbackCategory,
  FeedbackStatus,
  SubmitFeedbackDto,
  UpdateFeedbackDto,
  Attachment,
  DeviceInfo,
  ListFeedbackQuery,
} from "../types/index.js";

/**
 * Error thrown when feedback is not found
 */
export class FeedbackNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Feedback with identifier '${identifier}' was not found`);
    this.name = "FeedbackNotFoundError";
  }
}

/**
 * Converts a database Feedback record to a FeedbackDto for API responses.
 *
 * @param fb - The database record
 * @returns The feedback DTO
 */
function toFeedbackDto(fb: Feedback): FeedbackDto {
  let deviceInfo: DeviceInfo | null = null;
  try {
    deviceInfo = fb.deviceInfo ? JSON.parse(fb.deviceInfo) : null;
  } catch {
    deviceInfo = null;
  }

  let attachments: Attachment[] = [];
  try {
    attachments = fb.attachments ? JSON.parse(fb.attachments) : [];
  } catch {
    attachments = [];
  }

  return {
    id: fb.id,
    appId: fb.appId,
    category: fb.category as FeedbackCategory,
    message: fb.message,
    email: fb.email,
    appVersion: fb.appVersion,
    platform: fb.platform,
    osVersion: fb.osVersion,
    deviceInfo,
    attachments,
    status: fb.status as FeedbackStatus,
    internalNotes: fb.internalNotes,
    createdAt: fb.createdAt.toISOString(),
    updatedAt: fb.updatedAt.toISOString(),
  };
}

/**
 * Submits new feedback from the SDK.
 *
 * @param appId - The app ID
 * @param publicKeyId - The public API key ID used for submission
 * @param data - The feedback data
 * @returns The created feedback DTO
 */
export async function submitFeedback(
  appId: string,
  publicKeyId: string,
  data: SubmitFeedbackDto
): Promise<FeedbackDto> {
  const now = new Date();

  // TODO: Handle attachment uploads to R2
  // For now, we just store the metadata
  const attachments: Attachment[] = [];

  const newFeedback: NewFeedback = {
    id: ulid(),
    appId,
    publicKeyId,
    category: data.category,
    message: data.message,
    email: data.email ?? null,
    appVersion: data.appVersion,
    platform: data.platform,
    osVersion: data.osVersion ?? null,
    deviceInfo: data.deviceInfo ? JSON.stringify(data.deviceInfo) : null,
    attachments: JSON.stringify(attachments),
    status: "open",
    internalNotes: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(feedback).values(newFeedback);

  return toFeedbackDto({
    ...newFeedback,
    createdAt: now,
    updatedAt: now,
  } as Feedback);
}

/**
 * Lists feedback for an app with filtering and pagination.
 *
 * @param appId - The app ID
 * @param query - Query parameters for filtering and pagination
 * @returns Object with items array and total count
 */
export async function listFeedback(
  appId: string,
  query: ListFeedbackQuery
): Promise<{ items: FeedbackDto[]; total: number }> {
  const { page, limit, status, category, version, search } = query;
  const offset = (page - 1) * limit;

  // Build where conditions
  const conditions = [eq(feedback.appId, appId)];

  if (status) {
    conditions.push(eq(feedback.status, status));
  }

  if (category) {
    conditions.push(eq(feedback.category, category));
  }

  if (version) {
    conditions.push(eq(feedback.appVersion, version));
  }

  if (search) {
    conditions.push(
      or(
        like(feedback.message, `%${search}%`),
        like(feedback.email, `%${search}%`)
      )!
    );
  }

  const whereClause = and(...conditions);

  const [feedbackList, countResult] = await Promise.all([
    db.query.feedback.findMany({
      where: whereClause,
      orderBy: desc(feedback.createdAt),
      limit,
      offset,
    }),
    db.select({ count: count() }).from(feedback).where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;
  const items = feedbackList.map(toFeedbackDto);

  return { items, total };
}

/**
 * Retrieves feedback by ID.
 *
 * @param id - The feedback ID
 * @returns The feedback DTO
 * @throws FeedbackNotFoundError if not found
 */
export async function getFeedbackById(id: string): Promise<FeedbackDto> {
  const fb = await db.query.feedback.findFirst({
    where: eq(feedback.id, id),
  });

  if (!fb) {
    throw new FeedbackNotFoundError(id);
  }

  return toFeedbackDto(fb);
}

/**
 * Retrieves feedback by ID, ensuring it belongs to the specified app.
 *
 * @param id - The feedback ID
 * @param appId - The app ID to verify ownership
 * @returns The feedback DTO
 * @throws FeedbackNotFoundError if not found or doesn't belong to app
 */
export async function getFeedbackByIdForApp(
  id: string,
  appId: string
): Promise<FeedbackDto> {
  const fb = await db.query.feedback.findFirst({
    where: and(eq(feedback.id, id), eq(feedback.appId, appId)),
  });

  if (!fb) {
    throw new FeedbackNotFoundError(id);
  }

  return toFeedbackDto(fb);
}

/**
 * Updates feedback (status, internal notes).
 *
 * @param id - The feedback ID
 * @param appId - The app ID to verify ownership
 * @param data - The update data
 * @returns The updated feedback DTO
 * @throws FeedbackNotFoundError if not found
 */
export async function updateFeedback(
  id: string,
  appId: string,
  data: UpdateFeedbackDto
): Promise<FeedbackDto> {
  const existing = await db.query.feedback.findFirst({
    where: and(eq(feedback.id, id), eq(feedback.appId, appId)),
  });

  if (!existing) {
    throw new FeedbackNotFoundError(id);
  }

  const now = new Date();
  const updateData: Partial<NewFeedback> = {
    updatedAt: now,
  };

  if (data.status !== undefined) {
    updateData.status = data.status;
  }

  if (data.internalNotes !== undefined) {
    updateData.internalNotes = data.internalNotes;
  }

  await db.update(feedback).set(updateData).where(eq(feedback.id, id));

  return toFeedbackDto({
    ...existing,
    ...updateData,
    updatedAt: now,
  } as Feedback);
}

/**
 * Deletes feedback by ID.
 *
 * @param id - The feedback ID
 * @param appId - The app ID to verify ownership
 * @throws FeedbackNotFoundError if not found
 */
export async function deleteFeedback(id: string, appId: string): Promise<void> {
  const existing = await db.query.feedback.findFirst({
    where: and(eq(feedback.id, id), eq(feedback.appId, appId)),
  });

  if (!existing) {
    throw new FeedbackNotFoundError(id);
  }

  // TODO: Delete attachments from R2

  await db.delete(feedback).where(eq(feedback.id, id));
}

/**
 * Gets feedback statistics for an app.
 *
 * @param appId - The app ID
 * @returns Feedback statistics
 */
export async function getFeedbackStats(appId: string): Promise<{
  total: number;
  byStatus: Record<FeedbackStatus, number>;
  byCategory: Record<FeedbackCategory, number>;
}> {
  const [statusCounts, categoryCounts, totalCount] = await Promise.all([
    db
      .select({
        status: feedback.status,
        count: count(),
      })
      .from(feedback)
      .where(eq(feedback.appId, appId))
      .groupBy(feedback.status),
    db
      .select({
        category: feedback.category,
        count: count(),
      })
      .from(feedback)
      .where(eq(feedback.appId, appId))
      .groupBy(feedback.category),
    db.select({ count: count() }).from(feedback).where(eq(feedback.appId, appId)),
  ]);

  const byStatus: Record<FeedbackStatus, number> = {
    open: 0,
    in_progress: 0,
    closed: 0,
  };

  for (const row of statusCounts) {
    byStatus[row.status as FeedbackStatus] = row.count;
  }

  const byCategory: Record<FeedbackCategory, number> = {
    bug: 0,
    feature: 0,
    general: 0,
  };

  for (const row of categoryCounts) {
    byCategory[row.category as FeedbackCategory] = row.count;
  }

  return {
    total: totalCount[0]?.count ?? 0,
    byStatus,
    byCategory,
  };
}

/**
 * Gets a list of unique app versions that have submitted feedback.
 *
 * @param appId - The app ID
 * @returns Array of version strings
 */
export async function getFeedbackVersions(appId: string): Promise<string[]> {
  const results = await db
    .selectDistinct({ version: feedback.appVersion })
    .from(feedback)
    .where(eq(feedback.appId, appId))
    .orderBy(desc(feedback.appVersion));

  return results.map((r) => r.version);
}
