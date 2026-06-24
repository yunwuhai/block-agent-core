/**
 * Efficiency Subagent - Lightweight controllable subagent plugin for PI Coding Agent.
 *
 * Profile-based subagent invocation with durable session recording,
 * structured handoff, dynamic prompt registry control, permission enforcement,
 * and transcript generation.
 *
 * Architecture:
 *   backend/entry/       — public API facade, dependency wiring (executeRun)
 *   backend/runtime/     — run lifecycle (RunLifecycle, MountController), prompt state
 *   backend/core/        — pure algorithm layer (Registry, Pipeline, Composer)
 *   backend/input/       — profile and config loading
 *   backend/storage/     — runtime artifact persistence
 *   backend/computation/policy/ — permission evaluation
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ToolParamsSchema, type ToolParams } from "./backend/input/mod.ts";
import { reset } from "./backend/runtime/prompt-state.ts";
import { executeRun } from "./backend/entry/index.ts";

/**
 * 将旧的 ActionParams[] 格式转换为后端新的 Action[] 格式。
 */
function convertActions(actions: NonNullable<ToolParams["actions"]>): Array<import("./backend/runtime/run.ts").Action> {
  return actions.map((a) => {
    if (a.toolName === "scheduleEntries") {
      return {
        type: "schedule" as const,
        ...(a.scheduleTags?.length ? { tags: a.scheduleTags } : {}),
        ...(a.scheduleIds?.length ? { ids: a.scheduleIds } : {}),
        ...(a.scheduleGroup ? { group: a.scheduleGroup } : {}),
      };
    }
    if (a.toolName === "unscheduleEntries") {
      return {
        type: "unschedule" as const,
        entryIds: a.unscheduleIds ?? [],
      };
    }
    return {
      type: "tool_call" as const,
      tool: a.toolName,
      args: {
        ...(a.filePath ? { filePath: a.filePath } : {}),
        ...(a.command ? { command: a.command } : {}),
        ...(a.url ? { url: a.url } : {}),
        ...(a.envVar ? { envVar: a.envVar } : {}),
      },
    };
  });
}

/**
 * TUI-compatible renderable text — satisfies the PI TUI Box.render contract.
 * PI's Box.render calls child.render() on each child; this object provides that method.
 * Functionally equivalent to `new Text(str, 0, 0)` from @earendil-works/pi-tui.
 */
function renderText(str: string): { render(width: number): string[]; invalidate(): void } {
  return {
    render: () => [str],
    invalidate: () => {},
  };
}

export default function (pi: ExtensionAPI): void {
  pi.registerTool({
    name: "efficiency_subagent",
    label: "Efficiency Subagent",
    description: [
      "Profile-based subagent invocation with durable sessions and policy control.",
      "Params: profile (required), task (required), runId (optional), actions (optional action sequence + scheduleEntries/unscheduleEntries).",
      "Every run creates .pi/subagents/runs/<runId>/ artifacts with JSONL facts, tool logs, transcript, and handoff.",
      "Policy enforces tool names, file paths, bash commands, network, env vars, and nested subagent calls.",
      "scheduleEntries/unscheduleEntries actions inject/remove registry entries per run to control context size.",
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        profile: { type: "string", description: "Profile name to invoke" },
        task: { type: "string", description: "Task to delegate" },
        runId: { type: "string", description: "Explicit run ID for continuation or readback (optional)" },
        actions: {
          type: "array",
          description: "Explicit action sequence (optional). Falls back to single read if omitted.",
          items: {
            type: "object",
            properties: {
              toolName: { type: "string", description: "Tool name: read, bash, write, edit, scheduleEntries, unscheduleEntries" },
              filePath: { type: "string", description: "File path for read/write/edit" },
              command: { type: "string", description: "Bash command string" },
              url: { type: "string", description: "URL for network fetch" },
              envVar: { type: "string", description: "Environment variable name" },
              scheduleTags: { type: "array", description: "Tags to schedule for context injection (scheduleEntries)" },
              scheduleIds: { type: "array", description: "Entry IDs to schedule (scheduleEntries)" },
              scheduleGroup: { type: "string", description: "Group to schedule all entries from (scheduleEntries)" },
              unscheduleTags: { type: "array", description: "Tags to remove from context (unscheduleEntries)" },
              unscheduleIds: { type: "array", description: "Entry IDs to remove from context (unscheduleEntries)" },
            },
            required: ["toolName"],
          },
        },
      },
      required: ["profile", "task"],
    },
    async execute(_toolCallId: string, rawParams: unknown, _signal?: AbortSignal, _onUpdate?: unknown, ctx?: ExtensionContext) {
      reset();

      const parseResult = ToolParamsSchema.safeParse(rawParams);
      if (!parseResult.success) {
        const unrecognized = parseResult.error.issues
          .filter((i) => i.code === "unrecognized_keys")
          .map((i) => i.keys?.join(", "));
        const hint = unrecognized.length > 0
          ? ` Only profile, task, runId, and actions are accepted.`
          : "";
        return {
          content: [{ type: "text", text: `Invalid params: ${parseResult.error.message}${hint}` }],
          details: { mode: "single", results: [] },
          terminate: true,
        };
      }

      const params: ToolParams = parseResult.data;
      const cwd = ctx?.cwd ?? process.cwd();

      try {
        const result = await executeRun({
          profile: params.profile,
          task: params.task,
          cwd,
          ...(params.runId !== undefined ? { runId: params.runId } : {}),
          ...(params.actions !== undefined ? { actions: convertActions(params.actions) } : {}),
        });

        const summary = [
          `Efficiency Subagent: ${result.status.toUpperCase()}`,
          `Run ID: ${result.id}`,
          `Handoff: ${result.handoffPath}`,
          ...(result.transcriptPath !== undefined ? [`Transcript: ${result.transcriptPath}`] : []),
        ].join("\n");

        const exitCode = result.status === "completed" ? 0 : result.status === "blocked" ? 2 : 1;

        return {
          content: [{ type: "text", text: summary }],
          details: {
            mode: "single",
            results: [{
              agent: params.profile,
              task: params.task,
              exitCode,
              output: result.output,
              runId: result.id,
              status: result.status,
              handoffPath: result.handoffPath,
              ...(result.transcriptPath !== undefined ? { transcriptPath: result.transcriptPath } : {}),
            }],
          },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Efficiency Subagent failed: ${err instanceof Error ? err.message : String(err)}` }],
          details: { mode: "single", results: [] },
          terminate: true,
        };
      }
    },
    renderCall: (params) => {
      const task = String(params.task ?? "?").slice(0, 60);
      return renderText(`Efficiency Subagent: ${params.profile ?? "?"} — ${task}`);
    },
    renderResult: (result) => {
      if (result.details && typeof result.details === "object") {
        const d = result.details;
        const results = d.results;
        if (results && results.length > 0) {
          const r = results[0]!;
          const statusIcon = r.status === "completed" ? "✓" : r.status === "blocked" ? "🚫" : r.status === "failed" ? "✗" : "?";
          const exitCode = r.exitCode ?? "?";
          return renderText(`Efficiency Subagent: ${statusIcon} ${r.status ?? "?"} (exit ${exitCode}) — ${results.length} run(s)`);
        }
        return renderText(`Efficiency Subagent: ${d.mode ?? "?"} — ${results ? results.length : 0} runs`);
      }
      return renderText("Efficiency Subagent complete");
    },
  });
}
