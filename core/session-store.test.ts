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

  it("assigns unique message seq values under concurrent appends", async () => {
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
    const seqs = messages.map(item => item.seq).sort((a, b) => a - b);
    expect(seqs).toEqual([1, 2, 3, 4]);
  });

  it("removes descendants by seq range while protecting system prompts", async () => {
    const promptPath = join(tmpDir, "prompt-unmount.md");
    writeFileSync(promptPath, "System prompt", "utf-8");

    await createSession(tmpDir, {
      sessionId: "session-unmount",
      systemPromptFilePaths: [promptPath],
      sdkMode: "host-inherit",
    });

    await appendSessionMessage(tmpDir, "session-unmount", { seq: 1, kind: "system_prompt", text: "system" });
    await appendSessionMessage(tmpDir, "session-unmount", { seq: 2, kind: "input", text: "a", parentSeq: 1 });
    await appendSessionMessage(tmpDir, "session-unmount", { seq: 3, kind: "reply", text: "b", parentSeq: 2 });
    await appendSessionMessage(tmpDir, "session-unmount", { seq: 4, kind: "reply", text: "c", parentSeq: 3 });
    await appendSessionMessage(tmpDir, "session-unmount", { seq: 5, kind: "reply", text: "d", parentSeq: 4 });

    const { appendSessionEvent } = await import("./session-store.ts");
    await appendSessionEvent(tmpDir, "session-unmount", {
      type: "send_finished",
      payload: {
        activeMessageSeqRanges: [[2, 5]],
      },
    });

    const result = await unmountContext(tmpDir, "session-unmount", { seqRanges: [[3, 3], [1, 1]] });
    expect(result.removedSeqs).toEqual([3, 4, 5]);

    const state = await readCurrentContextState(tmpDir, "session-unmount");
    expect(state.activeMessageSeqs).toEqual([2]);
  });

  it("ignores remounted seq ranges that no longer exist after rollback", async () => {
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
        activeMessageSeqRanges: [],
      },
    });

    await mount(tmpDir, "session-missing-remount", { seqRanges: [[3, 3]] });

    const state = await readCurrentContextState(tmpDir, "session-missing-remount");
    expect(state.activeMessageSeqs).toEqual([]);
  });
});
