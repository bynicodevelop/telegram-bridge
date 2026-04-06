interface QueueEntry {
  promise: Promise<void>;
  resolve: () => void;
}

class ProjectQueue {
  private locks = new Map<string, Promise<void>>();
  private waiting = new Map<string, number>();

  async acquire(projectId: string): Promise<() => void> {
    // Wait for current lock if exists
    while (this.locks.has(projectId)) {
      this.waiting.set(projectId, (this.waiting.get(projectId) || 0) + 1);
      await this.locks.get(projectId);
      this.waiting.set(projectId, (this.waiting.get(projectId) || 1) - 1);
    }

    // Create new lock
    let releaseFn: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });
    this.locks.set(projectId, lockPromise);

    return () => {
      this.locks.delete(projectId);
      releaseFn!();
    };
  }

  getStatus(projectId: string): { busy: boolean; waiting: number } {
    return {
      busy: this.locks.has(projectId),
      waiting: this.waiting.get(projectId) || 0,
    };
  }

  getAllStatus(): Map<string, { busy: boolean; waiting: number }> {
    const result = new Map<string, { busy: boolean; waiting: number }>();
    for (const [id] of this.locks) {
      result.set(id, this.getStatus(id));
    }
    return result;
  }
}

export const projectQueue = new ProjectQueue();
