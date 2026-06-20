/**
 * Efficiency Subagent - Lightweight controllable subagent plugin for PI Coding Agent.
 *
 * Profile-based subagent invocation with durable session recording,
 * structured handoff, dynamic prompt slots, hook scripts, permission
 * enforcement, and live TUI events.
 *
 * Architecture:
 *   display/   — live TUI event rendering
 *   storage/   — runtime artifact persistence (.pi/subagents/runs)
 *   runtime/   — profile resolution, child PI process orchestration
 *   runtime/prompt-slots/  — dynamic prompt slot engine
 *   runtime/hooks/  — hook script runner and slot insertion
 *   policy/    — permission schema, merge, and evaluator
 *   config/    — user profile and project config discovery
 *   tests/     — test harness and scenario coverage
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ToolParamsSchema, type ToolParams } from "./config/mod.ts";
import { executeRun } from "./runtime/mod.ts";
import { reset as resetSlots } from "./runtime/prompt-slots/engine.ts";
import { renderCompact } from "./display/mod.ts";

export default function (pi: ExtensionAPI): void {
  pi.registerTool({
    name: "efficiency_subagent",
    label: "Efficiency Subagent",
    description: [
      "Profile-based subagent invocation with durable sessions and policy control.",
      "Params: profile (required), task (required), runId (optional).",
      "Every run creates .pi/subagents/runs/<runId>/ artifacts with JSONL facts, tool logs, transcript, and handoff.",
      "Hooks run around agent/tool phases; output injected through prompt slots.",
      "Policy enforces tool names, file paths, bash commands, network, env vars, and nested subagent calls.",
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        profile: { type: "string", description: "Profile name to invoke" },
        task: { type: "string", description: "Task to delegate" },
        runId: { type: "string", description: "Explicit run ID for continuation or readback (optional)" },
      },
      required: ["profile", "task"],
    },
    async execute(_toolCallId: string, rawParams: unknown, _signal?: AbortSignal, _onUpdate?: unknown, ctx?: ExtensionContext) {
      resetSlots();

      const parseResult = ToolParamsSchema.safeParse(rawParams);
      if (!parseResult.success) {
        return {
          content: [{ type: "text", text: `Invalid params: ${parseResult.error.message}` }],
          isError: true,
        };
      }

      const params: ToolParams = parseResult.data;
      const cwd = ctx?.cwd ?? process.cwd();

      try {
        const result = await executeRun({
          cwd,
          params,
          projectPolicy: null,
          mergedPolicy: null,
        });

        const summary = [
          `Efficiency Subagent: ${result.status.toUpperCase()}`,
          `Run ID: ${result.runId}`,
          `Handoff: ${result.handoffPath}`,
          "",
          "Events:",
          ...result.events.map((e, i) => renderCompact(e, i)),
        ].join("\n");

        return {
          content: [{ type: "text", text: summary }],
          details: {
            mode: "single",
            results: [{ agent: params.profile, task: params.task, exitCode: result.status === "completed" ? 0 : 1, output: result.output, runId: result.runId }],
          },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Efficiency Subagent failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
    renderCall: (params: Record<string, unknown>) => `Efficiency Subagent: ${params.profile ?? "?"} — ${params.task ?? "?"}`,
    renderResult: (result: Record<string, unknown>) => {
      if (result.details && typeof result.details === "object") {
        const d = result.details as Record<string, unknown>;
        return `Efficiency Subagent: ${d.mode ?? "?"} — ${d.results ? (d.results as Array<unknown>).length : 0} runs`;
      }
      return "Efficiency Subagent complete";
    },
  });
}
