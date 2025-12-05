/**
 * useSSE Hook - EventSource connection manager for SSE streaming.
 * Connects to /api/stream/:id and dispatches events to the store.
 */

import { useEffect, useRef } from 'react';
import { useAgentStore, type ToolCall } from '../store/useAgentStore';

/** Token usage from API response (for cost tracking) */
interface TokenUsageEvent {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** Context estimate from pre-send token counting (accurate context window size) */
interface ContextEstimateEvent {
  contextTokens: number;
  accurate: boolean;
  source: 'tiktoken' | 'heuristic';
}

/** Stream event from server (matches server/src/types.ts StreamEvent) */
interface StreamEvent {
  type: 'text_delta' | 'tool_call' | 'tool_result' | 'error' | 'done' | 'usage' | 'context';
  text?: string;
  toolCall?: ToolCall;
  error?: string;
  usage?: TokenUsageEvent;
  context?: ContextEstimateEvent;
}

const API_BASE = 'http://localhost:3001/api';

/**
 * Hook that manages SSE connection to the agent stream.
 * Automatically connects when sessionId is set and dispatches events to store.
 */
export function useSSE(): void {
  const sessionId = useAgentStore((state) => state.sessionId);
  const status = useAgentStore((state) => state.status);
  const appendText = useAgentStore((state) => state.appendText);
  const addToolCall = useAgentStore((state) => state.addToolCall);
  const updateToolResult = useAgentStore((state) => state.updateToolResult);
  const updateContextEstimate = useAgentStore((state) => state.updateContextEstimate);
  const updateApiUsage = useAgentStore((state) => state.updateApiUsage);
  const finalizeResponse = useAgentStore((state) => state.finalizeResponse);
  const setError = useAgentStore((state) => state.setError);

  // Track EventSource instance
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Only connect when we have a session and are streaming
    if (!sessionId || status !== 'streaming') {
      return;
    }

    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    console.log(`[SSE] Connecting to session: ${sessionId}`);
    const eventSource = new EventSource(`${API_BASE}/stream/${sessionId}`);
    eventSourceRef.current = eventSource;

    /**
     * Handle incoming SSE events by type.
     * Server sends events with event: type and data: JSON payload.
     */

    // Handle text_delta events - streaming text from assistant
    eventSource.addEventListener('text_delta', (event) => {
      try {
        const data: StreamEvent = JSON.parse(event.data);
        if (data.text) {
          appendText(data.text);
        }
      } catch (err) {
        console.error('[SSE] Failed to parse text_delta:', err);
      }
    });

    // Handle tool_call events - new tool invocation
    eventSource.addEventListener('tool_call', (event) => {
      try {
        const data: StreamEvent = JSON.parse(event.data);
        if (data.toolCall) {
          addToolCall(data.toolCall);
        }
      } catch (err) {
        console.error('[SSE] Failed to parse tool_call:', err);
      }
    });

    // Handle tool_result events - tool execution complete
    eventSource.addEventListener('tool_result', (event) => {
      try {
        const data: StreamEvent = JSON.parse(event.data);
        if (data.toolCall) {
          updateToolResult(
            data.toolCall.id,
            data.toolCall.result,
            data.toolCall.error
          );
        }
      } catch (err) {
        console.error('[SSE] Failed to parse tool_result:', err);
      }
    });

    // Handle context events - accurate context window estimate (from pre-send token counting)
    eventSource.addEventListener('context', (event) => {
      try {
        const data: StreamEvent = JSON.parse(event.data);
        if (data.context) {
          updateContextEstimate(data.context);
        }
      } catch (err) {
        console.error('[SSE] Failed to parse context:', err);
      }
    });

    // Handle usage events - API-reported token usage (for cost tracking)
    eventSource.addEventListener('usage', (event) => {
      try {
        const data: StreamEvent = JSON.parse(event.data);
        if (data.usage) {
          updateApiUsage(data.usage);
        }
      } catch (err) {
        console.error('[SSE] Failed to parse usage:', err);
      }
    });

    // Handle error events
    eventSource.addEventListener('error', (event) => {
      // Check if this is a server-sent error event with data
      if (event instanceof MessageEvent && event.data) {
        try {
          const data: StreamEvent = JSON.parse(event.data);
          if (data.error) {
            console.error('[SSE] Server error:', data.error);
            setError(data.error);
          }
        } catch {
          // Not a JSON error, likely a connection error
          console.error('[SSE] Connection error');
        }
      }
    });

    // Handle done event - stream complete
    eventSource.addEventListener('done', () => {
      console.log('[SSE] Stream complete');
      finalizeResponse();
      eventSource.close();
      eventSourceRef.current = null;
    });

    // Handle connection errors
    eventSource.onerror = (err) => {
      // Don't log error if we're closing intentionally
      if (eventSource.readyState === EventSource.CLOSED) {
        return;
      }
      console.error('[SSE] Connection error:', err);
      // EventSource will automatically try to reconnect
      // We don't set error state here to allow reconnection
    };

    // Cleanup on unmount or sessionId change
    return () => {
      console.log('[SSE] Closing connection');
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [
    sessionId,
    status,
    appendText,
    addToolCall,
    updateToolResult,
    updateContextEstimate,
    updateApiUsage,
    finalizeResponse,
    setError,
  ]);
}

