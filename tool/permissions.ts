// tool/permissions.ts
// ===========================================================================
// File-level permission sandbox — enforces template allowReadPaths,
// allowWritePaths, and denyPaths at the tool_call event layer.
//
// This module holds session-scoped permission state. handleLoad() calls
// setPermissions() after merging template permissions; the tool_call
// interceptor (registered in dialogue-memory.ts) calls checkRead / checkWrite
// to decide whether to block a tool invocation.
//
// Key rules:
//   1. No permissions set → allow everything (open mode, backward compatible)
//   2. denyPaths match → always block (deny takes precedence over allow)
//   3. allow list non-empty → block if path doesn't match any allow pattern
//   4. allow list empty → allow all (except paths matched by deny)
// ===========================================================================

import { matchesAnyGlob } from "../utils/glob.ts";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface PermissionSets {
  readPaths: string[];
  writePaths: string[];
  denyPaths: string[];
}

let currentPermissions: PermissionSets | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Store the merged permission sets from loaded templates. */
export function setPermissions(
  readPaths: string[],
  writePaths: string[],
  denyPaths: string[],
): void {
  currentPermissions = { readPaths, writePaths, denyPaths };
}

/** Clear permission state (reset to open mode). */
export function clearPermissions(): void {
  currentPermissions = null;
}

/**
 * Check whether reading `absolutePath` is allowed.
 * Returns `{ allowed: boolean; reason?: string }`.
 */
export function checkRead(path: string): { allowed: boolean; reason?: string } {
  return checkPath(path, "read");
}

/**
 * Check whether writing `absolutePath` is allowed.
 * Returns `{ allowed: boolean; reason?: string }`.
 */
export function checkWrite(path: string): { allowed: boolean; reason?: string } {
  return checkPath(path, "write");
}

/** Expose current permissions for testing / debugging. */
export function getPermissions(): PermissionSets | null {
  return currentPermissions;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function checkPath(
  path: string,
  access: "read" | "write",
): { allowed: boolean; reason?: string } {
  // Rule 1: no permissions → open mode
  if (!currentPermissions) return { allowed: true };

  // Rule 2: deny takes precedence
  if (matchesAnyGlob(currentPermissions.denyPaths, path)) {
    return {
      allowed: false,
      reason: `Path "${path}" matches deny pattern`,
    };
  }

  const allowPaths =
    access === "read"
      ? currentPermissions.readPaths
      : currentPermissions.writePaths;

  // Rule 4: empty allow list → allow all (except already denied)
  if (allowPaths.length === 0) return { allowed: true };

  // Rule 3: non-empty allow list → must match at least one pattern
  if (matchesAnyGlob(allowPaths, path)) return { allowed: true };

  return {
    allowed: false,
    reason: `Path "${path}" is not in ${access} allow list`,
  };
}
