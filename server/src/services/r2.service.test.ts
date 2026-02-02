import { describe, it, expect } from "vitest";
import { buildR2Key } from "./r2.service.js";

describe("r2 service", () => {
  describe("buildR2Key", () => {
    it("builds correct key path", () => {
      const key = buildR2Key("my-app", "1.2.0", "app-darwin-aarch64.tar.gz");
      expect(key).toBe("my-app/releases/1.2.0/app-darwin-aarch64.tar.gz");
    });

    it("sanitizes app slug", () => {
      const key = buildR2Key("My_App!", "1.0.0", "file.tar.gz");
      expect(key).toBe("my-app-/releases/1.0.0/file.tar.gz");
    });

    it("sanitizes version", () => {
      const key = buildR2Key("my-app", "1.0.0+build", "file.tar.gz");
      expect(key).toBe("my-app/releases/1.0.0-build/file.tar.gz");
    });

    it("sanitizes filename", () => {
      const key = buildR2Key("my-app", "1.0.0", "file name.tar.gz");
      expect(key).toBe("my-app/releases/1.0.0/file-name.tar.gz");
    });

    it("prevents directory traversal attempts", () => {
      const key = buildR2Key("../../../etc", "1.0.0", "passwd");
      expect(key).not.toContain("..");
    });
  });
});
