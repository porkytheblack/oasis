import { describe, it, expect } from "vitest";
import { parseSemver, compareSemver, isNewerVersion, isValidSemver, formatSemver, sortVersionsDescending } from "./semver.js";

describe("semver utilities", () => {
  describe("parseSemver", () => {
    it("parses basic version strings", () => {
      expect(parseSemver("1.0.0")).toEqual({ major: 1, minor: 0, patch: 0, prerelease: [], build: [] });
      expect(parseSemver("2.3.4")).toEqual({ major: 2, minor: 3, patch: 4, prerelease: [], build: [] });
      expect(parseSemver("10.20.30")).toEqual({ major: 10, minor: 20, patch: 30, prerelease: [], build: [] });
    });

    it("parses version with prerelease", () => {
      const result = parseSemver("1.0.0-alpha.1");
      expect(result).toEqual({
        major: 1,
        minor: 0,
        patch: 0,
        prerelease: ["alpha", "1"],
        build: [],
      });
    });

    it("parses version with build metadata", () => {
      const result = parseSemver("1.0.0+build.123");
      expect(result).toEqual({
        major: 1,
        minor: 0,
        patch: 0,
        prerelease: [],
        build: ["build", "123"],
      });
    });

    it("parses version with both prerelease and build", () => {
      const result = parseSemver("1.0.0-beta.2+build.456");
      expect(result).toEqual({
        major: 1,
        minor: 0,
        patch: 0,
        prerelease: ["beta", "2"],
        build: ["build", "456"],
      });
    });

    it("returns null for invalid versions", () => {
      expect(parseSemver("invalid")).toBeNull();
      expect(parseSemver("1.0")).toBeNull();
      expect(parseSemver("")).toBeNull();
      expect(parseSemver("1.2.3.4")).toBeNull();
    });
  });

  describe("compareSemver", () => {
    it("returns 0 for equal versions", () => {
      const v1 = parseSemver("1.0.0")!;
      const v2 = parseSemver("1.0.0")!;
      expect(compareSemver(v1, v2)).toBe(0);
    });

    it("compares major versions correctly", () => {
      const v1 = parseSemver("2.0.0")!;
      const v2 = parseSemver("1.0.0")!;
      expect(compareSemver(v1, v2)).toBe(1);
      expect(compareSemver(v2, v1)).toBe(-1);
    });

    it("compares minor versions correctly", () => {
      const v1 = parseSemver("1.2.0")!;
      const v2 = parseSemver("1.1.0")!;
      expect(compareSemver(v1, v2)).toBe(1);
      expect(compareSemver(v2, v1)).toBe(-1);
    });

    it("compares patch versions correctly", () => {
      const v1 = parseSemver("1.0.2")!;
      const v2 = parseSemver("1.0.1")!;
      expect(compareSemver(v1, v2)).toBe(1);
      expect(compareSemver(v2, v1)).toBe(-1);
    });

    it("prereleases are less than releases", () => {
      const v1 = parseSemver("1.0.0")!;
      const v2 = parseSemver("1.0.0-alpha")!;
      expect(compareSemver(v1, v2)).toBe(1);
      expect(compareSemver(v2, v1)).toBe(-1);
    });

    it("compares prerelease identifiers correctly", () => {
      const alpha = parseSemver("1.0.0-alpha")!;
      const alpha1 = parseSemver("1.0.0-alpha.1")!;
      const beta = parseSemver("1.0.0-beta")!;
      expect(compareSemver(alpha1, alpha)).toBe(1);
      expect(compareSemver(beta, alpha)).toBe(1);
    });
  });

  describe("isNewerVersion", () => {
    it("returns true when available is newer", () => {
      expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
      expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
      expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
    });

    it("returns false when available is same or older", () => {
      expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
      expect(isNewerVersion("2.0.0", "1.0.0")).toBe(false);
      expect(isNewerVersion("1.1.0", "1.0.0")).toBe(false);
    });

    it("returns false for invalid versions", () => {
      expect(isNewerVersion("invalid", "1.0.0")).toBe(false);
      expect(isNewerVersion("1.0.0", "invalid")).toBe(false);
    });

    it("handles prerelease to release upgrades", () => {
      expect(isNewerVersion("1.0.0-alpha", "1.0.0")).toBe(true);
      expect(isNewerVersion("1.0.0", "1.0.0-alpha")).toBe(false);
    });
  });

  describe("isValidSemver", () => {
    it("returns true for valid versions", () => {
      expect(isValidSemver("1.0.0")).toBe(true);
      expect(isValidSemver("1.0.0-alpha")).toBe(true);
      expect(isValidSemver("1.0.0+build")).toBe(true);
      expect(isValidSemver("1.0.0-beta.1+build.123")).toBe(true);
    });

    it("returns false for invalid versions", () => {
      expect(isValidSemver("invalid")).toBe(false);
      expect(isValidSemver("1.0")).toBe(false);
      expect(isValidSemver("")).toBe(false);
      expect(isValidSemver("v1.0.0")).toBe(false);
    });
  });

  describe("formatSemver", () => {
    it("formats basic versions", () => {
      expect(formatSemver({ major: 1, minor: 2, patch: 3, prerelease: [], build: [] })).toBe("1.2.3");
    });

    it("formats versions with prerelease", () => {
      expect(formatSemver({ major: 1, minor: 0, patch: 0, prerelease: ["alpha"], build: [] })).toBe("1.0.0-alpha");
    });

    it("formats versions with build metadata", () => {
      expect(formatSemver({ major: 1, minor: 0, patch: 0, prerelease: [], build: ["build", "123"] })).toBe("1.0.0+build.123");
    });

    it("formats versions with both prerelease and build", () => {
      expect(formatSemver({ major: 1, minor: 0, patch: 0, prerelease: ["beta", "1"], build: ["001"] })).toBe("1.0.0-beta.1+001");
    });
  });

  describe("sortVersionsDescending", () => {
    it("sorts versions in descending order", () => {
      const versions = ["1.0.0", "2.0.0", "1.5.0", "1.0.1"];
      expect(sortVersionsDescending(versions)).toEqual(["2.0.0", "1.5.0", "1.0.1", "1.0.0"]);
    });

    it("handles prereleases correctly", () => {
      const versions = ["1.0.0", "1.0.0-alpha", "1.0.0-beta"];
      expect(sortVersionsDescending(versions)).toEqual(["1.0.0", "1.0.0-beta", "1.0.0-alpha"]);
    });

    it("puts invalid versions at the end", () => {
      const versions = ["1.0.0", "invalid", "2.0.0"];
      expect(sortVersionsDescending(versions)).toEqual(["2.0.0", "1.0.0", "invalid"]);
    });

    it("does not mutate the original array", () => {
      const versions = ["1.0.0", "2.0.0"];
      sortVersionsDescending(versions);
      expect(versions).toEqual(["1.0.0", "2.0.0"]);
    });
  });
});
