/**
 * Session management unit tests
 * Focus on EventQueue async iterator behavior
 */
import { describe, it, expect } from 'vitest';
import { EventQueue } from './session';

describe('EventQueue', () => {
  describe('push and iteration', () => {
    it('should buffer events when no consumers are waiting', async () => {
      const queue = new EventQueue();

      // Push events before consuming
      queue.push({ type: 'text_delta', text: 'Hello' });
      queue.push({ type: 'text_delta', text: ' World' });

      // Consume via async iterator
      const iterator = queue[Symbol.asyncIterator]();

      const first = await iterator.next();
      expect(first.done).toBe(false);
      expect(first.value).toEqual({ type: 'text_delta', text: 'Hello' });

      const second = await iterator.next();
      expect(second.done).toBe(false);
      expect(second.value).toEqual({ type: 'text_delta', text: ' World' });
    });

    it('should resolve waiting consumers immediately when event pushed', async () => {
      const queue = new EventQueue();
      const iterator = queue[Symbol.asyncIterator]();

      // Start waiting for event (non-blocking)
      const promise = iterator.next();

      // Push event - should resolve immediately
      queue.push({ type: 'done' });

      const result = await promise;
      expect(result.done).toBe(false);
      expect(result.value).toEqual({ type: 'done' });
    });

    it('should handle multiple waiting consumers', async () => {
      const queue = new EventQueue();
      const iterator = queue[Symbol.asyncIterator]();

      // Multiple consumers waiting
      const p1 = iterator.next();
      const p2 = iterator.next();

      // Push events
      queue.push({ type: 'text_delta', text: 'First' });
      queue.push({ type: 'text_delta', text: 'Second' });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.value).toEqual({ type: 'text_delta', text: 'First' });
      expect(r2.value).toEqual({ type: 'text_delta', text: 'Second' });
    });
  });

  describe('close behavior', () => {
    it('should signal done to all waiting consumers on close', async () => {
      const queue = new EventQueue();
      const iterator = queue[Symbol.asyncIterator]();

      // Start waiting
      const p1 = iterator.next();
      const p2 = iterator.next();

      // Close the queue
      queue.close();

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.done).toBe(true);
      expect(r2.done).toBe(true);
    });

    it('should return done immediately after close', async () => {
      const queue = new EventQueue();
      queue.close();

      const iterator = queue[Symbol.asyncIterator]();
      const result = await iterator.next();

      expect(result.done).toBe(true);
    });

    it('should ignore pushes after close', async () => {
      const queue = new EventQueue();
      queue.push({ type: 'text_delta', text: 'Before' });
      queue.close();
      queue.push({ type: 'text_delta', text: 'After' }); // Should be ignored

      const iterator = queue[Symbol.asyncIterator]();

      // Should get the event pushed before close
      const first = await iterator.next();
      expect(first.value).toEqual({ type: 'text_delta', text: 'Before' });

      // Should be done (the 'After' event was ignored)
      const second = await iterator.next();
      expect(second.done).toBe(true);
    });

    it('should report isClosed correctly', () => {
      const queue = new EventQueue();
      expect(queue.isClosed()).toBe(false);

      queue.close();
      expect(queue.isClosed()).toBe(true);
    });
  });

  describe('for-await-of usage', () => {
    it('should work with for-await-of loop', async () => {
      const queue = new EventQueue();
      const events: unknown[] = [];

      // Push some events and close
      queue.push({ type: 'text_delta', text: 'A' });
      queue.push({ type: 'text_delta', text: 'B' });
      queue.push({ type: 'done' });
      queue.close();

      // Consume with for-await-of
      for await (const event of queue) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
      expect(events[2]).toEqual({ type: 'done' });
    });
  });
});

