/**
 * Runs tasks one at a time per key, in arrival order. Every write to a board goes through its queue, so
 * events are numbered and broadcast in the order they were committed.
 */
export class KeyedQueue {
  private tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(task, task);
    const tail = result.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }

  get size(): number {
    return this.tails.size;
  }
}
