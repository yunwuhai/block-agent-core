import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendSessionMessage,
  createSession,
  listContextMounts,
  mountContext,
  readCurrentContextState,
  readSessionConfig,
  readMessages,
  unmountContext,
  updateSessionConfig,
} from "./session-store.ts";

const tmpDir = mkdtempSync(join(process.cwd(), ".tmp-session-store-test-"));

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("session store", () => {
  it("creates session config and reconstructs mounts from events", async () => {
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

    const mount = await mountContext(tmpDir, "session-one", { sources: [{ type: "file", filePath: notePath }] });
    const mounts = await listContextMounts(tmpDir, "session-one");
    expect(mounts).toHaveLength(1);
    expect(mounts[0]!.id).toBe(mount.id);

    await unmountContext(tmpDir, "session-one", { mountIds: [mount.id] });
    const nextMounts = await listContextMounts(tmpDir, "session-one");
    expect(nextMounts).toHaveLength(0);

    const config = await readSessionConfig(tmpDir, "session-one");
    expect(config.systemPromptFilePaths).toEqual([promptPath]);
    expect(config.tools).toEqual({ names: ["read"] });
  });

  it("assigns unique message id values under concurrent appends", async () => {
    const promptPath = join(tmpDir, "prompt-concurrent.md");
    writeFileSync(promptPath, "System prompt", "utf-8");

    await createSession(tmpDir, {
      sessionId: "session-concurrent",
      systemPromptFilePaths: [promptPath],
      sdkMode: "host-inherit",
    });

    await Promise.all([
      appendSessionMessage(tmpDir, "session-concurrent", { kind: "input", text: "a" }),
      appendSessionMessage(tmpDir, "session-concurrent", { kind: "input", text: "b" }),
      appendSessionMessage(tmpDir, "session-concurrent", { kind: "input", text: "c" }),
      appendSessionMessage(tmpDir, "session-concurrent", { kind: "input", text: "d" }),
    ]);

    const messages = await readMessages(tmpDir, "session-concurrent");
    const seqs = messages.map(item => item.id).sort((a, b) => a - b);
    expect(seqs).toEqual([1, 2, 3, 4]);
  });

  it("removes descendants by id range", async () => {
    const promptPath = join(tmpDir, "prompt-unmount.md");
    writeFileSync(promptPath, "System prompt", "utf-8");

    await createSession(tmpDir, {
      sessionId: "session-unmount",
      systemPromptFilePaths: [promptPath],
      sdkMode: "host-inherit",
    });

    await appendSessionMessage(tmpDir, "session-unmount", { id: 1, kind: "input", text: "a" });
    await appendSessionMessage(tmpDir, "session-unmount", { id: 2, kind: "reply", text: "b", parentId: 1 });
    await appendSessionMessage(tmpDir, "session-unmount", { id: 3, kind: "reply", text: "c", parentId: 2 });
    await appendSessionMessage(tmpDir, "session-unmount", { id: 4, kind: "reply", text: "d", parentId: 3 });

    const { appendSessionEvent } = await import("./session-store.ts");
    await appendSessionEvent(tmpDir, "session-unmount", {
      type: "send_finished",
      payload: {
        activeMessageIdRanges: [[1, 4]],
      },
    });

    const result = await unmountContext(tmpDir, "session-unmount", { idRanges: [[3, 3]] });
    expect(result.removedMessageIds).toEqual([3, 4]);

    const state = await readCurrentContextState(tmpDir, "session-unmount");
    expect(state.activeMessageIds).toEqual([1, 2]);
  });

  it("ignores remounted id ranges that no longer exist after rollback", async () => {
    const promptPath = join(tmpDir, "prompt-missing-remount.md");
    writeFileSync(promptPath, "System prompt", "utf-8");

    await createSession(tmpDir, {
      sessionId: "session-missing-remount",
      systemPromptFilePaths: [promptPath],
      sdkMode: "host-inherit",
    });

    const { appendSessionEvent, mountContext: mount } = await import("./session-store.ts");
    await appendSessionEvent(tmpDir, "session-missing-remount", {
      type: "send_finished",
      payload: {
        activeMessageIdRanges: [],
      },
    });

    await mount(tmpDir, "session-missing-remount", { idRanges: [[3, 3]] });

    const state = await readCurrentContextState(tmpDir, "session-missing-remount");
    expect(state.activeMessageIds).toEqual([]);
  });

  // ── T1-7: defaultTimeoutMs in session config ────────────────────────────

  it("T1-7: updateSessionConfig persists defaultTimeoutMs", async () => {
    const promptPath = join(tmpDir, "prompt-timeout-cfg.md");
    writeFileSync(promptPath, "timeout test", "utf-8");
    await createSession(tmpDir, {
      sessionId: "timeout-cfg",
      systemPromptFilePaths: [promptPath],
      sdkMode: "host-inherit",
    });

    const updated = await updateSessionConfig(tmpDir, "timeout-cfg", {
      defaultTimeoutMs: 120000,
    });
    expect(updated.defaultTimeoutMs).toBe(120000);

    const reloaded = await readSessionConfig(tmpDir, "timeout-cfg");
    expect(reloaded.defaultTimeoutMs).toBe(120000);
  });
});
