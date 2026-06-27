// tool/permissions.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import {
  setPermissions,
  clearPermissions,
  checkRead,
  checkWrite,
  getPermissions,
} from "./permissions.ts";

describe("Permissions module", () => {
  beforeEach(() => {
    clearPermissions();
  });

  // -----------------------------------------------------------------------
  // Open mode (no permissions set)
  // -----------------------------------------------------------------------

  describe("open mode (no permissions)", () => {
    it("allows reading any path", () => {
      expect(checkRead("/any/path.txt")).toEqual({ allowed: true });
      expect(checkRead("/home/project/src/main.ts")).toEqual({ allowed: true });
    });

    it("allows writing any path", () => {
      expect(checkWrite("/any/path.txt")).toEqual({ allowed: true });
      expect(checkWrite("/etc/config.conf")).toEqual({ allowed: true });
    });

    it("getPermissions returns null", () => {
      expect(getPermissions()).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Allow list enforcement
  // -----------------------------------------------------------------------

  describe("allowReadPaths enforcement", () => {
    beforeEach(() => {
      setPermissions(
        ["/home/project/**"],
        ["/home/project/output/**"],
        [],
      );
    });

    it("allows reading paths matching the allow pattern", () => {
      expect(checkRead("/home/project/src/main.ts").allowed).toBe(true);
      expect(checkRead("/home/project/README.md").allowed).toBe(true);
    });

    it("denies reading paths not matching the allow pattern", () => {
      const result = checkRead("/etc/passwd");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not in read allow list");
    });

    it("allows writing paths matching the write allow pattern", () => {
      expect(checkWrite("/home/project/output/build.js").allowed).toBe(true);
    });

    it("denies writing paths not matching the write allow pattern", () => {
      const result = checkWrite("/home/project/src/main.ts");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not in write allow list");
    });
  });

  // -----------------------------------------------------------------------
  // Deny takes precedence
  // -----------------------------------------------------------------------

  describe("deny precedence", () => {
    it("blocks a path that matches both allow and deny", () => {
      setPermissions(
        ["/home/project/**"],
        [],
        ["/home/project/secrets/**"],
      );
      const result = checkRead("/home/project/secrets/key.pem");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("matches deny pattern");
    });

    it("allows a path matching allow but not deny", () => {
      setPermissions(
        ["/home/project/**"],
        [],
        ["/home/project/secrets/**"],
      );
      expect(checkRead("/home/project/src/main.ts").allowed).toBe(true);
    });

    it("deny blocks even without any allow patterns", () => {
      setPermissions(
        [],
        [],
        ["/etc/passwd"],
      );
      const result = checkRead("/etc/passwd");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("matches deny pattern");
    });
  });

  // -----------------------------------------------------------------------
  // Glob patterns
  // -----------------------------------------------------------------------

  describe("glob patterns", () => {
    it("supports ** for any depth", () => {
      setPermissions(["/src/**"], [], []);
      expect(checkRead("/src/a.ts").allowed).toBe(true);
      expect(checkRead("/src/a/b.ts").allowed).toBe(true);
      expect(checkRead("/src/a/b/c.ts").allowed).toBe(true);
    });

    it("supports * for single segment", () => {
      setPermissions(["/src/*.ts"], [], []);
      expect(checkRead("/src/a.ts").allowed).toBe(true);
      expect(checkRead("/src/sub/a.ts").allowed).toBe(false);
    });

    it("supports ? for single character", () => {
      setPermissions(["/data/file-?.txt"], [], []);
      expect(checkRead("/data/file-1.txt").allowed).toBe(true);
      expect(checkRead("/data/file-12.txt").allowed).toBe(false);
    });

    it("matches multiple patterns (union)", () => {
      setPermissions(["/src/**", "/tests/**"], [], []);
      expect(checkRead("/src/main.ts").allowed).toBe(true);
      expect(checkRead("/tests/main.test.ts").allowed).toBe(true);
      expect(checkRead("/docs/readme.md").allowed).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe("lifecycle", () => {
    it("setPermissions updates state", () => {
      setPermissions(["/a/**"], ["/b/**"], ["/a/secret.md"]);
      const p = getPermissions();
      expect(p).toEqual({
        readPaths: ["/a/**"],
        writePaths: ["/b/**"],
        denyPaths: ["/a/secret.md"],
      });
    });

    it("clearPermissions resets to open mode", () => {
      setPermissions(["/a/**"], [], []);
      expect(checkRead("/a/file.txt").allowed).toBe(true);
      expect(checkRead("/b/file.txt").allowed).toBe(false);

      clearPermissions();
      expect(getPermissions()).toBeNull();
      expect(checkRead("/b/file.txt").allowed).toBe(true);
    });

    it("re-setting permissions replaces previous", () => {
      setPermissions(["/old/**"], [], []);
      expect(checkRead("/old/file.txt").allowed).toBe(true);
      expect(checkRead("/new/file.txt").allowed).toBe(false);

      setPermissions(["/new/**"], [], []);
      expect(checkRead("/old/file.txt").allowed).toBe(false);
      expect(checkRead("/new/file.txt").allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe("edge cases", () => {
    it("empty allow lists with deny → allow all except denied", () => {
      setPermissions([], [], ["/blocked/**"]);
      expect(checkRead("/random/file.txt").allowed).toBe(true);
      expect(checkRead("/blocked/file.txt").allowed).toBe(false);
    });

    it("read check uses readPaths, write check uses writePaths", () => {
      setPermissions(["/read-zone/**"], ["/write-zone/**"], []);
      // read zone
      expect(checkRead("/read-zone/file.txt").allowed).toBe(true);
      expect(checkRead("/write-zone/file.txt").allowed).toBe(false);
      // write zone
      expect(checkWrite("/write-zone/file.txt").allowed).toBe(true);
      expect(checkWrite("/read-zone/file.txt").allowed).toBe(false);
    });

    it("all-empty arrays → open mode for everything", () => {
      setPermissions([], [], []);
      expect(checkRead("/anything.txt").allowed).toBe(true);
      expect(checkWrite("/anything.txt").allowed).toBe(true);
    });
  });
});
