/**
 * Agent loop integration tests with mocked provider adapter
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProviderAdapter } from '../providers';
import type { StreamEvent } from '../types';

// Use vi.hoisted to create mocks that can be referenced in vi.mock factories
const { mockRegisterAllTools, mockExecuteInvocations, mockRegistry, mockAdapter, mockCreateAdapter } = vi.hoisted(
  () => {
    const mockAdapter: ProviderAdapter = {
      id: 'mock',
      defaultModel: 'mock-model',
      sendTurn: vi.fn(),
    };
    return {
      mockRegisterAllTools: vi.fn(),
      mockExecuteInvocations: vi.fn(),
      mockRegistry: { list: vi.fn(), get: vi.fn() } as any,
      mockAdapter,
      mockCreateAdapter: vi.fn(() => mockAdapter),
    };
  }
);

vi.mock('../providers', () => ({
  createOpenRouterAdapter: mockCreateAdapter,
}));

vi.mock('../core/tools', () => ({
  globalRegistry: mockRegistry,
  registerAllTools: mockRegisterAllTools,
  executeInvocations: mockExecuteInvocations,
  formatToolResult: (result: unknown) => JSON.stringify(result),
}));

// Import after mocks are set up
const { runAgentLoop } = await import('./loop');

async function collectEvents(generator: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

describe('Agent Loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegisterAllTools.mockClear();
    mockExecuteInvocations.mockReset();
    mockCreateAdapter.mockClear();
    (mockAdapter.sendTurn as vi.Mock).mockReset();
  });

  it('streams text deltas and completes without tools', async () => {
    (mockAdapter.sendTurn as vi.Mock).mockImplementationOnce(async function* () {
      yield { type: 'text_delta', text: 'Hello ' };
      yield { type: 'text_delta', text: 'world' };
      yield {
        type: 'turn_complete',
        result: { messagesToAppend: [], toolInvocations: [], done: true, textContent: 'Hello world' },
      };
    });

    const events = await collectEvents(
      runAgentLoop({
        userPrompt: 'Say hi',
      })
    );

    const text = events.filter((e) => e.type === 'text_delta').map((e) => (e as any).text).join('');
    expect(text).toBe('Hello world');
    expect(events.at(-1)).toEqual({ type: 'done' });
    expect(mockRegisterAllTools).toHaveBeenCalled();
  });

  it('executes tool calls and streams results', async () => {
    (mockAdapter.sendTurn as vi.Mock)
      .mockImplementationOnce(async function* () {
        yield { type: 'tool_call_start', id: 'call_1', name: 'echo' };
        yield {
          type: 'turn_complete',
          result: {
            messagesToAppend: [],
            toolInvocations: [{ id: 'call_1', name: 'echo', input: { message: 'test' } }],
            done: false,
          },
        };
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'turn_complete', result: { messagesToAppend: [], toolInvocations: [], done: true } };
      });

    mockExecuteInvocations.mockResolvedValueOnce([
      { id: 'call_1', name: 'echo', value: { echoed: 'test' }, isError: false },
    ]);

    const events = await collectEvents(
      runAgentLoop({
        userPrompt: 'Echo',
      })
    );

    const toolCall = events.find((e) => e.type === 'tool_call');
    expect(toolCall && (toolCall as any).toolCall?.status).toBe('pending');

    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult && (toolResult as any).toolCall?.status).toBe('completed');
    expect((toolResult as any).toolCall?.result).toEqual({ echoed: 'test' });
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('surfaces tool execution errors', async () => {
    (mockAdapter.sendTurn as vi.Mock)
      .mockImplementationOnce(async function* () {
        yield {
          type: 'turn_complete',
          result: {
            messagesToAppend: [],
            toolInvocations: [{ id: 'call_1', name: 'missing', input: {} }],
            done: false,
          },
        };
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'turn_complete', result: { messagesToAppend: [], toolInvocations: [], done: true } };
      });

    mockExecuteInvocations.mockResolvedValueOnce([
      { id: 'call_1', name: 'missing', value: null, error: new Error('Unknown tool'), isError: true },
    ]);

    const events = await collectEvents(
      runAgentLoop({
        userPrompt: 'Do tool',
      })
    );

    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult && (toolResult as any).toolCall?.status).toBe('error');
    expect((toolResult as any).toolCall?.error).toContain('Unknown tool');
  });

  it('stops immediately when aborted before start', async () => {
    const controller = new AbortController();
    controller.abort();

    const events = await collectEvents(
      runAgentLoop({
        userPrompt: 'abort',
        signal: controller.signal,
      })
    );

    expect(events[0]).toEqual({ type: 'error', error: 'Aborted before starting' });
    expect(events.at(-1)).toEqual({ type: 'done' });
    expect(mockCreateAdapter).not.toHaveBeenCalled();
  });

  it('relays provider errors', async () => {
    (mockAdapter.sendTurn as vi.Mock).mockImplementationOnce(async function* () {
      yield { type: 'error', error: 'provider failed' };
      yield { type: 'turn_complete', result: { messagesToAppend: [], toolInvocations: [], done: true } };
    });

    const events = await collectEvents(
      runAgentLoop({
        userPrompt: 'Test error',
      })
    );

    expect(events.find((e) => e.type === 'error')).toEqual({ type: 'error', error: 'provider failed' });
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('stops with timeout error when maxWallClockMs exceeded', async () => {
    // Mock tool execution to take longer than our timeout
    let turnCount = 0;
    (mockAdapter.sendTurn as vi.Mock).mockImplementation(async function* () {
      turnCount++;
      // Simulate a slow tool call that loops
      yield {
        type: 'turn_complete',
        result: {
          messagesToAppend: [],
          toolInvocations: [{ id: `call_${turnCount}`, name: 'slow', input: {} }],
          done: false,
        },
      };
    });

    // Each tool execution adds a small delay
    mockExecuteInvocations.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return [{ id: `call_${turnCount}`, name: 'slow', value: 'ok', isError: false }];
    });

    const events = await collectEvents(
      runAgentLoop({
        userPrompt: 'Run slow',
        maxWallClockMs: 50, // Very short timeout
      })
    );

    // Should have a timeout error
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect((errorEvent as any).error).toMatch(/timed out/i);
    expect(events.at(-1)).toEqual({ type: 'done' });
  });
});

