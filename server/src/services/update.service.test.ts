import { describe, it, expect } from "vitest";
import { normalizePlatform } from "./update.service.js";

describe("update service", () => {
  describe("normalizePlatform", () => {
    it("normalizes standard platform strings", () => {
      expect(normalizePlatform("darwin-aarch64")).toBe("darwin-aarch64");
      expect(normalizePlatform("darwin-x86_64")).toBe("darwin-x86_64");
      expect(normalizePlatform("linux-x86_64")).toBe("linux-x86_64");
      expect(normalizePlatform("windows-x86_64")).toBe("windows-x86_64");
    });

    it("handles case insensitivity", () => {
      expect(normalizePlatform("DARWIN-AARCH64")).toBe("darwin-aarch64");
      expect(normalizePlatform("Darwin-Aarch64")).toBe("darwin-aarch64");
    });

    it("maps common aliases", () => {
      expect(normalizePlatform("macos-aarch64")).toBe("darwin-aarch64");
      expect(normalizePlatform("osx-x86_64")).toBe("darwin-x86_64");
      expect(normalizePlatform("win64")).toBe("windows-x86_64");
      expect(normalizePlatform("linux64")).toBe("linux-x86_64");
    });

    it("handles whitespace", () => {
      expect(normalizePlatform("  darwin-aarch64  ")).toBe("darwin-aarch64");
    });

    it("returns normalized string for unknown platforms", () => {
      expect(normalizePlatform("unknown")).toBe("unknown");
      expect(normalizePlatform("custom-platform")).toBe("custom-platform");
    });
  });
});
