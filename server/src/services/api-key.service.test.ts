import { describe, it, expect } from "vitest";
import { generateApiKey } from "./api-key.service.js";

describe("api-key service", () => {
  describe("generateApiKey", () => {
    it("generates keys with correct prefix", () => {
      const key = generateApiKey();
      expect(key.startsWith("uk_live_")).toBe(true);
    });

    it("generates keys of correct length", () => {
      const key = generateApiKey();
      // "uk_live_" (8 chars) + 32 hex chars = 40 total
      expect(key.length).toBe(40);
    });

    it("generates unique keys", () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        keys.add(generateApiKey());
      }
      expect(keys.size).toBe(100);
    });

    it("generates keys with valid hex characters", () => {
      const key = generateApiKey();
      const hexPart = key.substring(8); // Remove "uk_live_" prefix
      expect(/^[0-9a-f]+$/i.test(hexPart)).toBe(true);
    });
  });
});
