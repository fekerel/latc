import PQueue from "p-queue";

export class PreviewEncodeQueue {
  constructor({ maxConcurrency = 1 } = {}) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new Error("Preview encode queue maxConcurrency must be a positive integer");
    }

    this.maxConcurrency = maxConcurrency;
    this.queue = new PQueue({
      concurrency: maxConcurrency
    });
    this.jobs = new Map();
  }

  enqueue({
    id,
    sessionId,
    priority = 0,
    run
  }) {
    if (!id) {
      throw new Error("Preview encode job id is required");
    }

    if (!sessionId) {
      throw new Error("Preview encode job sessionId is required");
    }

    if (typeof run !== "function") {
      throw new Error("Preview encode job run function is required");
    }

    this.cancelJob(id);

    const job = {
      id,
      sessionId,
      priority,
      run,
      canceled: false,
      started: false,
      cancel: undefined
    };

    this.jobs.set(id, job);

    this.queue
      .add(
        async () => {
          try {
            if (job.canceled) {
              return;
            }

            job.started = true;
            await job.run({
              isCanceled: () => job.canceled,
              onCancel: (cancel) => {
                job.cancel = cancel;

                if (job.canceled) {
                  cancel();
                }
              }
            });
          } catch (error) {
            console.error("[preview-encode-queue] job failed", {
              jobId: job.id,
              sessionId: job.sessionId,
              error
            });
          } finally {
            this.jobs.delete(job.id);
          }
        },
        {
          id,
          priority
        }
      )
      .catch((error) => {
        console.error("[preview-encode-queue] queue task failed", {
          jobId: job.id,
          sessionId: job.sessionId,
          error
        });
      });

    return job;
  }

  cancelJob(jobId) {
    const job = this.jobs.get(jobId);

    if (job) {
      job.canceled = true;
      job.cancel?.();
      return true;
    }

    return false;
  }

  cancelSessionJobs(sessionId) {
    for (const job of this.jobs.values()) {
      if (job.sessionId === sessionId) {
        job.canceled = true;
      }
    }
  }

  getSnapshot() {
    return {
      maxConcurrency: this.maxConcurrency,
      pendingCount: [...this.jobs.values()].filter((job) =>
        !job.started && !job.canceled
      ).length,
      runningCount: [...this.jobs.values()].filter((job) =>
        job.started && !job.canceled
      ).length,
      queuedCount: this.queue.size,
      pQueuePendingCount: this.queue.pending
    };
  }
}
