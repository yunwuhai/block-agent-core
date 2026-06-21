/**
 * Efficiency Subagent - Lightweight controllable subagent plugin for PI Coding Agent.
 *
 * Profile-based subagent invocation with durable session recording,
 * structured handoff, dynamic prompt registry control, permission enforcement,
 * and transcript generation.
 *
 * Architecture:
 *   frontend/operation/ — profile resolution, child PI process orchestration
 *   backend/input/      — user profile and project config discovery
 *   backend/storage/    — runtime artifact persistence (.pi/subagents/runs)
 *   backend/computation/prompt/ — dynamic prompt slot engine
 *   backend/computation/policy/ — permission schema, merge, and evaluator
 *   tests/     — test harness and scenario coverage
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ToolParamsSchema, type ToolParams } from "./backend/input/mod.ts";
import { reset as resetSlots } from "./backend/computation/prompt/engine.ts";
import { executeRun } from "./frontend/operation/mod.ts";

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
      "Params: profile (required), task (required), runId (optional), actions (optional action sequence).",
      "Every run creates .pi/subagents/runs/<runId>/ artifacts with JSONL facts, tool logs, transcript, and handoff.",
      "Policy enforces tool names, file paths, bash commands, network, env vars, and nested subagent calls.",
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
              toolName: { type: "string", description: "Tool name: read, bash, write, edit" },
              filePath: { type: "string", description: "File path for read/write/edit" },
              command: { type: "string", description: "Bash command string" },
              url: { type: "string", description: "URL for network fetch" },
              envVar: { type: "string", description: "Environment variable name" },
            },
            required: ["toolName"],
          },
        },
      },
      required: ["profile", "task"],
    },
    async execute(_toolCallId: string, rawParams: unknown, signal?: AbortSignal, _onUpdate?: unknown, ctx?: ExtensionContext) {
      resetSlots();

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
          cwd,
          params,
          ...(signal !== undefined ? { signal } : {}),
        });

        const summary = [
          `Efficiency Subagent: ${result.status.toUpperCase()}`,
          `Run ID: ${result.runId}`,
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
              runId: result.runId,
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
