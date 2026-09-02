import type { Request, Response } from "express";
import type { Queue } from "bullmq";

const OLDEST_WAITING_JOB_SAMPLE_SIZE = 1;

/**
 * Reports basic operational metrics an operator would want on a dashboard
 * or alert: how long the process has been up, and how backed up the
 * click-analytics queue is. Queue depth and oldest-job age were the two
 * signals explicitly deferred from Phase 4/5 to this hardening phase (see
 * docs/07-agent-todo-tracker.md's E-04 entry) — a growing `waitingJobs`
 * count or a large `oldestWaitingJobAgeSeconds` value is exactly what
 * would tell an operator the worker has fallen behind or stopped.
 *
 * This is plain JSON rather than the Prometheus text exposition format,
 * matching the rest of this API's response style; wiring a real
 * Prometheus scrape target would mean converting this shape at collection
 * time, which is a reasonable next step but out of scope here.
 */
export class MetricsController {
  constructor(private readonly clickEventQueue: Queue) {}

  async handleMetrics(_request: Request, response: Response): Promise<void> {
    const [waitingJobs, activeJobs, delayedJobs, failedJobs, completedJobs, oldestWaitingJob] =
      await Promise.all([
        this.clickEventQueue.getWaitingCount(),
        this.clickEventQueue.getActiveCount(),
        this.clickEventQueue.getDelayedCount(),
        this.clickEventQueue.getFailedCount(),
        this.clickEventQueue.getCompletedCount(),
        this.clickEventQueue.getJobs(["waiting"], 0, OLDEST_WAITING_JOB_SAMPLE_SIZE - 1),
      ]);

    const oldestWaitingJobTimestamp = oldestWaitingJob[0]?.timestamp;
    const oldestWaitingJobAgeSeconds =
      oldestWaitingJobTimestamp === undefined
        ? null
        : Math.max(0, Math.round((Date.now() - oldestWaitingJobTimestamp) / 1000));

    response.status(200).json({
      uptimeSeconds: Math.round(process.uptime()),
      clickEventQueue: {
        waitingJobs,
        activeJobs,
        delayedJobs,
        failedJobs,
        completedJobs,
        oldestWaitingJobAgeSeconds,
      },
    });
  }
}
