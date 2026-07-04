import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createSession,
  listContextMounts,
  mountContext,
  readSessionConfig,
  unmountContext,
} from "./session-store.ts";

const tmpDir = mkdtempSync(join(process.cwd(), ".tmp-session-store-test-"));

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("session store", () => {
  it("creates session config and persists mounts", async () => {
    const promptPath = join(tmpDir, "prompt.md");
    const notePath = join(tmpDir, "note.md");
    writeFileSync(promptPath, "System prompt", "utf-8");
    writeFileSync(notePath, "Note", "utf-8");

    await createSession(tmpDir, {
      sessionId: "session-one",
      systemPromptFilePaths: [promptPath],
      sdkMode: "host-inherit",
      tools: { names: ["read"] },
    });

    const mount = await mountContext(tmpDir, "session-one", [{ type: "file", filePath: notePath }]);
    const mounts = await listContextMounts(tmpDir, "session-one");
    expect(mounts).toHaveLength(1);
    expect(mounts[0]!.id).toBe(mount.id);

    await unmountContext(tmpDir, "session-one", [mount.id]);
    const nextMounts = await listContextMounts(tmpDir, "session-one");
    expect(nextMounts).toHaveLength(0);

    const config = await readSessionConfig(tmpDir, "session-one");
    expect(config.systemPromptFilePaths).toEqual([promptPath]);
    expect(config.tools).toEqual({ names: ["read"] });
  });
});
