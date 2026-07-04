import {
  listContextMounts,
  mountContext,
  unmountContext,
} from "../../core/session-store.ts";
import type { ContextSource } from "../../core/context-sources.ts";
import type { ExtensionContextLike, ToolResponse } from "../shared.ts";
import { error, ok } from "../shared.ts";

export async function handleMountContext(
  params: { sessionId: string; sources: ContextSource[]; metadata?: Record<string, unknown> },
  ctx: ExtensionContextLike,
): Promise<ToolResponse> {
  try {
    const mount = await mountContext(ctx.cwd, params.sessionId, params.sources ?? [], params.metadata);
    return ok(`Mounted context in session ${params.sessionId}`, { mount });
  } catch (err) {
    return error(`Error mounting context: ${(err as Error).message}`);
  }
}

export async function handleUnmountContext(
  params: { sessionId: string; mountIds: string[] },
  ctx: ExtensionContextLike,
): Promise<ToolResponse> {
  try {
    const result = await unmountContext(ctx.cwd, params.sessionId, params.mountIds ?? []);
    return ok(`Unmounted ${result.removedIds.length} mounts from session ${params.sessionId}`, result);
  } catch (err) {
    return error(`Error unmounting context: ${(err as Error).message}`);
  }
}

export async function handleListContextMounts(
  params: { sessionId: string },
  ctx: ExtensionContextLike,
): Promise<ToolResponse> {
  try {
    const mounts = await listContextMounts(ctx.cwd, params.sessionId);
    return ok(JSON.stringify({ mounts }, null, 2), { mounts });
  } catch (err) {
    return error(`Error listing mounts: ${(err as Error).message}`);
  }
}
