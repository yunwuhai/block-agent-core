import { readEvents } from "../../core/session-store.ts";
import type { ExtensionContextLike, ToolResponse } from "../shared.ts";
import { error, ok } from "../shared.ts";

export async function handleReadEvents(
  params: { sessionId: string; requestKey?: string },
  ctx: ExtensionContextLike,
): Promise<ToolResponse> {
  try {
    const events = await readEvents(ctx.cwd, params.sessionId);
    const filtered = params.requestKey
      ? events.filter(event => event.requestKey === params.requestKey)
      : events;
    return ok(JSON.stringify({ events: filtered }, null, 2), { events: filtered });
  } catch (err) {
    return error(`Error reading events: ${(err as Error).message}`);
  }
}
