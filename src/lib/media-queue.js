// One encoder at a time; foreground previews jump ahead of queued thumbnails.
export class MediaQueue {
  jobs = new Map();
  running = false;

  enqueue(key, build, { priority = 0, signal } = {}) {
    if (signal?.aborted) return Promise.reject(signal.reason);
    let job = this.jobs.get(key);
    if (!job) {
      job = { key, build, priority, subscribers: new Set(), started: false };
      this.jobs.set(key, job);
    }
    job.priority = Math.max(job.priority, priority);
    return new Promise((resolve, reject) => {
      const subscriber = { resolve, reject, cleanup: () => signal?.removeEventListener('abort', abort) };
      const abort = () => {
        job.subscribers.delete(subscriber);
        subscriber.cleanup();
        reject(signal.reason);
        if (!job.started && !job.subscribers.size) this.jobs.delete(key);
      };
      job.subscribers.add(subscriber);
      signal?.addEventListener('abort', abort, { once: true });
      this.drain();
    });
  }

  async drain() {
    if (this.running) return;
    const job = [...this.jobs.values()].filter((item) => !item.started)
      .sort((a, b) => b.priority - a.priority)[0];
    if (!job) return;
    this.running = true;
    job.started = true;
    try {
      const result = await job.build();
      for (const subscriber of job.subscribers) subscriber.resolve(result);
    } catch (error) {
      for (const subscriber of job.subscribers) subscriber.reject(error);
    } finally {
      for (const subscriber of job.subscribers) subscriber.cleanup();
      this.jobs.delete(job.key);
      this.running = false;
      this.drain();
    }
  }
}
