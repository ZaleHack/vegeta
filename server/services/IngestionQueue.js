import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

const JOB_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

export class IngestionQueue extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this.queue = [];
    this.processing = false;
  }

  enqueue(meta, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('handler must be a function');
    }

    const jobId = randomUUID();
    const now = new Date().toISOString();
    const job = {
      id: jobId,
      status: JOB_STATUS.QUEUED,
      progress: 0,
      message: 'En attente de traitement',
      meta: meta || {},
      createdAt: now,
      updatedAt: now
    };

    this.jobs.set(jobId, job);
    this.queue.push({ jobId, handler });
    this.#process();
    this.emit('queued', { ...job });
    return { ...job };
  }

  async #process() {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const { jobId, handler } = this.queue.shift();
      const job = this.jobs.get(jobId);

      if (!job) {
        continue;
      }

      job.status = JOB_STATUS.RUNNING;
      job.startedAt = new Date().toISOString();
      job.message = 'Traitement en cours';
      job.updatedAt = job.startedAt;
      this.emit('started', { ...job });

      const update = (payload = {}) => {
        const next = this.jobs.get(jobId);
        if (!next) {
          return;
        }
        Object.assign(next, payload, { updatedAt: new Date().toISOString() });
        this.jobs.set(jobId, next);
        this.emit('progress', { ...next });
      };

      try {
        const result = await handler({ update });
        const completedAt = new Date().toISOString();
        Object.assign(job, {
          status: JOB_STATUS.COMPLETED,
          completedAt,
          updatedAt: completedAt,
          progress: 100,
          message: 'Terminé avec succès',
          result: result ?? null
        });
        this.emit('completed', { ...job });
      } catch (error) {
        const completedAt = new Date().toISOString();
        Object.assign(job, {
          status: JOB_STATUS.FAILED,
          completedAt,
          updatedAt: completedAt,
          message: error?.message || 'Échec du traitement',
          error: {
            message: error?.message,
            stack: error?.stack
          }
        });
        this.emit('failed', { ...job });
      }
    }

    this.processing = false;
  }

  getJob(jobId) {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }

  listJobs({ limit = 20 } = {}) {
    const jobs = Array.from(this.jobs.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return jobs.slice(0, limit).map((job) => ({ ...job }));
  }
}

const ingestionQueue = new IngestionQueue();
ingestionQueue.JOB_STATUS = JOB_STATUS;

export default ingestionQueue;
