/**
 * @oasis/sdk - Breadcrumb Collection
 *
 * Tracks user actions and events to provide context for crash reports.
 */

import type { Breadcrumb } from "./types.js";

/**
 * Breadcrumb manager for collecting user action context.
 */
export class BreadcrumbManager {
  private breadcrumbs: Breadcrumb[] = [];
  private maxBreadcrumbs: number;

  constructor(maxBreadcrumbs = 50) {
    this.maxBreadcrumbs = maxBreadcrumbs;
  }

  /**
   * Add a breadcrumb to the trail.
   *
   * @param breadcrumb - The breadcrumb to add
   */
  add(breadcrumb: Omit<Breadcrumb, "timestamp">): void {
    const crumb: Breadcrumb = {
      ...breadcrumb,
      timestamp: new Date().toISOString(),
    };

    this.breadcrumbs.push(crumb);

    // Keep only the most recent breadcrumbs
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.maxBreadcrumbs);
    }
  }

  /**
   * Add a navigation breadcrumb.
   *
   * @param from - Previous location/route
   * @param to - New location/route
   */
  addNavigation(from: string, to: string): void {
    this.add({
      type: "navigation",
      message: `Navigated from ${from} to ${to}`,
      data: { from, to },
    });
  }

  /**
   * Add a click breadcrumb.
   *
   * @param target - Description of the clicked element
   * @param data - Additional click data
   */
  addClick(target: string, data?: Record<string, unknown>): void {
    this.add({
      type: "click",
      message: `Clicked on ${target}`,
      data,
    });
  }

  /**
   * Add an HTTP request breadcrumb.
   *
   * @param method - HTTP method
   * @param url - Request URL
   * @param statusCode - Response status code (if available)
   */
  addHttp(method: string, url: string, statusCode?: number): void {
    this.add({
      type: "http",
      message: `${method} ${url}${statusCode ? ` [${statusCode}]` : ""}`,
      data: { method, url, statusCode },
    });
  }

  /**
   * Add a console breadcrumb.
   *
   * @param level - Console level (log, warn, error)
   * @param message - Console message
   */
  addConsole(level: "log" | "warn" | "error", message: string): void {
    this.add({
      type: "console",
      message: `[${level.toUpperCase()}] ${message}`,
      data: { level },
    });
  }

  /**
   * Add a user action breadcrumb.
   *
   * @param action - Action description
   * @param data - Additional action data
   */
  addUserAction(action: string, data?: Record<string, unknown>): void {
    this.add({
      type: "user",
      message: action,
      data,
    });
  }

  /**
   * Add a custom breadcrumb.
   *
   * @param type - Breadcrumb type
   * @param message - Breadcrumb message
   * @param data - Additional data
   */
  addCustom(type: string, message: string, data?: Record<string, unknown>): void {
    this.add({ type, message, data });
  }

  /**
   * Get all breadcrumbs.
   *
   * @returns Array of breadcrumbs
   */
  getAll(): Breadcrumb[] {
    return [...this.breadcrumbs];
  }

  /**
   * Clear all breadcrumbs.
   */
  clear(): void {
    this.breadcrumbs = [];
  }

  /**
   * Set the maximum number of breadcrumbs to keep.
   *
   * @param max - Maximum breadcrumb count
   */
  setMaxBreadcrumbs(max: number): void {
    this.maxBreadcrumbs = max;
    if (this.breadcrumbs.length > max) {
      this.breadcrumbs = this.breadcrumbs.slice(-max);
    }
  }
}

/**
 * Sets up automatic breadcrumb collection for browser environments.
 *
 * @param manager - The breadcrumb manager to use
 */
export function setupAutoBreadcrumbs(manager: BreadcrumbManager): () => void {
  const cleanupFns: Array<() => void> = [];

  // Only run in browser environments
  if (typeof window === "undefined") {
    return () => {};
  }

  // Track clicks
  const clickHandler = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target) {
      const description = getElementDescription(target);
      manager.addClick(description, {
        tagName: target.tagName,
        id: target.id || undefined,
        className: target.className || undefined,
      });
    }
  };
  window.addEventListener("click", clickHandler, true);
  cleanupFns.push(() => window.removeEventListener("click", clickHandler, true));

  // Track navigation (History API)
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    const from = window.location.href;
    originalPushState.apply(this, args);
    const to = window.location.href;
    if (from !== to) {
      manager.addNavigation(from, to);
    }
  };

  history.replaceState = function (...args) {
    const from = window.location.href;
    originalReplaceState.apply(this, args);
    const to = window.location.href;
    if (from !== to) {
      manager.addNavigation(from, to);
    }
  };

  const popstateHandler = () => {
    manager.add({
      type: "navigation",
      message: `Navigated to ${window.location.href}`,
      data: { url: window.location.href },
    });
  };
  window.addEventListener("popstate", popstateHandler);
  cleanupFns.push(() => window.removeEventListener("popstate", popstateHandler));

  cleanupFns.push(() => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
  });

  // Track console messages
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  console.log = function (...args) {
    manager.addConsole("log", args.map(String).join(" "));
    originalConsole.log.apply(console, args);
  };

  console.warn = function (...args) {
    manager.addConsole("warn", args.map(String).join(" "));
    originalConsole.warn.apply(console, args);
  };

  console.error = function (...args) {
    manager.addConsole("error", args.map(String).join(" "));
    originalConsole.error.apply(console, args);
  };

  cleanupFns.push(() => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  // Track fetch requests
  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";

    try {
      const response = await originalFetch.apply(this, [input, init]);
      manager.addHttp(method, url, response.status);
      return response;
    } catch (error) {
      manager.addHttp(method, url);
      throw error;
    }
  };
  cleanupFns.push(() => {
    window.fetch = originalFetch;
  });

  // Return cleanup function
  return () => {
    cleanupFns.forEach((fn) => fn());
  };
}

/**
 * Gets a human-readable description of an HTML element.
 *
 * @param element - The HTML element
 * @returns Description string
 */
function getElementDescription(element: HTMLElement): string {
  const tagName = element.tagName.toLowerCase();

  // Use aria-label if available
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    return ariaLabel;
  }

  // Use text content for buttons/links
  if (tagName === "button" || tagName === "a") {
    const text = element.textContent?.trim().slice(0, 50);
    if (text) {
      return `${tagName}: "${text}"`;
    }
  }

  // Use placeholder for inputs
  if (tagName === "input") {
    const placeholder = (element as HTMLInputElement).placeholder;
    if (placeholder) {
      return `input: "${placeholder}"`;
    }
    const type = (element as HTMLInputElement).type;
    return `input[type="${type}"]`;
  }

  // Fall back to id or class
  if (element.id) {
    return `${tagName}#${element.id}`;
  }

  if (element.className) {
    const classes = element.className.split(" ").slice(0, 2).join(".");
    return `${tagName}.${classes}`;
  }

  return tagName;
}
