import { describe, expect, it } from "bun:test";
import { TaskScheduler } from "./task-scheduler.ts";

describe("task scheduler", () => {
  it("keeps the same session serial while allowing different sessions to run", async () => {
    const scheduler = new TaskScheduler(2);
    const order: string[] = [];
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;

    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const secondGate = new Promise<void>(resolve => {
      releaseSecond = resolve;
    });

    scheduler.enqueue({
      taskId: "a-1",
      sessionId: "session-a",
      registeredAt: 1,
      execute: async () => {
        order.push("start:a-1");
        await firstGate;
        order.push("end:a-1");
      },
    });
    scheduler.enqueue({
      taskId: "a-2",
      sessionId: "session-a",
      registeredAt: 2,
      execute: async () => {
        order.push("start:a-2");
        await secondGate;
        order.push("end:a-2");
      },
    });
    scheduler.enqueue({
      taskId: "b-1",
      sessionId: "session-b",
      registeredAt: 3,
      execute: async () => {
        order.push("start:b-1");
        order.push("end:b-1");
      },
    });

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(order).toEqual(["start:a-1", "start:b-1", "end:b-1"]);

    releaseFirst();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(order).toContain("start:a-2");

    releaseSecond();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(order).toEqual(["start:a-1", "start:b-1", "end:b-1", "end:a-1", "start:a-2", "end:a-2"]);
  });
});
