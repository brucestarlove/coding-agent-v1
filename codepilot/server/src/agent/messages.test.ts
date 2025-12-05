/**
 * Message utilities unit tests
 * Focus on ToolCallAccumulator streaming behavior
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ToolCallAccumulator,
  systemMessage,
  userMessage,
  assistantMessage,
  assistantToolCallMessage,
  toolResultMessage,
} from './messages';

describe('ToolCallAccumulator', () => {
  let accumulator: ToolCallAccumulator;

  beforeEach(() => {
    accumulator = new ToolCallAccumulator();
  });

  describe('delta accumulation', () => {
    it('should accumulate arguments across multiple deltas', () => {
      // Simulate streaming chunks
      accumulator.addDelta({ index: 0, id: 'call_1', function: { name: 'read_file' } });
      accumulator.addDelta({ index: 0, function: { arguments: '{"path":' } });
      accumulator.addDelta({ index: 0, function: { arguments: '"test.ts"}' } });

      const calls = accumulator.getToolCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].id).toBe('call_1');
      expect(calls[0].name).toBe('read_file');
      expect(calls[0].arguments).toBe('{"path":"test.ts"}');
    });

    it('should handle multiple concurrent tool calls', () => {
      // First tool call
      accumulator.addDelta({ index: 0, id: 'call_1', function: { name: 'read_file' } });
      accumulator.addDelta({ index: 0, function: { arguments: '{"path":"a.ts"}' } });

      // Second tool call (interleaved)
      accumulator.addDelta({ index: 1, id: 'call_2', function: { name: 'write_file' } });
      accumulator.addDelta({ index: 1, function: { arguments: '{"path":"b.ts",' } });
      accumulator.addDelta({ index: 1, function: { arguments: '"content":"hello"}' } });

      const calls = accumulator.getToolCalls();
      expect(calls).toHaveLength(2);

      // Should be sorted by index
      expect(calls[0].id).toBe('call_1');
      expect(calls[0].name).toBe('read_file');
      expect(calls[1].id).toBe('call_2');
      expect(calls[1].name).toBe('write_file');
      expect(calls[1].arguments).toBe('{"path":"b.ts","content":"hello"}');
    });

    it('should update existing tool call with new delta data', () => {
      accumulator.addDelta({ index: 0, function: { name: 'test' } });
      accumulator.addDelta({ index: 0, id: 'call_1' }); // ID comes later
      accumulator.addDelta({ index: 0, function: { arguments: '{}' } });

      const calls = accumulator.getToolCalls();
      expect(calls[0].id).toBe('call_1');
      expect(calls[0].name).toBe('test');
    });
  });

  describe('hasToolCalls', () => {
    it('should return false when empty', () => {
      expect(accumulator.hasToolCalls()).toBe(false);
    });

    it('should return true after adding a delta', () => {
      accumulator.addDelta({ index: 0, id: 'call_1' });
      expect(accumulator.hasToolCalls()).toBe(true);
    });
  });

  describe('reset', () => {
    it('should clear all accumulated tool calls', () => {
      accumulator.addDelta({ index: 0, id: 'call_1', function: { name: 'test' } });
      expect(accumulator.hasToolCalls()).toBe(true);

      accumulator.reset();

      expect(accumulator.hasToolCalls()).toBe(false);
      expect(accumulator.getToolCalls()).toHaveLength(0);
    });
  });

  describe('getToolCalls sorting', () => {
    it('should return tool calls sorted by index', () => {
      // Add out of order
      accumulator.addDelta({ index: 2, id: 'call_3', function: { name: 'c' } });
      accumulator.addDelta({ index: 0, id: 'call_1', function: { name: 'a' } });
      accumulator.addDelta({ index: 1, id: 'call_2', function: { name: 'b' } });

      const calls = accumulator.getToolCalls();
      expect(calls.map((c) => c.name)).toEqual(['a', 'b', 'c']);
    });
  });
});

describe('Message Helpers', () => {
  describe('systemMessage', () => {
    it('should create a system message', () => {
      const msg = systemMessage('You are a helpful assistant');
      expect(msg.role).toBe('system');
      expect(msg.content).toBe('You are a helpful assistant');
    });
  });

  describe('userMessage', () => {
    it('should create a user message', () => {
      const msg = userMessage('Hello');
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('Hello');
    });
  });

  describe('assistantMessage', () => {
    it('should create an assistant message', () => {
      const msg = assistantMessage('Hi there!');
      expect(msg.role).toBe('assistant');
      expect(msg.content).toBe('Hi there!');
    });
  });

  describe('assistantToolCallMessage', () => {
    it('should create assistant message with tool calls', () => {
      const msg = assistantToolCallMessage([
        { id: 'call_1', name: 'read_file', arguments: '{"path":"test.ts"}' },
      ]);

      expect(msg.role).toBe('assistant');
      expect(msg.content).toBeNull();
      expect(msg.tool_calls).toHaveLength(1);
      expect(msg.tool_calls?.[0].id).toBe('call_1');
      expect(msg.tool_calls?.[0].type).toBe('function');
      expect(msg.tool_calls?.[0].function.name).toBe('read_file');
    });

    it('should include optional content', () => {
      const msg = assistantToolCallMessage([{ id: 'call_1', name: 'test', arguments: '{}' }], 'Let me check that for you.');

      expect(msg.content).toBe('Let me check that for you.');
    });
  });

  describe('toolResultMessage', () => {
    it('should create tool result message', () => {
      const msg = toolResultMessage('call_1', { content: 'file contents' });

      expect(msg.role).toBe('tool');
      expect(msg.tool_call_id).toBe('call_1');
      expect(msg.content).toContain('file contents');
    });

    it('should prefix with Error when isError is true', () => {
      const msg = toolResultMessage('call_1', 'File not found', true);

      expect(msg.content).toBe('Error: File not found');
    });

    it('should stringify non-string results', () => {
      const msg = toolResultMessage('call_1', { path: 'test.ts', status: 'ok' });

      const parsed = JSON.parse(msg.content);
      expect(parsed.path).toBe('test.ts');
      expect(parsed.status).toBe('ok');
    });
  });
});

