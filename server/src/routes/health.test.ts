import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { healthRoutes } from "./health.js";

interface HealthResponse {
  success: boolean;
  data: {
    status?: string;
    timestamp?: string;
    version?: string;
    alive?: boolean;
    ready?: boolean;
    checks?: {
      database: boolean;
    };
  };
}

describe("health routes", () => {
  const app = new Hono().route("/health", healthRoutes);

  describe("GET /health", () => {
    it("returns healthy status", async () => {
      const res = await app.request("/health");
      expect(res.status).toBe(200);

      const data = (await res.json()) as HealthResponse;
      expect(data.success).toBe(true);
      expect(data.data.status).toBe("healthy");
      expect(data.data.timestamp).toBeDefined();
      expect(data.data.version).toBeDefined();
    });
  });

  describe("GET /health/live", () => {
    it("returns liveness status", async () => {
      const res = await app.request("/health/live");
      expect(res.status).toBe(200);

      const data = (await res.json()) as HealthResponse;
      expect(data.success).toBe(true);
      expect(data.data.alive).toBe(true);
      expect(data.data.timestamp).toBeDefined();
    });
  });

  describe("GET /health/ready", () => {
    it("returns readiness status", async () => {
      const res = await app.request("/health/ready");
      // May return 200 or 503 depending on DB state
      expect([200, 503]).toContain(res.status);

      const data = (await res.json()) as HealthResponse;
      expect(data.success).toBe(true);
      expect(data.data.ready).toBeDefined();
      expect(data.data.checks).toBeDefined();
    });
  });
});
