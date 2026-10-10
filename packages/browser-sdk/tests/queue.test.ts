import { describe, expect, it } from 'vitest';
import { BoundedQueue } from '../src/queue.js';

describe('BoundedQueue', () => {
  it('drops oldest items when full', () => {
    const queue = new BoundedQueue<number>(2);
    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);
    expect(queue.drain()).toEqual([2, 3]);
  });

  it('requeues failed batches at the front within bounds', () => {
    const queue = new BoundedQueue<number>(3);
    queue.enqueue(3);
    queue.requeueFront([1, 2]);
    expect(queue.drain()).toEqual([1, 2, 3]);
  });
});
