import { describe, it, expect } from "vitest";
import { hashApiKey } from "./auth.js";

describe("auth middleware", () => {
  describe("hashApiKey", () => {
    it("returns consistent hash for same input", () => {
      const key = "uk_live_abc123";
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);
      expect(hash1).toBe(hash2);
    });

    it("returns different hashes for different inputs", () => {
      const hash1 = hashApiKey("uk_live_key1");
      const hash2 = hashApiKey("uk_live_key2");
      expect(hash1).not.toBe(hash2);
    });

    it("returns a 64-character hex string (SHA-256)", () => {
      const hash = hashApiKey("uk_live_test");
      expect(hash.length).toBe(64);
      expect(/^[0-9a-f]+$/i.test(hash)).toBe(true);
    });
  });
});
