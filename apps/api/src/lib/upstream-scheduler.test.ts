import { describe, expect, it } from 'vitest';
import { UpstreamScheduler } from './upstream-scheduler.js';

describe('UpstreamScheduler', () => {
  it('never runs more concurrent upstream tasks than configured', async () => {
    let active = 0;
    let maxActive = 0;
    const scheduler = new UpstreamScheduler(2);
    const task = () =>
      scheduler.enqueue(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 40));
        active -= 1;
      });

    await Promise.all(Array.from({ length: 6 }, () => task()));
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
