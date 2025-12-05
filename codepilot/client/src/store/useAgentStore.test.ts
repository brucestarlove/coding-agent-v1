/**
 * Zustand store unit tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAgentStore } from './useAgentStore';
import { resetStore, getStoreState, mockFetchSuccess, mockFetchError } from '../../test/store-helper';

describe('useAgentStore', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = getStoreState();

      expect(state.sessionId).toBeNull();
      expect(state.status).toBe('idle');
      expect(state.messages).toHaveLength(0);
      expect(state.currentContent).toHaveLength(0);
    });
  });

  describe('sendMessage', () => {
    it('should add user message and set streaming status', async () => {
      mockFetchSuccess({ sessionId: 'session_1', workingDir: '/test' });

      await getStoreState().sendMessage('Hello');

      const state = getStoreState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe('user');
      expect(state.messages[0].content).toBe('Hello');
      expect(state.status).toBe('streaming');
      expect(state.sessionId).toBe('session_1');
    });

    it('should set lastUserMessage for retry', async () => {
      mockFetchSuccess({ sessionId: 'session_1', workingDir: '/test' });

      await getStoreState().sendMessage('Test message');

      expect(getStoreState().lastUserMessage).toBe('Test message');
    });

    it('should handle API errors', async () => {
      mockFetchError(500, 'Internal Server Error');

      await getStoreState().sendMessage('Hello');

      const state = getStoreState();
      expect(state.status).toBe('error');
      expect(state.error).toContain('500');
    });

    it('should not send while already streaming', async () => {
      useAgentStore.setState({ status: 'streaming' });

      await getStoreState().sendMessage('Hello');

      // Fetch should not have been called
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should include selected plan in message when command is implement', async () => {
      useAgentStore.setState({
        selectedCommand: 'implement',
        selectedPlan: {
          id: 'plan_1',
          title: 'Test Plan',
          type: 'implementation',
          content: '## Plan Content',
          filePath: 'test.md',
          preview: 'Preview',
          createdAt: '',
          updatedAt: '',
          sessionId: null,
          tags: [],
        },
      } as any);

      mockFetchSuccess({ sessionId: 'session_1', workingDir: '/test' });

      await getStoreState().sendMessage('Implement this');

      // Check the fetch was called with combined message
      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.message).toContain('Implement this');
      expect(body.message).toContain('## Plan Content');

      // Plan should be cleared after use
      expect(getStoreState().selectedPlan).toBeNull();
    });
  });

  describe('clearSession', () => {
    it('should reset session state', () => {
      useAgentStore.setState({
        sessionId: 'session_1',
        messages: [{ id: '1', role: 'user', content: 'test', timestamp: new Date() }],
        status: 'streaming',
      } as any);

      getStoreState().clearSession();

      const state = getStoreState();
      expect(state.sessionId).toBeNull();
      expect(state.messages).toHaveLength(0);
      expect(state.status).toBe('idle');
    });
  });

  describe('streaming handlers', () => {
    describe('appendText', () => {
      it('should create new text block when empty', () => {
        getStoreState().appendText('Hello');

        const { currentContent } = getStoreState();
        expect(currentContent).toHaveLength(1);
        expect(currentContent[0]).toEqual({ type: 'text', text: 'Hello' });
      });

      it('should append to existing text block', () => {
        getStoreState().appendText('Hello');
        getStoreState().appendText(' World');

        const { currentContent } = getStoreState();
        expect(currentContent).toHaveLength(1);
        expect(currentContent[0]).toEqual({ type: 'text', text: 'Hello World' });
      });

      it('should create new text block after tool call', () => {
        getStoreState().appendText('Before');
        getStoreState().addToolCall({
          id: 'call_1',
          name: 'test',
          input: {},
          status: 'pending',
        });
        getStoreState().appendText('After');

        const { currentContent } = getStoreState();
        expect(currentContent).toHaveLength(3);
        expect(currentContent[0]).toEqual({ type: 'text', text: 'Before' });
        expect(currentContent[1].type).toBe('tool_call');
        expect(currentContent[2]).toEqual({ type: 'text', text: 'After' });
      });
    });

    describe('addToolCall', () => {
      it('should add tool call block', () => {
        getStoreState().addToolCall({
          id: 'call_1',
          name: 'read_file',
          input: { path: 'test.ts' },
          status: 'pending',
        });

        const { currentContent } = getStoreState();
        expect(currentContent).toHaveLength(1);
        expect(currentContent[0].type).toBe('tool_call');
        expect((currentContent[0] as any).toolCall.name).toBe('read_file');
      });
    });

    describe('updateToolResult', () => {
      it('should update matching tool call with result', () => {
        getStoreState().addToolCall({
          id: 'call_1',
          name: 'read_file',
          input: {},
          status: 'pending',
        });

        getStoreState().updateToolResult('call_1', { content: 'file contents' });

        const { currentContent } = getStoreState();
        const toolCall = (currentContent[0] as any).toolCall;
        expect(toolCall.status).toBe('completed');
        expect(toolCall.result).toEqual({ content: 'file contents' });
      });

      it('should set error status when error provided', () => {
        getStoreState().addToolCall({
          id: 'call_1',
          name: 'read_file',
          input: {},
          status: 'pending',
        });

        getStoreState().updateToolResult('call_1', undefined, 'File not found');

        const { currentContent } = getStoreState();
        const toolCall = (currentContent[0] as any).toolCall;
        expect(toolCall.status).toBe('error');
        expect(toolCall.error).toBe('File not found');
      });
    });

    describe('finalizeResponse', () => {
      it('should convert currentContent to assistant message', () => {
        getStoreState().appendText('Hello!');
        getStoreState().finalizeResponse();

        const state = getStoreState();
        expect(state.currentContent).toHaveLength(0);
        expect(state.messages).toHaveLength(1);
        expect(state.messages[0].role).toBe('assistant');
        expect(state.messages[0].content).toEqual([{ type: 'text', text: 'Hello!' }]);
        expect(state.status).toBe('idle');
      });

      it('should not add message if currentContent is empty', () => {
        getStoreState().finalizeResponse();

        const state = getStoreState();
        expect(state.messages).toHaveLength(0);
        expect(state.status).toBe('idle');
      });
    });

    describe('updateApiUsage', () => {
      it('should accumulate API token usage while preserving context fields', () => {
        getStoreState().updateApiUsage({
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        });

        getStoreState().updateApiUsage({
          prompt_tokens: 80,
          completion_tokens: 40,
          total_tokens: 120,
        });

        const { tokenUsage } = getStoreState();
        expect(tokenUsage).toEqual({
          contextTokens: 0,
          contextAccurate: false,
          contextSource: null,
          totalPromptTokens: 180,
          totalCompletionTokens: 90,
          totalApiTokens: 270,
          lastPromptTokens: 80,
          lastCompletionTokens: 40,
        });
      });
    });
  });

  describe('error recovery', () => {
    describe('dismissError', () => {
      it('should clear error and set idle', () => {
        useAgentStore.setState({ status: 'error', error: 'Something failed' });

        getStoreState().dismissError();

        const state = getStoreState();
        expect(state.status).toBe('idle');
        expect(state.error).toBeNull();
      });
    });

    describe('setError', () => {
      it('should finalize response and set error state', () => {
        getStoreState().appendText('Partial response');
        getStoreState().setError('Connection lost');

        const state = getStoreState();
        expect(state.status).toBe('error');
        expect(state.error).toBe('Connection lost');
        // Partial response should be finalized
        expect(state.messages).toHaveLength(1);
        expect(state.currentContent).toHaveLength(0);
      });
    });
  });
});

