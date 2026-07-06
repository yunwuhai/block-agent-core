export interface ScheduledTaskHandle {
  taskId: string;
  sessionId: string;
  registeredAt: number;
  execute: () => Promise<void>;
}

export interface TaskSchedulerSnapshot {
  maxRunning: number;
  runningCount: number;
  queuedCount: number;
  queued: Array<{ taskId: string; sessionId: string; registeredAt: number }>;
  running: Array<{ taskId: string; sessionId: string }>;
}

export class TaskScheduler {
  private readonly maxRunning: number;
  private readonly queue: ScheduledTaskHandle[] = [];
  private readonly runningTasks = new Map<string, ScheduledTaskHandle>();
  private readonly busySessions = new Set<string>();
  private draining = false;

  constructor(maxRunning: number = 8) {
    this.maxRunning = maxRunning;
  }

  enqueue(handle: ScheduledTaskHandle): { queuePosition: number } {
    this.queue.push(handle);
    const queuePosition = this.queue.length;
    this.kick();
    return { queuePosition };
  }

  snapshot(): TaskSchedulerSnapshot {
    return {
      maxRunning: this.maxRunning,
      runningCount: this.runningTasks.size,
      queuedCount: this.queue.length,
      queued: this.queue.map(item => ({
        taskId: item.taskId,
        sessionId: item.sessionId,
        registeredAt: item.registeredAt,
      })),
      running: [...this.runningTasks.values()].map(item => ({
        taskId: item.taskId,
        sessionId: item.sessionId,
      })),
    };
  }

  private kick(): void {
    if (this.draining) {
      return;
    }
    this.draining = true;
    queueMicrotask(async () => {
      try {
        await this.drain();
      } finally {
        this.draining = false;
        if (this.canStartAny()) {
          this.kick();
        }
      }
    });
  }

  private canStartAny(): boolean {
    return this.runningTasks.size < this.maxRunning && this.queue.some(item => !this.busySessions.has(item.sessionId));
  }

  private async drain(): Promise<void> {
    while (this.runningTasks.size < this.maxRunning) {
      const index = this.queue.findIndex(item => !this.busySessions.has(item.sessionId));
      if (index === -1) {
        return;
      }
      const next = this.queue.splice(index, 1)[0]!;
      this.runningTasks.set(next.taskId, next);
      this.busySessions.add(next.sessionId);
      void next.execute()
        .catch(() => {
          // Execution failure is handled by the caller-provided execute().
        })
        .finally(() => {
          this.runningTasks.delete(next.taskId);
          this.busySessions.delete(next.sessionId);
          this.kick();
        });
    }
  }
}

let defaultScheduler: TaskScheduler | undefined;

export function getDefaultTaskScheduler(): TaskScheduler {
  defaultScheduler ??= new TaskScheduler(8);
  return defaultScheduler;
}

export function resetDefaultTaskSchedulerForTests(): void {
  defaultScheduler = undefined;
}
