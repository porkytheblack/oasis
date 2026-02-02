import { describe, it, expect } from "vitest";
import {
  appSlugSchema,
  semverSchema,
  platformSchema,
  releaseStatusSchema,
  apiKeyScopeSchema,
  ulidSchema,
  createAppSchema,
  updateAppSchema,
  createReleaseSchema,
  createApiKeySchema,
  paginationSchema,
  ciReleaseSchema,
} from "./index.js";

describe("Zod schemas", () => {
  describe("appSlugSchema", () => {
    it("accepts valid slugs", () => {
      expect(appSlugSchema.safeParse("my-app").success).toBe(true);
      expect(appSlugSchema.safeParse("app123").success).toBe(true);
      expect(appSlugSchema.safeParse("my-cool-app").success).toBe(true);
      expect(appSlugSchema.safeParse("ab").success).toBe(true);
    });

    it("rejects invalid slugs", () => {
      // Too short
      expect(appSlugSchema.safeParse("a").success).toBe(false);
      // Starts with number
      expect(appSlugSchema.safeParse("1app").success).toBe(false);
      // Contains uppercase
      expect(appSlugSchema.safeParse("MyApp").success).toBe(false);
      // Consecutive hyphens
      expect(appSlugSchema.safeParse("my--app").success).toBe(false);
      // Ends with hyphen
      expect(appSlugSchema.safeParse("my-app-").success).toBe(false);
    });
  });

  describe("semverSchema", () => {
    it("accepts valid semver", () => {
      expect(semverSchema.safeParse("1.0.0").success).toBe(true);
      expect(semverSchema.safeParse("0.0.1").success).toBe(true);
      expect(semverSchema.safeParse("1.0.0-alpha.1").success).toBe(true);
      expect(semverSchema.safeParse("1.0.0+build.123").success).toBe(true);
      expect(semverSchema.safeParse("1.0.0-beta.2+build.456").success).toBe(true);
    });

    it("rejects invalid semver", () => {
      expect(semverSchema.safeParse("1.0").success).toBe(false);
      expect(semverSchema.safeParse("v1.0.0").success).toBe(false);
      expect(semverSchema.safeParse("1").success).toBe(false);
      expect(semverSchema.safeParse("invalid").success).toBe(false);
    });
  });

  describe("platformSchema", () => {
    it("accepts valid platforms", () => {
      expect(platformSchema.safeParse("darwin-aarch64").success).toBe(true);
      expect(platformSchema.safeParse("darwin-x86_64").success).toBe(true);
      expect(platformSchema.safeParse("linux-x86_64").success).toBe(true);
      expect(platformSchema.safeParse("windows-x86_64").success).toBe(true);
    });

    it("rejects invalid platforms", () => {
      expect(platformSchema.safeParse("macos").success).toBe(false);
      expect(platformSchema.safeParse("unknown").success).toBe(false);
    });
  });

  describe("releaseStatusSchema", () => {
    it("accepts valid statuses", () => {
      expect(releaseStatusSchema.safeParse("draft").success).toBe(true);
      expect(releaseStatusSchema.safeParse("published").success).toBe(true);
      expect(releaseStatusSchema.safeParse("archived").success).toBe(true);
    });

    it("rejects invalid statuses", () => {
      expect(releaseStatusSchema.safeParse("pending").success).toBe(false);
      expect(releaseStatusSchema.safeParse("active").success).toBe(false);
    });
  });

  describe("apiKeyScopeSchema", () => {
    it("accepts valid scopes", () => {
      expect(apiKeyScopeSchema.safeParse("ci").success).toBe(true);
      expect(apiKeyScopeSchema.safeParse("admin").success).toBe(true);
    });

    it("rejects invalid scopes", () => {
      expect(apiKeyScopeSchema.safeParse("read").success).toBe(false);
      expect(apiKeyScopeSchema.safeParse("write").success).toBe(false);
    });
  });

  describe("ulidSchema", () => {
    it("accepts valid ULIDs", () => {
      expect(ulidSchema.safeParse("01HQWX5K8J2MXPZ9Y7VBNC3DFE").success).toBe(true);
    });

    it("rejects invalid ULIDs", () => {
      // Wrong length
      expect(ulidSchema.safeParse("01HQWX5K8J2M").success).toBe(false);
      // Contains invalid characters
      expect(ulidSchema.safeParse("01HQWX5K8J2MXPZ9Y7VBNC3DFI").success).toBe(false);
    });
  });

  describe("createAppSchema", () => {
    it("accepts valid app creation data", () => {
      const result = createAppSchema.safeParse({
        slug: "my-app",
        name: "My App",
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional fields", () => {
      const result = createAppSchema.safeParse({
        slug: "my-app",
        name: "My App",
        description: "A description",
        publicKey: "-----BEGIN PUBLIC KEY-----",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing required fields", () => {
      expect(createAppSchema.safeParse({ slug: "my-app" }).success).toBe(false);
      expect(createAppSchema.safeParse({ name: "My App" }).success).toBe(false);
    });
  });

  describe("updateAppSchema", () => {
    it("accepts partial updates", () => {
      expect(updateAppSchema.safeParse({ name: "New Name" }).success).toBe(true);
      expect(updateAppSchema.safeParse({ description: "New description" }).success).toBe(true);
      expect(updateAppSchema.safeParse({}).success).toBe(true);
    });

    it("accepts null values for nullable fields", () => {
      expect(updateAppSchema.safeParse({ description: null }).success).toBe(true);
      expect(updateAppSchema.safeParse({ publicKey: null }).success).toBe(true);
    });
  });

  describe("createReleaseSchema", () => {
    it("accepts valid release data", () => {
      expect(createReleaseSchema.safeParse({ version: "1.0.0" }).success).toBe(true);
      expect(
        createReleaseSchema.safeParse({
          version: "1.0.0",
          notes: "Release notes",
          status: "draft",
        }).success
      ).toBe(true);
    });

    it("defaults status to draft", () => {
      const result = createReleaseSchema.parse({ version: "1.0.0" });
      expect(result.status).toBe("draft");
    });
  });

  describe("createApiKeySchema", () => {
    it("accepts valid API key data", () => {
      expect(
        createApiKeySchema.safeParse({
          name: "CI Key",
          scope: "ci",
        }).success
      ).toBe(true);
    });

    it("accepts optional appId", () => {
      expect(
        createApiKeySchema.safeParse({
          name: "CI Key",
          scope: "ci",
          appId: "01HQWX5K8J2MXPZ9Y7VBNC3DFE",
        }).success
      ).toBe(true);
    });
  });

  describe("paginationSchema", () => {
    it("provides defaults", () => {
      const result = paginationSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it("coerces string values", () => {
      const result = paginationSchema.parse({ page: "2", limit: "10" });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });

    it("enforces max limit", () => {
      expect(paginationSchema.safeParse({ limit: 200 }).success).toBe(false);
      expect(paginationSchema.safeParse({ limit: 100 }).success).toBe(true);
    });
  });

  describe("ciReleaseSchema", () => {
    it("accepts valid CI release data", () => {
      const result = ciReleaseSchema.safeParse({
        version: "1.0.0",
        artifacts: [
          {
            platform: "darwin-aarch64",
            signature: "base64signature",
            r2_key: "my-app/releases/1.0.0/app.tar.gz",
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("requires at least one artifact", () => {
      const result = ciReleaseSchema.safeParse({
        version: "1.0.0",
        artifacts: [],
      });
      expect(result.success).toBe(false);
    });

    it("defaults auto_publish to false", () => {
      const result = ciReleaseSchema.parse({
        version: "1.0.0",
        artifacts: [
          {
            platform: "darwin-aarch64",
            signature: "sig",
            r2_key: "key",
          },
        ],
      });
      expect(result.auto_publish).toBe(false);
    });
  });
});
