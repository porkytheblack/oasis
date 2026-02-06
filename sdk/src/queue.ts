/**
 * @oasis/sdk - Offline Queue
 *
 * Handles queueing and retry of events when offline.
 */

import type { FeedbackEvent, CrashEvent, QueuedEvent } from "./types.js";

const STORAGE_KEY = "oasis_event_queue";
const MAX_QUEUE_SIZE = 100;
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Event queue manager for offline support.
 */
export class EventQueue {
  private queue: QueuedEvent[] = [];
  private processing = false;
  private sendFn: ((event: FeedbackEvent | CrashEvent) => Promise<void>) | null = null;

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Set the function used to send events.
   *
   * @param fn - The send function
   */
  setSendFunction(fn: (event: FeedbackEvent | CrashEvent) => Promise<void>): void {
    this.sendFn = fn;
  }

  /**
   * Add an event to the queue.
   *
   * @param event - The event to queue
   */
  enqueue(event: FeedbackEvent | CrashEvent): void {
    const queuedEvent: QueuedEvent = {
      id: this.generateId(),
      event,
      attempts: 0,
      createdAt: new Date().toISOString(),
    };

    this.queue.push(queuedEvent);

    // Enforce max queue size
    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.queue = this.queue.slice(-MAX_QUEUE_SIZE);
    }

    this.saveToStorage();
    this.processQueue();
  }

  /**
   * Process the queue, attempting to send events.
   */
  async processQueue(): Promise<void> {
    if (this.processing || !this.sendFn || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      // Process events in order
      while (this.queue.length > 0) {
        const queuedEvent = this.queue[0];
        if (!queuedEvent) break;

        try {
          await this.sendFn(queuedEvent.event);

          // Success - remove from queue
          this.queue.shift();
          this.saveToStorage();
        } catch (error) {
          // Failed - increment attempts
          queuedEvent.attempts++;
          queuedEvent.lastAttemptAt = new Date().toISOString();

          if (queuedEvent.attempts >= MAX_RETRY_ATTEMPTS) {
            // Too many attempts - remove from queue
            this.queue.shift();
          }

          this.saveToStorage();

          // Stop processing on failure (will retry later)
          break;
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Get the current queue size.
   *
   * @returns Number of events in the queue
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Clear the queue.
   */
  clear(): void {
    this.queue = [];
    this.saveToStorage();
  }

  /**
   * Load queue from localStorage.
   */
  private loadFromStorage(): void {
    if (typeof localStorage === "undefined") {
      return;
    }

    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        this.queue = JSON.parse(data);
      }
    } catch {
      // Invalid data - start fresh
      this.queue = [];
    }
  }

  /**
   * Save queue to localStorage.
   */
  private saveToStorage(): void {
    if (typeof localStorage === "undefined") {
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch {
      // Storage full or unavailable - ignore
    }
  }

  /**
   * Generate a unique ID for a queued event.
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

/**
 * Sets up online/offline listeners to trigger queue processing.
 *
 * @param queue - The event queue
 * @returns Cleanup function
 */
export function setupQueueListeners(queue: EventQueue): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onOnline = () => {
    queue.processQueue();
  };

  window.addEventListener("online", onOnline);

  return () => {
    window.removeEventListener("online", onOnline);
  };
}
