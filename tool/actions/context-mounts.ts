import {
  listContextMounts,
  mountContext,
  unmountContext,
} from "../../core/session-store.ts";
import type { ContextSource } from "../../core/context-sources.ts";
import type { ExtensionContextLike, ToolResponse } from "../shared.ts";
import { error, ok } from "../shared.ts";

export async function handleMountContext(
  params: { sessionId: string; sources?: ContextSource[]; seqRanges?: number[][]; metadata?: Record<string, unknown> },
  ctx: ExtensionContextLike,
): Promise<ToolResponse> {
  try {
    const mount = await mountContext(ctx.cwd, params.sessionId, {
      ...(params.sources?.length ? { sources: params.sources } : {}),
      ...(params.seqRanges?.length ? { seqRanges: params.seqRanges } : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    });
    return ok(`Mounted context in session ${params.sessionId}`, { mount });
  } catch (err) {
    return error(`Error mounting context: ${(err as Error).message}`);
  }
}

export async function handleUnmountContext(
  params: { sessionId: string; seqRanges?: number[][]; mountIds?: Array<string | number> },
  ctx: ExtensionContextLike,
): Promise<ToolResponse> {
  try {
    const result = await unmountContext(ctx.cwd, params.sessionId, {
      ...(params.seqRanges?.length ? { seqRanges: params.seqRanges } : {}),
      ...(params.mountIds?.length ? { mountIds: params.mountIds } : {}),
    });
    return ok(`Updated active context in session ${params.sessionId}`, result);
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
    const { readCurrentContextState } = await import("../../core/session-store.ts");
    const state = await readCurrentContextState(ctx.cwd, params.sessionId);
    return ok(JSON.stringify({ mounts, activeMessageSeqs: state.activeMessageSeqs }, null, 2), {
      mounts,
      activeMessageSeqs: state.activeMessageSeqs,
    });
  } catch (err) {
    return error(`Error listing mounts: ${(err as Error).message}`);
  }
}
