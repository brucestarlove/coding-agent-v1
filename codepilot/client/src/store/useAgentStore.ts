/**
 * Zustand store for CodePilot agent state management.
 * Handles session state, messages, streaming, and tool calls.
 */

import { create } from 'zustand';

// ============================================================================
// Types (mirroring server/src/types.ts for client use)
// ============================================================================

/** Tool call made by the AI agent */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'pending' | 'completed' | 'error';
  result?: unknown;
  error?: string;
}

/** A message in the conversation */
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Tool calls associated with this message (for assistant messages) */
  toolCalls?: ToolCall[];
}

/** Agent status states */
export type AgentStatus = 'idle' | 'streaming' | 'error';

// ============================================================================
// Store Interface
// ============================================================================

interface AgentState {
  // Session state
  sessionId: string | null;
  status: AgentStatus;
  error: string | null;

  // Message state
  messages: Message[];
  /** Accumulates streaming text from assistant */
  currentText: string;
  /** Tool calls for the current assistant response */
  currentToolCalls: ToolCall[];

  // Actions
  sendMessage: (text: string) => Promise<void>;
  stopAgent: () => Promise<void>;
  clearSession: () => void;

  // Streaming handlers (called by useSSE hook)
  appendText: (text: string) => void;
  addToolCall: (toolCall: ToolCall) => void;
  updateToolResult: (id: string, result: unknown, error?: string) => void;
  finalizeResponse: () => void;
  setError: (error: string) => void;
}

// ============================================================================
// API Configuration
// ============================================================================

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

// ============================================================================
// Store Implementation
// ============================================================================

export const useAgentStore = create<AgentState>((set, get) => ({
  // Initial state
  sessionId: null,
  status: 'idle',
  error: null,
  messages: [],
  currentText: '',
  currentToolCalls: [],

  /**
   * Send a message to start a new conversation or continue existing one.
   * Creates a new session via POST /api/chat and returns immediately.
   * Events are streamed via SSE in useSSE hook.
   */
  sendMessage: async (text: string) => {
    const { status } = get();

    // Prevent sending while already streaming
    if (status === 'streaming') {
      console.warn('[Store] Cannot send while streaming');
      return;
    }

    // Add user message to history
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    set({
      messages: [...get().messages, userMessage],
      status: 'streaming',
      error: null,
      currentText: '',
      currentToolCalls: [],
    });

    try {
      // Start new conversation via API
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      set({ sessionId: data.sessionId });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[Store] Failed to send message:', errorMessage);
      set({
        status: 'error',
        error: errorMessage,
      });
    }
  },

  /**
   * Stop the running agent via POST /api/stop/:id
   */
  stopAgent: async () => {
    const { sessionId, status } = get();

    if (!sessionId || status !== 'streaming') {
      console.warn('[Store] No active session to stop');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/stop/${sessionId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        // Get error details from response if available
        let errorDetails = `${response.status} ${response.statusText}`;
        try {
          const errorBody = await response.text();
          if (errorBody) {
            errorDetails += `: ${errorBody}`;
          }
        } catch {
          // Ignore errors reading response body
        }

        const errorMessage = `Stop failed: ${errorDetails}`;
        console.error('[Store] Failed to stop agent:', errorMessage);

        // Ensure store state is updated even on failure
        get().finalizeResponse();
        set({ status: 'idle' });
        return;
      }

      // Finalize any pending response
      get().finalizeResponse();
      set({ status: 'idle' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[Store] Failed to stop agent:', errorMessage);

      // Ensure store state is updated even on failure
      get().finalizeResponse();
      set({ status: 'idle' });
    }
  },

  /**
   * Clear the current session and start fresh
   */
  clearSession: () => {
    set({
      sessionId: null,
      status: 'idle',
      error: null,
      messages: [],
      currentText: '',
      currentToolCalls: [],
    });
  },

  /**
   * Append streaming text delta to current response
   */
  appendText: (text: string) => {
    set({ currentText: get().currentText + text });
  },

  /**
   * Add a new tool call (status: pending)
   */
  addToolCall: (toolCall: ToolCall) => {
    set({
      currentToolCalls: [...get().currentToolCalls, toolCall],
    });
  },

  /**
   * Update a tool call with its result
   */
  updateToolResult: (id: string, result: unknown, error?: string) => {
    set({
      currentToolCalls: get().currentToolCalls.map((tc) =>
        tc.id === id
          ? {
              ...tc,
              status: error ? 'error' : 'completed',
              result: error ? undefined : result,
              error,
            }
          : tc
      ),
    });
  },

  /**
   * Finalize the current streaming response into a complete message
   */
  finalizeResponse: () => {
    const { currentText, currentToolCalls, messages } = get();

    // Only add message if there's content
    if (currentText || currentToolCalls.length > 0) {
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: currentText,
        timestamp: new Date(),
        toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
      };

      set({
        messages: [...messages, assistantMessage],
        currentText: '',
        currentToolCalls: [],
        status: 'idle',
      });
    } else {
      set({ status: 'idle' });
    }
  },

  /**
   * Set error state
   */
  setError: (error: string) => {
    // Finalize any partial response before showing error
    get().finalizeResponse();
    set({
      status: 'error',
      error,
    });
  },
}));

