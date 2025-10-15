import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { IngestionQueue } from '../server/services/IngestionQueue.js';

test('IngestionQueue processes jobs sequentially and exposes progress', async () => {
  const queue = new IngestionQueue();
  const progressEvents = [];

  queue.on('progress', (job) => {
    progressEvents.push(job.progress);
  });

  const job = queue.enqueue({ type: 'unit-test' }, async ({ update }) => {
    update({ progress: 25 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    update({ progress: 75 });
    return { ok: true };
  });

  const [completedJob] = await once(queue, 'completed');
  assert.equal(completedJob.status, 'completed');
  assert.equal(completedJob.result.ok, true);

  const storedJob = queue.getJob(job.id);
  assert.ok(storedJob);
  assert.equal(storedJob.status, 'completed');
  assert.equal(storedJob.progress, 100);
  assert(progressEvents.some((value) => value >= 75));
});

test('IngestionQueue captures job failures without blocking the queue', async () => {
  const queue = new IngestionQueue();

  queue.enqueue({ type: 'unit-test-error' }, async () => {
    throw new Error('boom');
  });

  const [failedJob] = await once(queue, 'failed');
  assert.equal(failedJob.status, 'failed');
  assert.equal(queue.getJob(failedJob.id).status, 'failed');

  const secondJob = queue.enqueue({ type: 'unit-test-success' }, async () => {
    return { ok: true };
  });

  const [completedJob] = await once(queue, 'completed');
  assert.equal(completedJob.id, secondJob.id);
  assert.equal(completedJob.status, 'completed');
});
