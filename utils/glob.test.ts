import { describe, it, expect } from "bun:test";
import { matchGlob, matchesAnyGlob } from "./glob.ts";

describe("matchGlob", () => {
  it("matches literal paths", () => {
    expect(matchGlob("/home/user/file.txt", "/home/user/file.txt")).toBe(true);
    expect(matchGlob("/home/user/file.txt", "/home/other/file.txt")).toBe(false);
  });

  it("matches * as single segment wildcard", () => {
    expect(matchGlob("/home/*/file.txt", "/home/user/file.txt")).toBe(true);
    expect(matchGlob("/home/*/file.txt", "/home/a/b/file.txt")).toBe(false);
  });

  it("matches ** as any-depth wildcard", () => {
    expect(matchGlob("/home/**", "/home/user/file.txt")).toBe(true);
    expect(matchGlob("/home/**", "/home/a/b/c/d.txt")).toBe(true);
    expect(matchGlob("/home/**", "/etc/passwd")).toBe(false);
  });

  it("matches **/ prefix for any-depth", () => {
    expect(matchGlob("**/node_modules", "node_modules")).toBe(true);
    expect(matchGlob("**/node_modules", "a/node_modules")).toBe(true);
    expect(matchGlob("**/node_modules", "a/b/node_modules")).toBe(true);
  });

  it("matches ? as single character", () => {
    expect(matchGlob("/home/file?.txt", "/home/file1.txt")).toBe(true);
    expect(matchGlob("/home/file?.txt", "/home/fileA.txt")).toBe(true);
    expect(matchGlob("/home/file?.txt", "/home/file12.txt")).toBe(false);
  });

  it("escapes regex special characters", () => {
    expect(matchGlob("/home/user/file.txt", "/home/user/file.txt")).toBe(true);
    expect(matchGlob("/home/user/file[abc].txt", "/home/user/file[a].txt")).toBe(false);
    expect(matchGlob("/home/user/file[abc].txt", "/home/user/file[abc].txt")).toBe(true);
  });
});

describe("matchesAnyGlob", () => {
  it("returns false for empty array", () => {
    expect(matchesAnyGlob([], "/any/path")).toBe(false);
  });

  it("returns true if any pattern matches", () => {
    const patterns = ["/home/*/data", "/tmp/**"];
    expect(matchesAnyGlob(patterns, "/tmp/a/b/c")).toBe(true);
  });

  it("returns false if no pattern matches", () => {
    const patterns = ["/home/*/data", "/var/**"];
    expect(matchesAnyGlob(patterns, "/etc/passwd")).toBe(false);
  });
});
